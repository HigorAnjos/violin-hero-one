import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  isNative: false,
  platform: 'android',
  display: 'prompt' as string,
  answer: 'granted' as string,
  actionListener: undefined as ((event: { notification: { id: number } }) => void) | undefined,
  plugin: {
    checkPermissions: vi.fn(async () => ({ display: native.display })),
    requestPermissions: vi.fn(async () => ({ display: native.answer })),
    cancel: vi.fn(async () => undefined),
    schedule: vi.fn(async () => ({ notifications: [] })),
    createChannel: vi.fn(async () => undefined),
    addListener: vi.fn(async (_event: string, listener: (event: { notification: { id: number } }) => void) => {
      native.actionListener = listener;
      return { remove: native.remove };
    }),
  },
  remove: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.isNative, getPlatform: () => native.platform } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: native.plugin }));

import { REMINDER_ID_BASE, REMINDER_IDS, reminderDelivery, systemSettingsPath, weeklyNotifications } from './reminderDelivery';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  native.isNative = false;
  native.platform = 'android';
  native.display = 'prompt';
  native.answer = 'granted';
  native.actionListener = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('weeklyNotifications', () => {
  it('uma notificação por dia escolhido, toda semana no horário, domingo = 1 no plugin', () => {
    const list = weeklyNotifications({ enabled: true, time: '07:05', days: [0, 3, 6] });
    expect(list.map((n) => [n.id, n.schedule?.on])).toEqual([
      [REMINDER_ID_BASE, { weekday: 1, hour: 7, minute: 5 }],
      [REMINDER_ID_BASE + 3, { weekday: 4, hour: 7, minute: 5 }],
      [REMINDER_ID_BASE + 6, { weekday: 7, hour: 7, minute: 5 }],
    ]);
    expect(list[0]).toMatchObject({
      title: 'Hora do violino',
      body: expect.stringContaining('5 minutos'),
      isExactNotification: false,
      channelId: 'lembrete',
      smallIcon: 'ic_stat_reminder',
    });
  });

  it('desligado ou sem dia: nada', () => {
    expect(weeklyNotifications({ enabled: false, time: '19:30', days: [1, 2] })).toEqual([]);
    expect(weeklyNotifications({ enabled: true, time: '19:30', days: [] })).toEqual([]);
  });
});

describe('reminderDelivery na web', () => {
  it('não toca no plugin: permissão da página e escolha para o service worker', async () => {
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'default', requestPermission: vi.fn(async () => 'granted') }));
    const delivery = reminderDelivery();
    expect(delivery.native).toBe(false);
    expect(await delivery.permission()).toBe('prompt');
    expect(await delivery.request()).toBe(true);
    await delivery.apply({ enabled: true, time: '19:30', days: [1] });
    delivery.onOpen(vi.fn())();
    expect(native.plugin.schedule).not.toHaveBeenCalled();
    expect(native.plugin.requestPermissions).not.toHaveBeenCalled();
    expect(native.plugin.addListener).not.toHaveBeenCalled();
  });

  it('sem a API de notificação: não suportado', async () => {
    vi.stubGlobal('Notification', undefined);
    Reflect.deleteProperty(window, 'Notification');
    expect(await reminderDelivery().permission()).toBe('unsupported');
  });
});

describe('reminderDelivery no celular', () => {
  beforeEach(() => {
    native.isNative = true;
  });

  it('chega com o app fechado; pede a permissão do sistema só no request', async () => {
    const delivery = reminderDelivery();
    expect(delivery.native).toBe(true);
    expect(delivery.support()).toBe('background');
    expect(await delivery.permission()).toBe('prompt');
    expect(native.plugin.requestPermissions).not.toHaveBeenCalled();
    expect(await delivery.request()).toBe(true);
    native.answer = 'denied';
    expect(await delivery.request()).toBe(false);
    native.display = 'denied';
    expect(await delivery.permission()).toBe('denied');
    native.display = 'prompt-with-rationale';
    expect(await delivery.permission()).toBe('prompt');
  });

  it('agendar troca as sete notificações do lembrete pelas da escolha, no canal próprio', async () => {
    native.display = 'granted';
    await reminderDelivery().apply({ enabled: true, time: '19:30', days: [1, 5] });
    expect(native.plugin.cancel).toHaveBeenCalledWith({ notifications: REMINDER_IDS.map((id) => ({ id })) });
    expect(native.plugin.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'lembrete', name: 'Lembrete de prática' }));
    const scheduled = native.plugin.schedule.mock.calls[0] as unknown as [{ notifications: { id: number }[] }];
    expect(scheduled[0].notifications.map((n) => n.id)).toEqual([REMINDER_ID_BASE + 1, REMINDER_ID_BASE + 5]);
    expect(native.plugin.cancel.mock.invocationCallOrder[0]).toBeLessThan(native.plugin.schedule.mock.invocationCallOrder[0]);
  });

  it('desligar só cancela; sem permissão não agenda', async () => {
    native.display = 'granted';
    await reminderDelivery().apply({ enabled: false, time: '19:30', days: [1] });
    expect(native.plugin.cancel).toHaveBeenCalledOnce();
    native.display = 'denied';
    await reminderDelivery().apply({ enabled: true, time: '19:30', days: [1] });
    expect(native.plugin.schedule).not.toHaveBeenCalled();
  });

  it('no iOS não cria canal (é coisa do Android)', async () => {
    native.platform = 'ios';
    native.display = 'granted';
    await reminderDelivery().apply({ enabled: true, time: '19:30', days: [1] });
    expect(native.plugin.createChannel).not.toHaveBeenCalled();
    expect(native.plugin.schedule).toHaveBeenCalledOnce();
  });

  it('falha do plugin não estoura', async () => {
    native.display = 'granted';
    native.plugin.schedule.mockRejectedValueOnce(new Error('sem suporte'));
    await expect(reminderDelivery().apply({ enabled: true, time: '19:30', days: [1] })).resolves.toBeUndefined();
    native.plugin.checkPermissions.mockRejectedValueOnce(new Error('x'));
    expect(await reminderDelivery().permission()).toBe('unsupported');
    native.plugin.requestPermissions.mockRejectedValueOnce(new Error('x'));
    expect(await reminderDelivery().request()).toBe(false);
  });

  it('tocar numa notificação do lembrete avisa; outra notificação, não; cancelar remove', async () => {
    const listener = vi.fn();
    const stop = reminderDelivery().onOpen(listener);
    await flush();
    native.actionListener?.({ notification: { id: REMINDER_ID_BASE + 2 } });
    native.actionListener?.({ notification: { id: 1 } });
    expect(listener).toHaveBeenCalledOnce();
    stop();
    await flush();
    expect(native.remove).toHaveBeenCalledOnce();
    native.actionListener?.({ notification: { id: REMINDER_ID_BASE } });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('o caminho dos ajustes muda com o sistema', () => {
    expect(systemSettingsPath()).toMatch(/^Configurações > Apps > Violin Hero/);
    native.platform = 'ios';
    expect(systemSettingsPath()).toBe('Ajustes > Violin Hero > Notificações');
  });
});
