import { LocalNotifications, type LocalNotificationSchema, type Weekday as PluginWeekday } from '@capacitor/local-notifications';
import { isNative, nativePlatform } from './platform';
import {
  ensurePermission,
  REMINDER_BODY,
  REMINDER_TITLE,
  reminderSupport,
  syncReminderWorker,
  type Reminder,
  type ReminderSupport,
  type Weekday,
} from './reminder';

/** 'prompt': ainda não perguntado (ou dá para perguntar de novo); 'unsupported': o aparelho não notifica. */
export type ReminderPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

/**
 * Como o lembrete chega ao aparelho. Na web, notificação da página e do service worker (reminder.ts); no celular,
 * notificação local agendada no sistema pelo plugin do Capacitor, que sai mesmo com o app fechado.
 */
export interface ReminderDelivery {
  readonly native: boolean;
  support(): ReminderSupport;
  permission(): Promise<ReminderPermission>;
  /** Pede a permissão (só quando o jogador liga o lembrete); devolve se pode notificar. */
  request(): Promise<boolean>;
  /** Passa a escolha para quem entrega: o service worker na web, a agenda do sistema no celular. */
  apply(reminder: Reminder): Promise<void>;
  /** O jogador tocou na notificação do lembrete (celular); na web, nunca chama. Devolve o cancelar. */
  onOpen(listener: () => void): () => void;
}

/** Ids fixos, um por dia da semana (domingo = base): reagendar troca sempre as mesmas sete notificações. */
export const REMINDER_ID_BASE = 7300;
export const REMINDER_IDS: readonly number[] = Array.from({ length: 7 }, (_, day) => REMINDER_ID_BASE + day);
/** Canal próprio no Android: aparece com este nome nos ajustes de notificação do app. */
export const REMINDER_CHANNEL = 'lembrete';
/** Ícone pequeno da barra de status (android/app/src/main/res/drawable): o Android pede silhueta de uma cor. */
export const REMINDER_SMALL_ICON = 'ic_stat_reminder';

/**
 * As notificações da semana para o plugin: uma por dia escolhido, repetindo toda semana no horário do aparelho.
 * Sem alarme exato (isExactNotification: false): uns minutos de folga não fazem diferença num lembrete de prática, e
 * o alarme exato pede permissão especial no Android 12+ que a Play só aceita para app de despertador e agenda.
 */
export function weeklyNotifications(reminder: Reminder): LocalNotificationSchema[] {
  if (!reminder.enabled) return [];
  const [hour, minute] = reminder.time.split(':').map(Number);
  return reminder.days.map((day: Weekday) => ({
    id: REMINDER_ID_BASE + day,
    title: REMINDER_TITLE,
    body: REMINDER_BODY,
    // No plugin o domingo é 1 (no Date#getDay, 0)
    schedule: { on: { weekday: (day + 1) as PluginWeekday, hour, minute }, allowWhileIdle: true },
    isExactNotification: false,
    channelId: REMINDER_CHANNEL,
    smallIcon: REMINDER_SMALL_ICON,
    autoCancel: true,
  }));
}

/** Onde ligar as notificações de volta quando foram negadas, no texto do sistema de cada um. */
export function systemSettingsPath(): string {
  return nativePlatform() === 'ios'
    ? 'Ajustes > Violin Hero > Notificações'
    : 'Configurações > Apps > Violin Hero > Notificações';
}

const web: ReminderDelivery = {
  native: false,
  support: reminderSupport,
  async permission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'default') return 'prompt';
    return Notification.permission;
  },
  request: ensurePermission,
  apply: syncReminderWorker,
  onOpen: () => () => undefined,
};

const fromPlugin = (state: string): ReminderPermission =>
  state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';

let channelReady: Promise<void> | null = null;

const native: ReminderDelivery = {
  native: true,
  support: () => 'background',
  async permission() {
    try {
      return fromPlugin((await LocalNotifications.checkPermissions()).display);
    } catch {
      return 'unsupported';
    }
  },
  async request() {
    try {
      // Android 13+: é aqui que o sistema mostra o pedido de POST_NOTIFICATIONS; no iOS, o de notificações
      return (await LocalNotifications.requestPermissions()).display === 'granted';
    } catch {
      return false;
    }
  },
  async apply(reminder) {
    try {
      await LocalNotifications.cancel({ notifications: REMINDER_IDS.map((id) => ({ id })) });
      const notifications = weeklyNotifications(reminder);
      if (!notifications.length) return;
      // Sem permissão o sistema recusa o agendamento; ele é refeito ao abrir o app e ao ligar de novo
      if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
      if (nativePlatform() === 'android') {
        channelReady ??= LocalNotifications.createChannel({ id: REMINDER_CHANNEL, name: 'Lembrete de prática', importance: 3 });
        await channelReady;
      }
      await LocalNotifications.schedule({ notifications });
    } catch {
      // O plugin falhou (aparelho sem suporte): o lembrete só não sai, o resto do app segue
      channelReady = null;
    }
  },
  onOpen(listener) {
    let stopped = false;
    const handle = LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
      if (!stopped && REMINDER_IDS.includes(notification.id)) listener();
    });
    return () => {
      stopped = true;
      void handle.then((h) => h.remove()).catch(() => undefined);
    };
  },
};

/** No celular, o plugin de notificação local; na web, o caminho de sempre. */
export function reminderDelivery(): ReminderDelivery {
  return isNative() ? native : web;
}
