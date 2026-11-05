import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PORTRAIT_QUERY } from '../assets/styles/media';
import { LandscapeGate } from './LandscapeGate';
import { ROUTES } from './routes';
import { renderScreen } from './testing';

/** Celular em pé (`upright`) ou não: só o corte do retrato responde. */
function stubOrientation(upright: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: upright && query === PORTRAIT_QUERY, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
}

const Game = () => <p>partida</p>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LandscapeGate', () => {
  it.each([ROUTES.calibration, ROUTES.game, ROUTES.sheet, ROUTES.strings3d, ROUTES.practice, ROUTES.countdown, ROUTES.dictation])(
    'em pé, %s dá lugar ao aviso de girar e a tela nem monta',
    (path) => {
      stubOrientation(true);
      renderScreen(<LandscapeGate><Game /></LandscapeGate>, { path });
      expect(screen.getByRole('heading', { name: 'Gire o celular para tocar' })).toBeInTheDocument();
      expect(screen.queryByText('partida')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Menu/ })).toHaveAttribute('href', ROUTES.home);
    }
  );

  it('em pé, o editor pede para girar para escrever', () => {
    stubOrientation(true);
    renderScreen(<LandscapeGate><Game /></LandscapeGate>, { path: ROUTES.editor });
    expect(screen.getByRole('heading', { name: 'Gire o celular para escrever' })).toBeInTheDocument();
  });

  it.each([ROUTES.home, ROUTES.login, ROUTES.library, ROUTES.settings])('em pé, %s segue normal', (path) => {
    stubOrientation(true);
    renderScreen(<LandscapeGate><Game /></LandscapeGate>, { path });
    expect(screen.getByText('partida')).toBeInTheDocument();
  });

  it('deitado (ou no computador), a partida segue normal', () => {
    stubOrientation(false);
    renderScreen(<LandscapeGate><Game /></LandscapeGate>, { path: ROUTES.game });
    expect(screen.getByText('partida')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Gire o celular/ })).not.toBeInTheDocument();
  });
});
