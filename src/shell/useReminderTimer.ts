import React from 'react';
import { loadReminder, nextReminder, showReminder } from '../services/reminder';

/** Avisado pela tela do Lembrete quando a escolha muda: o timer recomeça com ela. */
export const REMINDER_CHANGED = 'vh:lembrete-mudou';

/**
 * Com o app aberto (mesmo noutra aba), o lembrete sai na hora certa por um timer. Fechado, quem cuida é o service
 * worker (public/reminder-sw.js), onde o navegador deixa.
 */
export function useReminderTimer(): void {
  React.useEffect(() => {
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      const at = nextReminder(loadReminder());
      if (!at) return;
      timer = window.setTimeout(() => {
        void showReminder().finally(schedule);
      }, at.getTime() - Date.now());
    };
    schedule();
    addEventListener(REMINDER_CHANGED, schedule);
    return () => {
      window.clearTimeout(timer);
      removeEventListener(REMINDER_CHANGED, schedule);
    };
  }, []);
}
