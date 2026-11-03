import { act, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveReminder } from '../services/reminder';
import { ROUTES } from './routes';
import { useReminderOpen, useReminderTimer } from './useReminderTimer';

const delivery = vi.hoisted(() => ({
  native: true,
  apply: vi.fn(async () => undefined),
  open: undefined as (() => void) | undefined,
  stop: vi.fn(),
}));

vi.mock('../services/reminderDelivery', () => ({
  reminderDelivery: () => ({
    native: delivery.native,
    apply: delivery.apply,
    onOpen: (listener: () => void) => {
      delivery.open = listener;
      return delivery.stop;
    },
  }),
}));

beforeEach(() => {
  delivery.native = true;
  delivery.open = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('useReminderTimer no celular', () => {
  it('sem timer da página: refaz a agenda do sistema com a escolha guardada ao abrir', () => {
    vi.useFakeTimers();
    const Fake = Object.assign(vi.fn(), { permission: 'granted' });
    vi.stubGlobal('Notification', Fake);
    saveReminder({ enabled: true, time: '20:30', days: [1] });
    vi.setSystemTime(new Date(2026, 9, 26, 20, 0));
    renderHook(() => useReminderTimer());
    expect(delivery.apply).toHaveBeenCalledExactlyOnceWith({ enabled: true, time: '20:30', days: [1] });
    act(() => void vi.advanceTimersByTime(60 * 60 * 1000));
    expect(Fake).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('useReminderOpen', () => {
  const Where: React.FC = () => {
    useReminderOpen();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    return (
      <>
        <output data-testid="where">{pathname}</output>
        <button type="button" onClick={() => navigate(ROUTES.game)}>
          jogo
        </button>
      </>
    );
  };
  const mount = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );

  it('tocar na notificação abre a tela inicial', () => {
    mount(ROUTES.settings);
    act(() => delivery.open?.());
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });

  it('no meio da partida, fica onde está', () => {
    mount(ROUTES.library);
    act(() => screen.getByRole('button', { name: 'jogo' }).click());
    act(() => delivery.open?.());
    expect(screen.getByTestId('where')).toHaveTextContent(ROUTES.game);
  });

  it('desmontar para de escutar', () => {
    mount(ROUTES.settings).unmount();
    expect(delivery.stop).toHaveBeenCalledOnce();
  });
});
