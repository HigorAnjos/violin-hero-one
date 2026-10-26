export const REMINDER_STORAGE_KEY = 'vh:lembrete';
/** Onde o service worker lê a escolha (ele não enxerga o localStorage); mesmo nome em public/reminder-sw.js. */
export const REMINDER_CACHE = 'vh-lembrete';
export const REMINDER_CACHE_URL = '/__lembrete.json';
export const REMINDER_SYNC_TAG = 'vh-lembrete';

/** Dia da semana como no Date#getDay: 0 = domingo. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Reminder {
  enabled: boolean;
  /** "HH:MM", horário do aparelho. */
  time: string;
  days: Weekday[];
}

export const DEFAULT_REMINDER: Readonly<Reminder> = { enabled: false, time: '19:30', days: [1, 2, 3, 4, 5] };

/** Segunda primeiro, como no design: S T Q Q S S D. */
export const WEEK: { day: Weekday; letter: string; name: string }[] = [
  { day: 1, letter: 'S', name: 'segunda' },
  { day: 2, letter: 'T', name: 'terça' },
  { day: 3, letter: 'Q', name: 'quarta' },
  { day: 4, letter: 'Q', name: 'quinta' },
  { day: 5, letter: 'S', name: 'sexta' },
  { day: 6, letter: 'S', name: 'sábado' },
  { day: 0, letter: 'D', name: 'domingo' },
];

export const REMINDER_TITLE = 'Hora do violino';
export const REMINDER_BODY = 'Só 5 minutos já contam. Bora tocar?';

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function loadReminder(): Reminder {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(REMINDER_STORAGE_KEY) ?? '{}');
    const value = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof Reminder, unknown>>) : {};
    const days = Array.isArray(value.days) ? value.days.filter((d): d is Weekday => Number.isInteger(d) && d >= 0 && d <= 6) : null;
    return {
      enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_REMINDER.enabled,
      time: typeof value.time === 'string' && TIME.test(value.time) ? value.time : DEFAULT_REMINDER.time,
      days: days ? [...new Set(days)].sort() : [...DEFAULT_REMINDER.days],
    };
  } catch {
    return { ...DEFAULT_REMINDER, days: [...DEFAULT_REMINDER.days] };
  }
}

export function saveReminder(reminder: Reminder): void {
  try {
    window.localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(reminder));
  } catch {
    // sem armazenamento: vale só para esta visita
  }
}

/** Próximo instante do lembrete a partir de `now` (exclusivo); null desligado ou sem dia escolhido. */
export function nextReminder(reminder: Reminder, now: Date = new Date()): Date | null {
  if (!reminder.enabled || !reminder.days.length) return null;
  const [h, m] = reminder.time.split(':').map(Number);
  for (let ahead = 0; ahead <= 7; ahead++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, h, m, 0, 0);
    if (at > now && reminder.days.includes(at.getDay() as Weekday)) return at;
  }
  return null;
}

/** "Todos os dias", "Dias úteis", "Fim de semana" ou a lista: "segunda, quarta e sexta". */
export function daysLabel(days: readonly Weekday[]): string {
  const set = new Set(days);
  if (set.size === 7) return 'Todos os dias';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d as Weekday))) return 'Dias úteis';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Fim de semana';
  const names = WEEK.filter((w) => set.has(w.day)).map((w) => w.name);
  if (!names.length) return 'Nenhum dia';
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

export type ReminderSupport = 'background' | 'open-app' | 'none';

/** Até onde o aparelho chega sem servidor de push: com a sincronização periódica, mesmo fechado; senão, só aberto. */
export function reminderSupport(): ReminderSupport {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'none';
  return 'serviceWorker' in navigator && 'PeriodicSyncManager' in window ? 'background' : 'open-app';
}

/** Pede permissão só quando o jogador liga; devolve se pode notificar. */
export async function ensurePermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

type PeriodicSync = { register(tag: string, options: { minInterval: number }): Promise<void>; unregister(tag: string): Promise<void> };

/**
 * Passa a escolha para o service worker e liga (ou desliga) a checagem periódica dele. Sem service worker (dev, aba
 * privada), não faz nada: o timer com o app aberto continua valendo.
 */
export async function syncReminderWorker(reminder: Reminder): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(REMINDER_CACHE);
      await cache.put(REMINDER_CACHE_URL, new Response(JSON.stringify({ ...reminder, title: REMINDER_TITLE, body: REMINDER_BODY })));
    }
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const periodic = (registration as (ServiceWorkerRegistration & { periodicSync?: PeriodicSync }) | undefined)?.periodicSync;
    if (!periodic) return;
    if (reminder.enabled) await periodic.register(REMINDER_SYNC_TAG, { minInterval: 60 * 60 * 1000 });
    else await periodic.unregister(REMINDER_SYNC_TAG);
  } catch {
    // Sem permissão para sincronizar (PWA não instalada): fica o timer com o app aberto
  }
}

/** O dia em que o lembrete saiu, no formato do worker: um lembrete por dia, saia ele do app ou do worker. */
export const REMINDER_LAST_URL = '/__lembrete-ultimo';
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Mostra a notificação pelo service worker (funciona no celular) ou, sem ele, pela API da página. */
export async function showReminder(now: Date = new Date()): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (typeof caches !== 'undefined') {
    const cache = await caches.open(REMINDER_CACHE);
    if ((await cache.match(REMINDER_LAST_URL).then((r) => r?.text())) === dayKey(now)) return;
    await cache.put(REMINDER_LAST_URL, new Response(dayKey(now)));
  }
  const options = { body: REMINDER_BODY, icon: '/icons/icon-192.png', tag: REMINDER_SYNC_TAG };
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registration) await registration.showNotification(REMINDER_TITLE, options);
  else new Notification(REMINDER_TITLE, options);
}
