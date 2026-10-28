import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadReminder } from '../services/reminder';
import { renderScreen } from '../shell/testing';
import { REMINDER_CHANGED } from '../shell/useReminderTimer';
import { Reminder } from './Reminder';

function stubNotification(permission: NotificationPermission, answer: NotificationPermission) {
  const Fake = Object.assign(vi.fn(), { permission, requestPermission: vi.fn(async () => answer) });
  vi.stubGlobal('Notification', Fake);
  return Fake;
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('Reminder', () => {
  it('começa desligado, sem pedir permissão, com a prévia da notificação', () => {
    const Fake = stubNotification('default', 'granted');
    renderScreen(<Reminder />);
    expect(screen.getByRole('heading', { name: 'Lembrete de prática' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Lembrar de praticar/ })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Hora' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Minuto' })).toBeDisabled();
    expect(screen.getByRole('note', { name: 'Notificação do Violin Hero' })).toHaveTextContent('Hora do violino');
    expect(Fake.requestPermission).not.toHaveBeenCalled();
  });

  it('ligar pede permissão; com ela, guarda e avisa o timer', async () => {
    const Fake = stubNotification('default', 'granted');
    const changed = vi.fn();
    addEventListener(REMINDER_CHANGED, changed);
    renderScreen(<Reminder />);
    await userEvent.click(screen.getByRole('switch', { name: /Lembrar de praticar/ }));
    expect(Fake.requestPermission).toHaveBeenCalledOnce();
    expect(loadReminder().enabled).toBe(true);
    expect(changed).toHaveBeenCalled();
    removeEventListener(REMINDER_CHANGED, changed);
  });

  it('permissão negada: continua desligado e explica', async () => {
    stubNotification('default', 'denied');
    renderScreen(<Reminder />);
    await userEvent.click(screen.getByRole('switch', { name: /Lembrar de praticar/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/não deixou mostrar notificações/);
    expect(loadReminder().enabled).toBe(false);
  });

  it('horário e dias da semana', async () => {
    stubNotification('granted', 'granted');
    renderScreen(<Reminder />);
    await userEvent.click(screen.getByRole('switch', { name: /Lembrar de praticar/ }));
    const days = within(screen.getByRole('group', { name: 'Dias da semana' }));
    expect(days.getAllByRole('button').map((b) => b.textContent)).toEqual(['S', 'T', 'Q', 'Q', 'S', 'S', 'D']);
    await userEvent.click(days.getByRole('button', { name: 'domingo' }));
    await userEvent.click(days.getByRole('button', { name: 'segunda' }));
    expect(days.getByRole('button', { name: 'domingo' })).toHaveAttribute('aria-pressed', 'true');
    expect(loadReminder().days).toEqual([0, 2, 3, 4, 5]);
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '07' } });
    fireEvent.change(screen.getByLabelText('Minuto'), { target: { value: '15' } });
    expect(loadReminder().time).toBe('07:15');
    expect(within(screen.getByLabelText('Hora')).getAllByRole('option').map((o) => o.textContent)).toEqual(Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')));
    expect(within(screen.getByLabelText('Minuto')).getAllByRole('option')).toHaveLength(12);
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '23' } });
    expect(loadReminder().time).toBe('23:15');
    expect(screen.getByLabelText('Como o lembrete aparece no celular')).toHaveTextContent('23:15');
  });

  it('desligar não pede nada', async () => {
    localStorage.setItem('vh:lembrete', JSON.stringify({ enabled: true, time: '19:30', days: [1] }));
    const Fake = stubNotification('granted', 'granted');
    renderScreen(<Reminder />);
    await userEvent.click(screen.getByRole('switch', { name: /Lembrar de praticar/ }));
    expect(loadReminder().enabled).toBe(false);
    expect(Fake.requestPermission).not.toHaveBeenCalled();
  });
});
