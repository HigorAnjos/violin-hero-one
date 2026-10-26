import { describe, it, expect } from 'vitest';
import { createFakeEar } from './fakeEar';
import { MicGuard } from './MicGuard';
import { ROUTES } from './routes';
import { renderScreen } from './testing';

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
});
