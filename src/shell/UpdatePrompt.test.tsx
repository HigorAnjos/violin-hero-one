import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AppUpdate } from './appUpdate';
import { ROUTES } from './routes';
import { renderScreen } from './testing';
import { UpdatePrompt } from './UpdatePrompt';

function fakeUpdate(waiting = false) {
  const listeners = new Set<() => void>();
  const update: AppUpdate = {
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    waiting: () => waiting,
    apply: vi.fn(),
  };
  const arrive = () =>
    act(() => {
      waiting = true;
      for (const l of listeners) l();
    });
  return { update, arrive };
}

const notice = () => screen.queryByRole('region', { name: 'Nova versão' });

describe('UpdatePrompt', () => {
  it('aparece no menu quando a versão nova chega, e Atualizar troca na hora', async () => {
    const { update, arrive } = fakeUpdate();
    renderScreen(<UpdatePrompt update={update} />, { path: ROUTES.home });
    expect(notice()).toBeNull();
    arrive();
    expect(notice()).toHaveTextContent('Nova versão do Violin Hero');
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(update.apply).toHaveBeenCalledOnce();
  });

  it.each([ROUTES.calibration, ROUTES.countdown, ROUTES.game, ROUTES.sheet, ROUTES.practice, ROUTES.results])('não interrompe a partida em %s', (path) => {
    const { update } = fakeUpdate(true);
    renderScreen(<UpdatePrompt update={update} />, { path });
    expect(notice()).toBeNull();
  });

  it('na biblioteca aparece; Depois esconde sem atualizar', async () => {
    const { update } = fakeUpdate(true);
    renderScreen(<UpdatePrompt update={update} />, { path: ROUTES.library });
    await userEvent.click(screen.getByRole('button', { name: 'Depois' }));
    expect(notice()).toBeNull();
    expect(update.apply).not.toHaveBeenCalled();
  });

  it('sem service worker (dev, testes), nada', () => {
    renderScreen(<UpdatePrompt />, { path: ROUTES.home });
    expect(notice()).toBeNull();
  });
});
