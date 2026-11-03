import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadReminder } from '../services/reminder';
import { renderScreen } from '../shell/testing';
import { Reminder } from './Reminder';

const native = vi.hoisted(() => ({
  platform: 'android',
  display: 'prompt',
  answer: 'granted',
  resume: undefined as (() => void) | undefined,
  plugin: {
    checkPermissions: vi.fn(async () => ({ display: native.display })),
    requestPermissions: vi.fn(async () => {
      native.display = native.answer;
      return { display: native.answer };
    }),
    cancel: vi.fn(async () => undefined),
    schedule: vi.fn(async () => ({ notifications: [] })),
    createChannel: vi.fn(async () => undefined),
    addListener: vi.fn(async () => ({ remove: async () => undefined })),
  },
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => native.platform } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: native.plugin }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (event: string, listener: () => void) => {
      if (event === 'resume') native.resume = listener;
      return { remove: async () => undefined };
    },
  },
}));

beforeEach(() => {
  native.platform = 'android';
  native.display = 'prompt';
  native.answer = 'granted';
  native.resume = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Reminder no celular', () => {
  it('ainda não perguntado: explica que o celular vai perguntar, sem pedir nada', async () => {
    renderScreen(<Reminder />);
    expect(await screen.findByText(/o celular pergunta/)).toBeInTheDocument();
    expect(native.plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it('ligar pede a permissão do sistema e agenda a semana', async () => {
    renderScreen(<Reminder />);
    await userEvent.click(screen.getByRole('switch', { name: /Lembrar de praticar/ }));
    expect(native.plugin.requestPermissions).toHaveBeenCalledOnce();
    expect(loadReminder().enabled).toBe(true);
    expect(screen.getByText(/Notificações permitidas/)).toBeInTheDocument();
    await waitFor(() => expect(native.plugin.schedule).toHaveBeenCalled());
  });

  it('negado: continua desligado e mostra o caminho nos ajustes do sistema', async () => {
    native.answer = 'denied';
    renderScreen(<Reminder />);
    await userEvent.click(screen.getByRole('switch', { name: /Lembrar de praticar/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Configurações > Apps > Violin Hero > Notificações');
    expect(loadReminder().enabled).toBe(false);
  });

  it('negado antes (iOS): avisa ao abrir; liberado nos Ajustes, a volta ao app reagenda', async () => {
    native.platform = 'ios';
    native.display = 'denied';
    localStorage.setItem('vh:lembrete', JSON.stringify({ enabled: true, time: '19:30', days: [1] }));
    renderScreen(<Reminder />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Ajustes > Violin Hero > Notificações');
    native.display = 'granted';
    await act(async () => native.resume?.());
    await waitFor(() => expect(screen.getByText(/Notificações permitidas/)).toBeInTheDocument());
    await waitFor(() => expect(native.plugin.schedule).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
