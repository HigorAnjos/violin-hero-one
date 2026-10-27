import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { ODE } from '../game/engine/testing';
import type { Song } from '../game/notation/song';
import type { EarAudio } from '../shell/Ear';
import { createFakeEar, type FakeEar } from '../shell/fakeEar';
import type { PlayState } from '../shell/play';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { measureStarts, type GameDeps } from '../shell/useGame';
import { Gameplay3D } from './Gameplay3D';

const FAST: Song = { ...ODE, bpm: 240 };

function fakeContext() {
  const context = {
    currentTime: 1,
    state: 'running',
    suspend: vi.fn(async () => {
      context.state = 'suspended';
    }),
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
  };
  return context;
}

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

const strings = { canvas: {} as HTMLCanvasElement, update: vi.fn(), onJudgment: vi.fn(), setNotes: vi.fn(), setLook: vi.fn(), resize: vi.fn(), destroy: vi.fn() };

function setup(search = '', state: PlayState = { song: FAST, mode: 'Cordas 3D' }, overrides: Partial<GameDeps> = {}) {
  const ear: FakeEar = createFakeEar();
  const context = fakeContext();
  ear.provideAudio({ context, source: {}, stream: null } as unknown as EarAudio);
  const deps: Partial<GameDeps> = { loadTrack: vi.fn(), loadStrings3D: vi.fn(async () => strings), orchestra: null, clicks: () => () => undefined, ...overrides };
  renderScreen(<Gameplay3D deps={deps} />, { ear, path: `${ROUTES.strings3d}${search}`, route: ROUTES.strings3d, state, theme: palcoTheme });
  const run = (seconds: number) =>
    act(() => {
      for (let i = 0; i < seconds * 60; i++) {
        context.currentTime += 1 / 60;
        const pending = frames;
        frames = [];
        pending.forEach((cb) => cb(0));
      }
    });
  return { ear, context, deps, run };
}

describe('Gameplay3D', () => {
  it('falha da cena pausa o áudio e oferece Arcade com a mesma música', async () => {
    const { context } = setup('', { song: FAST, mode: 'Cordas 3D', noFail: true }, { loadStrings3D: vi.fn().mockRejectedValue(new Error('WebGL indisponível')) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para desenhar as Cordas 3D neste aparelho.');
    expect(context.suspend).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Tocar no Arcade' }));
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.countdown);
    expect(JSON.parse(screen.getByTestId('location').getAttribute('data-state')!)).toMatchObject({ song: FAST, mode: 'Arcade', next: '/jogo', noFail: true });
  });

  it('monta placar, afinação, partitura e as cordas 3D sob demanda, nunca a pista', async () => {
    const { deps } = setup();
    expect(await screen.findByRole('region', { name: 'Placar' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Afinação' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Partitura' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Cordas 3D/ })).toBeInTheDocument();
    await waitFor(() => expect(deps.loadStrings3D).toHaveBeenCalled());
    expect(deps.loadTrack).not.toHaveBeenCalled();
  });

  it('as cordas recebem o tema, as notas do motor, o relógio da música e os compassos', async () => {
    const { deps } = setup();
    await waitFor(() => expect(deps.loadStrings3D).toHaveBeenCalled());
    const options = vi.mocked(deps.loadStrings3D!).mock.calls[0][1];
    expect(options.theme).toBe(palcoTheme);
    expect(options.notes.length).toBeGreaterThan(0);
    expect(options.clock?.segments(0).length).toBeGreaterThan(0);
    expect(options.bars).toEqual(measureStarts(FAST));
  });

  it('?simular toca a música inteira, os julgamentos chegam nas cordas e o fim vai para o resultado', async () => {
    const { run } = setup('?simular=0');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    run(12);
    expect(strings.update).toHaveBeenCalled();
    expect(strings.onJudgment).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent(ROUTES.strings3d), { timeout: 3000 });
  });

  it('pausa pelo botão e pelo ESC', async () => {
    setup();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(screen.getByRole('dialog', { name: 'PAUSADO' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('?fps=1 mostra o medidor de quadros', async () => {
    const { deps } = setup('?fps=1');
    await waitFor(() => expect(deps.loadStrings3D).toHaveBeenCalled());
    const { onFps } = vi.mocked(deps.loadStrings3D!).mock.calls[0][1];
    act(() => onFps?.({ frames: 60, averageFps: 59.6, worstMs: 21 }));
    expect(screen.getByRole('status', { name: 'Quadros por segundo' })).toHaveTextContent('60 fps · pior 21 ms');
  });
});
