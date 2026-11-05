import { afterEach, describe, it, expect, vi } from 'vitest';
import { PORTRAIT_QUERY } from '../assets/styles/media';
import { createFakeEar } from './fakeEar';
import { MicGuard } from './MicGuard';
import { ROUTES } from './routes';
import { renderScreen } from './testing';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MicGuard', () => {
  it.each([ROUTES.home, ROUTES.modes, ROUTES.library, ROUTES.level])('fecha o microfone em %s', (path) => {
    const ear = createFakeEar();
    renderScreen(<MicGuard />, { ear, path });
    expect(ear.stopped).toBe(1);
  });

  it.each([ROUTES.calibration, ROUTES.game, ROUTES.results, ROUTES.countdown])('deixa aberto em %s', (path) => {
    const ear = createFakeEar();
    renderScreen(<MicGuard />, { ear, path });
    expect(ear.stopped).toBe(0);
  });

  it.each([ROUTES.calibration, ROUTES.game, ROUTES.results, ROUTES.taskResult])('fecha o microfone em %s com o celular em pé', (path) => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query === PORTRAIT_QUERY, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    );
    const ear = createFakeEar();
    renderScreen(<MicGuard />, { ear, path });
    expect(ear.stopped).toBe(1);
  });
});
