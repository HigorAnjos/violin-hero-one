import { act, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PORTRAIT_QUERY } from '../assets/styles/media';
import { LandscapeGate } from './LandscapeGate';
import { ROUTES } from './routes';
import { renderScreen } from './testing';

/** Celular em pé ou não; `turn` gira e avisa quem ouve o corte, como o navegador. */
function stubOrientation(upright: boolean) {
  const state = { upright };
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return state.upright && query === PORTRAIT_QUERY;
      },
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    }))
  );
  return {
    turn(next: boolean) {
      state.upright = next;
      act(() => listeners.forEach((l) => l()));
    },
  };
}

let mounts = 0;
const Game = () => {
  React.useEffect(() => {
    mounts += 1;
  }, []);
  return <p>partida</p>;
};

afterEach(() => {
  vi.unstubAllGlobals();
  mounts = 0;
});

describe('LandscapeGate', () => {
  it.each([ROUTES.calibration, ROUTES.game, ROUTES.sheet, ROUTES.strings3d, ROUTES.practice, ROUTES.countdown, ROUTES.dictation])(
    'chegando em pé, %s dá lugar ao aviso de girar e a tela nem monta',
    (path) => {
      stubOrientation(true);
      renderScreen(<LandscapeGate><Game /></LandscapeGate>, { path });
      expect(screen.getByRole('heading', { name: 'Gire o celular para tocar' })).toBeInTheDocument();
      expect(screen.queryByText('partida')).not.toBeInTheDocument();
      expect(mounts).toBe(0);
      expect(screen.getByRole('link', { name: /Menu/ })).toHaveAttribute('href', ROUTES.home);
    }
  );

  it('em pé, o editor pede para girar para escrever', () => {
    stubOrientation(true);
    renderScreen(<LandscapeGate><Game /></LandscapeGate>, { path: ROUTES.editor });
    expect(screen.getByRole('heading', { name: 'Gire o celular para escrever' })).toBeInTheDocument();
  });

  it.each([ROUTES.home, ROUTES.login, ROUTES.library, ROUTES.settings, ROUTES.results, ROUTES.gameOver, ROUTES.badge, ROUTES.taskResult, ROUTES.diagnostics])(
    'em pé, %s segue normal',
    (path) => {
      stubOrientation(true);
      renderScreen(<LandscapeGate><Game /></LandscapeGate>, { path });
      expect(screen.getByText('partida')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /Gire o celular/ })).not.toBeInTheDocument();
    }
  );

  it('chegando em pé e deitando, a partida monta', () => {
    const phone = stubOrientation(true);
    renderScreen(<LandscapeGate><Game /></LandscapeGate>, { path: ROUTES.game });
    phone.turn(false);
    expect(screen.getByText('partida')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Gire o celular/ })).not.toBeInTheDocument();
    expect(mounts).toBe(1);
  });

  it('girada para em pé no meio, a partida fica montada com o aviso por cima e segue ao deitar', () => {
    const phone = stubOrientation(false);
    renderScreen(<LandscapeGate><Game /></LandscapeGate>, { path: ROUTES.game });
    expect(mounts).toBe(1);

    phone.turn(true);
    const cover = screen.getByRole('dialog', { name: 'Gire o celular para tocar' });
    expect(cover).toHaveTextContent('A partida está pausada');
    expect(screen.getByText('partida')).toBeInTheDocument();

    phone.turn(false);
    expect(screen.queryByRole('dialog', { name: /Gire o celular/ })).not.toBeInTheDocument();
    expect(screen.getByText('partida')).toBeInTheDocument();
    expect(mounts).toBe(1);
  });
});
