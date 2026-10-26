import { afterEach, describe, expect, it, vi } from 'vitest';
import { daysLabel, DEFAULT_REMINDER, ensurePermission, loadReminder, nextReminder, REMINDER_STORAGE_KEY, saveReminder, showReminder } from './reminder';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

// Segunda-feira, 26/10/2026, 18:00 no horário do aparelho
const MONDAY_18H = new Date(2026, 9, 26, 18, 0);

describe('lembrete: escolha guardada', () => {
  it('padrão: desligado, 19:30, dias úteis', () => {
    expect(loadReminder()).toEqual({ enabled: false, time: '19:30', days: [1, 2, 3, 4, 5] });
  });

  it('guarda e lê; lixo vira o padrão campo a campo', () => {
    saveReminder({ enabled: true, time: '07:05', days: [0, 6] });
    expect(loadReminder()).toEqual({ enabled: true, time: '07:05', days: [0, 6] });
    localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify({ enabled: 'sim', time: '25:00', days: [1, 9, 1, 'x'] }));
    expect(loadReminder()).toEqual({ ...DEFAULT_REMINDER, days: [1] });
    localStorage.setItem(REMINDER_STORAGE_KEY, '{oops');
    expect(loadReminder()).toEqual(DEFAULT_REMINDER);
  });
});

describe('nextReminder', () => {
  const on = { enabled: true, time: '19:30', days: [1, 2, 3, 4, 5] as const };

  it('hoje mais tarde, se hoje é um dos dias', () => {
    expect(nextReminder({ ...on, days: [...on.days] }, MONDAY_18H)).toEqual(new Date(2026, 9, 26, 19, 30));
  });

  it('passou da hora: o próximo dia escolhido', () => {
    expect(nextReminder({ ...on, days: [...on.days] }, new Date(2026, 9, 26, 19, 30))).toEqual(new Date(2026, 9, 27, 19, 30));
    // Sexta à noite → segunda
    expect(nextReminder({ ...on, days: [...on.days] }, new Date(2026, 9, 30, 20, 0))).toEqual(new Date(2026, 10, 2, 19, 30));
  });

  it('só um dia na semana: daqui a 7 dias se já passou hoje', () => {
    expect(nextReminder({ enabled: true, time: '08:00', days: [1] }, MONDAY_18H)).toEqual(new Date(2026, 10, 2, 8, 0));
  });

  it('desligado ou sem dia: nunca', () => {
    expect(nextReminder({ ...on, days: [...on.days], enabled: false }, MONDAY_18H)).toBeNull();
    expect(nextReminder({ ...on, days: [] }, MONDAY_18H)).toBeNull();
  });
});

describe('daysLabel', () => {
  it('nomes curtos para os grupos comuns e lista para o resto', () => {
    expect(daysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Todos os dias');
    expect(daysLabel([1, 2, 3, 4, 5])).toBe('Dias úteis');
    expect(daysLabel([6, 0])).toBe('Fim de semana');
    expect(daysLabel([1, 3, 5])).toBe('segunda, quarta e sexta');
    expect(daysLabel([0])).toBe('domingo');
    expect(daysLabel([])).toBe('Nenhum dia');
  });
});

describe('permissão e notificação', () => {
  function stubNotification(permission: NotificationPermission, answer: NotificationPermission = permission) {
    const shown: string[] = [];
    const Fake = vi.fn(function (this: unknown, title: string) {
      shown.push(title);
    }) as unknown as typeof Notification & { permission: NotificationPermission; requestPermission: () => Promise<NotificationPermission> };
    Fake.permission = permission;
    Fake.requestPermission = vi.fn(async () => answer);
    vi.stubGlobal('Notification', Fake);
    return { Fake, shown };
  }

  it('pede permissão só quando ainda não foi decidida', async () => {
    const asked = stubNotification('default', 'granted');
    expect(await ensurePermission()).toBe(true);
    expect(asked.Fake.requestPermission).toHaveBeenCalledOnce();
    const denied = stubNotification('denied');
    expect(await ensurePermission()).toBe(false);
    expect(denied.Fake.requestPermission).not.toHaveBeenCalled();
  });

  it('sem permissão, não mostra nada; com permissão, mostra uma vez por dia', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('caches', {
      open: async () => ({
        match: async (url: string) => (store.has(url) ? new Response(store.get(url)) : undefined),
        put: async (url: string, response: Response) => void store.set(url, await response.text()),
      }),
    });
    const blocked = stubNotification('denied');
    await showReminder(MONDAY_18H);
    expect(blocked.shown).toEqual([]);
    const allowed = stubNotification('granted');
    await showReminder(MONDAY_18H);
    await showReminder(MONDAY_18H);
    expect(allowed.shown).toEqual(['Hora do violino']);
  });
});
