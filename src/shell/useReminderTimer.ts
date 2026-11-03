import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadReminder, nextReminder, showReminder } from '../services/reminder';
import { reminderDelivery } from '../services/reminderDelivery';
import { needsMicrophone, ROUTES } from './routes';

/** Avisado pela tela do Lembrete quando a escolha muda: o timer recomeça com ela. */
export const REMINDER_CHANGED = 'vh:lembrete-mudou';

/**
 * Com o app aberto (mesmo noutra aba), o lembrete sai na hora certa por um timer. Fechado, quem cuida é o service
 * worker (public/reminder-sw.js), onde o navegador deixa. No celular o sistema entrega as notificações agendadas, com
 * o app aberto ou não: sem timer, só refaz a agenda ao abrir (a permissão pode ter voltado nos ajustes).
 */
export function useReminderTimer(): void {
  React.useEffect(() => {
    const delivery = reminderDelivery();
    if (delivery.native) {
      void delivery.apply(loadReminder());
      return;
    }
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

/**
 * Tocar na notificação do lembrete (celular) abre o app na tela inicial; no meio de uma tela que ouve o violino
 * (partida, calibração), fica onde está para não perder a música. Dentro do roteador.
 */
export function useReminderOpen(): void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const where = React.useRef(pathname);
  React.useEffect(() => {
    where.current = pathname;
  }, [pathname]);
  React.useEffect(
    () =>
      reminderDelivery().onOpen(() => {
        if (!needsMicrophone(where.current)) navigate(ROUTES.home);
      }),
    [navigate]
  );
}
