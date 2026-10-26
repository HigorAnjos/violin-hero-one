import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ODE } from '../game/engine/testing';
import type { Song } from '../game/notation/song';
import type { EarAudio } from '../shell/Ear';
import { createFakeEar } from '../shell/fakeEar';
import type { PlayState } from '../shell/play';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import type { GameDeps } from '../shell/useGame';
import { Practice } from './Practice';

const FAST: Song = { ...ODE, bpm: 240 };

let frames: FrameRequestCallback[] = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function setup(search = '', state: PlayState = { song: FAST }) {
  const ear = createFakeEar();
  const context = { currentTime: 1, state: 'running', suspend: vi.fn(async () => undefined), resume: vi.fn(async () => undefined) };
  ear.provideAudio({ context, source: {}, stream: null } as unknown as EarAudio);
  const sheet = { canvas: {} as HTMLCanvasElement, update: vi.fn(), onJudgment: vi.fn(), resize: vi.fn(), destroy: vi.fn() };
  const deps: Partial<GameDeps> = { loadTrack: vi.fn(), loadSheet: vi.fn(async () => sheet), orchestra: null, clicks: () => () => undefined };
  renderScreen(<Practice deps={deps} />, { ear, path: `${ROUTES.practice}${search}`, route: ROUTES.practice, state });
  const run = (seconds: number) =>
    act(() => {
      for (let i = 0; i < seconds * 60; i++) {
        context.currentTime += 1 / 60;
        const pending = frames;
        frames = [];
        pending.forEach((cb) => cb(0));
      }
    });
  return { deps, run };
}

describe('Practice', () => {
  it('sem trecho escolhido: a música inteira a 70%, na faixa de partitura', async () => {
    const { deps } = setup();
    await waitFor(() => expect(deps.loadSheet).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'A música inteira' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '70%' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Velocidade' })).toHaveTextContent(`${Math.round(240 * 0.7)} de 240 BPM`);
  });

  it('abre no trecho pedido (Results → Praticar compassos)', async () => {
    setup('', { song: FAST, practice: { loop: { startMeasure: 2, endMeasure: 3 }, speed: 0.85 } });
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    expect(screen.getByRole('heading', { name: 'Compassos 3–4 em loop' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Repetir o trecho/ })).toBeChecked();
    expect(screen.getByRole('button', { name: '85%' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('velocidade e laço comandam a prática', async () => {
    const { run } = setup('?simular=0');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    run(0.5);
    await userEvent.click(screen.getByRole('button', { name: '50%' }));
    run(0.2);
    expect(screen.getByRole('button', { name: '50%' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Fim (B) um compasso depois' }));
    await userEvent.click(screen.getByRole('switch', { name: /Repetir o trecho/ }));
    run(0.2);
    expect(screen.getByRole('heading', { name: 'Compassos 1–3 em loop' })).toBeInTheDocument();
  });

  it('?simular com laço: as passadas fecham e aparecem no gráfico; sair leva ao resultado com as voltas', async () => {
    const { run } = setup('?simular=0', { song: FAST, practice: { loop: { startMeasure: 0, endMeasure: 1 }, speed: 1 } });
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    run(12);
    expect(screen.getByRole('img', { name: /Precisão por passada: 100%, 100%/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Sair da prática/ }));
    run(0.1);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.results), { timeout: 3000 });
    const result = (window as Window & { __vhResult?: { laps?: unknown[]; badges: string[] } }).__vhResult;
    expect(result?.laps?.length).toBeGreaterThanOrEqual(2);
    expect(result?.badges).toEqual([]);
  });

  it('acelerar sozinho: duas passadas limpas sobem 5%', async () => {
    const { run } = setup('?simular=0', { song: FAST, practice: { loop: { startMeasure: 0, endMeasure: 0 }, speed: 0.7 } });
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('switch', { name: /Acelerar sozinho/ }));
    expect(screen.getByRole('region', { name: 'Velocidade' })).toHaveTextContent('168 de 240 BPM');
    run(7);
    // O efeito do "acelerar" roda depois do render: mais uns quadros para o HUD trazer a velocidade nova
    run(0.2);
    expect(screen.getByRole('region', { name: 'Velocidade' })).toHaveTextContent(/(180|192) de 240 BPM/);
  });
});
