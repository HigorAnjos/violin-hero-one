import React from 'react';
import styled from 'styled-components';
import { portrait } from '../assets/styles/media';
import { Kicker } from '../components/Screen/Screen';
import { Toggle } from '../components/Toggle/Toggle';
import { onAppResume } from '../services/platform';
import {
  daysLabel,
  loadReminder,
  REMINDER_BODY,
  REMINDER_TITLE,
  saveReminder,
  WEEK,
  type Reminder as ReminderChoice,
  type Weekday,
} from '../services/reminder';
import { reminderDelivery, systemSettingsPath, type ReminderPermission } from '../services/reminderDelivery';
import { REMINDER_CHANGED } from '../shell/useReminderTimer';

const Page = styled.section`
  grid-column: 1 / -1;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 1rem;

  @media (max-height: 500px) {
    gap: 1rem;
    grid-template-columns: minmax(0, 0.5fr) minmax(0, 1fr);
  }

  /* Em pé: o cartão primeiro e a prévia da notificação embaixo */
  ${portrait} {
    grid-template-columns: minmax(0, 1fr);

    > figure {
      order: 1;
    }
  }
`;

/** A tela de bloqueio do celular, em miniatura: a hora e a notificação como ela vai chegar. */
const Preview = styled.figure`
  min-width: 0;
  justify-self: center;
  width: min(100%, 24rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 2rem 1rem;
  border-radius: 2rem;
  background-color: ${({ theme }) => theme.art.halo};
  color: ${({ theme }) => theme.colors.text};

  > p {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 1rem;
    font-weight: 600;
  }

  > p b {
    font-size: 4.5rem;
    line-height: 1;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  @media (max-height: 500px) {
    gap: 0.75rem;
    padding: 1rem 0.75rem;
    border-radius: 1.25rem;

    > p b {
      font-size: 3rem;
    }
  }
`;

const Notice = styled.div`
  width: 100%;
  display: flex;
  gap: 0.75rem;
  padding: 0.875rem;
  border: 1.5px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 1.25rem;
  background-color: ${({ theme }) => theme.colors.surface};

  > span {
    flex: none;
    width: 2.375rem;
    height: 2.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5625rem;
    background-color: ${({ theme }) => theme.colors.background};
  }

  > div {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    font-size: 0.875rem;
    line-height: 1.1875rem;
  }

  small {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  b {
    font-weight: 700;
  }
`;

const Card = styled.section`
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 100%;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.card};

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.625rem;
    line-height: 2rem;
    color: ${({ theme }) => theme.colors.text};
  }

  > a {
    align-self: flex-start;
  }

  @media (max-height: 500px) {
    gap: 0.375rem;
    padding: 0.625rem 0.875rem;

    h1 {
      font-size: 1.25rem;
      line-height: 1.5rem;
    }
  }

  ${portrait} {
    max-height: none;
    overflow: visible;
    padding: 1rem 0.625rem;
  }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 2.75rem;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};

  select {
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0 0.625rem;
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: ${({ theme }) => theme.borderRadius.sm};
    background-color: ${({ theme }) => theme.colors.background};
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
  }

  select:disabled {
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Days = styled.div`
  display: flex;
  gap: 0.375rem;

  button {
    flex: 1;
    min-width: 0;
    min-height: 2.75rem;
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    font-weight: 600;
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  button[aria-pressed='true'] {
    border: 2px solid ${({ theme }) => theme.colors.info.main};
    background-color: ${({ theme }) => theme.colors.info.surface};
    color: ${({ theme }) => theme.colors.info.text};
    font-weight: 800;
  }

  button:disabled {
    cursor: default;
    opacity: 0.6;
  }

  /* Em pé: cada dia com 44 px de toque; no celular mais estreito os últimos descem de linha */
  ${portrait} {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(2.75rem, 1fr));
    gap: 0.125rem;
  }
`;

const Note = styled.p<{ $tone?: 'warning' }>`
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: ${({ theme, $tone }) => ($tone ? theme.colors.warning.text : theme.colors.textMuted)};

  @media (max-height: 500px) {
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

const SUPPORT_NOTE = {
  background: 'O lembrete chega mesmo com o Violin Hero fechado, se ele estiver instalado no aparelho.',
  'open-app': 'Neste navegador o lembrete só aparece com o Violin Hero aberto (pode ser em outra aba).',
  none: 'Este navegador não mostra notificações.',
} as const;

/** No celular: o que o sistema deixa, conferido ao abrir a tela e ao voltar dos ajustes do sistema. */
const NATIVE_NOTE: Partial<Record<ReminderPermission, string>> = {
  granted: 'Notificações permitidas. O lembrete chega mesmo com o Violin Hero fechado.',
  prompt: 'Ao ligar, o celular pergunta se o Violin Hero pode mandar notificações.',
  unsupported: 'Este aparelho não mostra notificações.',
};

function useReminder(): [ReminderChoice, (next: ReminderChoice) => void] {
  const [reminder, setReminder] = React.useState(loadReminder);
  const update = (next: ReminderChoice) => {
    setReminder(next);
    saveReminder(next);
    dispatchEvent(new Event(REMINDER_CHANGED));
    void reminderDelivery().apply(next);
  };
  return [reminder, update];
}

/** A permissão do sistema no celular; na web, null (a tela segue como antes, só avisa depois de negar). */
function useNativePermission(reminder: ReminderChoice): [ReminderPermission | null, (p: ReminderPermission) => void] {
  const [permission, setPermission] = React.useState<ReminderPermission | null>(null);
  const latest = React.useRef(reminder);
  React.useEffect(() => {
    latest.current = reminder;
  }, [reminder]);
  React.useEffect(() => {
    const delivery = reminderDelivery();
    if (!delivery.native) return;
    let alive = true;
    const check = () =>
      void delivery.permission().then((p) => {
        if (!alive) return;
        setPermission(p);
        // Liberado nos ajustes do sistema com o lembrete ligado: a agenda volta na hora
        if (p === 'granted' && latest.current.enabled) void delivery.apply(latest.current);
      });
    check();
    const stop = onAppResume(check);
    return () => {
      alive = false;
      stop();
    };
  }, []);
  return [permission, setPermission];
}

/**
 * 18 · Lembrete de prática: notificação local no horário e nos dias escolhidos, sem servidor de push. Na web, da PWA;
 * no celular, agendada no sistema.
 */
export const Reminder: React.FC = () => {
  const [delivery] = React.useState(reminderDelivery);
  const [reminder, update] = useReminder();
  const [blocked, setBlocked] = React.useState(false);
  const [support] = React.useState(delivery.support);
  const [permission, setPermission] = useNativePermission(reminder);

  const toggle = async (on: boolean) => {
    if (!on) return update({ ...reminder, enabled: false });
    // A permissão só é pedida aqui, quando o jogador liga
    const granted = await delivery.request();
    setBlocked(!granted);
    if (delivery.native) setPermission(granted ? 'granted' : 'denied');
    if (granted) update({ ...reminder, enabled: true });
  };
  const toggleDay = (day: Weekday) => {
    const days = reminder.days.includes(day) ? reminder.days.filter((d) => d !== day) : [...reminder.days, day].sort();
    update({ ...reminder, days });
  };

  return (
    <Page>
      <Preview aria-label="Como o lembrete aparece no celular">
        <p aria-hidden="true">
          {daysLabel(reminder.days)}
          <b>{reminder.time}</b>
        </p>
        <Notice role="note" aria-label="Notificação do Violin Hero">
          <span aria-hidden="true">🎻</span>
          <div>
            <small>
              <span>VIOLIN HERO</span>
              <span>agora</span>
            </small>
            <b>{REMINDER_TITLE}</b>
            <span>{REMINDER_BODY}</span>
          </div>
        </Notice>
      </Preview>

      <Card aria-labelledby="lembrete-titulo">
        <Kicker>Notificação</Kicker>
        <h1 id="lembrete-titulo">Lembrete de prática</h1>
        <Toggle label="Lembrar de praticar" hint={reminder.enabled ? `${daysLabel(reminder.days)} às ${reminder.time}` : 'Desligado'} checked={reminder.enabled} onChange={(on) => void toggle(on)} />
        <Row>
          Horário
          <span>
            <select aria-label="Hora" value={reminder.time.slice(0, 2)} disabled={!reminder.enabled} onChange={(e) => update({ ...reminder, time: `${e.target.value}:${reminder.time.slice(3)}` })}>
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((hour) => <option key={hour}>{hour}</option>)}
            </select>
            <span aria-hidden="true"> : </span>
            <select aria-label="Minuto" value={reminder.time.slice(3)} disabled={!reminder.enabled} onChange={(e) => update({ ...reminder, time: `${reminder.time.slice(0, 2)}:${e.target.value}` })}>
              {Array.from(new Set([...Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')), reminder.time.slice(3)])).sort().map((minute) => <option key={minute}>{minute}</option>)}
            </select>
          </span>
        </Row>
        <Days role="group" aria-label="Dias da semana">
          {WEEK.map((w) => (
            <button key={w.day} type="button" aria-label={w.name} aria-pressed={reminder.days.includes(w.day)} disabled={!reminder.enabled} onClick={() => toggleDay(w.day)}>
              {w.letter}
            </button>
          ))}
        </Days>
        {delivery.native && permission === 'denied' ? (
          <Note role="alert" $tone="warning">
            As notificações do Violin Hero estão desligadas no celular. Para ligar, abra {systemSettingsPath()} e volte
            aqui.
          </Note>
        ) : delivery.native ? (
          permission && <Note>{NATIVE_NOTE[permission]}</Note>
        ) : blocked ? (
          <Note role="alert" $tone="warning">
            O navegador não deixou mostrar notificações. Libere nas configurações do navegador e tente de novo.
          </Note>
        ) : (
          <Note>{SUPPORT_NOTE[support]}</Note>
        )}
        {reminder.enabled && !reminder.days.length && <Note $tone="warning">Escolha pelo menos um dia.</Note>}
      </Card>
    </Page>
  );
};
