import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { ODE } from '../game/engine/testing';
import type { Song } from '../game/notation/song';
import { loadEarnedBadges } from '../services/badges';
import type { EarAudio } from '../shell/Ear';
import { createFakeEar, type FakeEar } from '../shell/fakeEar';
import type { PlayState } from '../shell/play';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import type { GameDeps } from '../shell/useGame';
import { Gameplay } from './Gameplay';

// Partida inteira com motor e pista: sob carga (CI, suíte em paralelo) passa dos 5 s padrão
vi.setConfig({ testTimeout: 15_000 });

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

const track = { canvas: {} as HTMLCanvasElement, update: vi.fn(), onJudgment: vi.fn(), setNotes: vi.fn(), setLook: vi.fn(), resize: vi.fn(), destroy: vi.fn() };

function setup(search = '', state: PlayState = { song: FAST, mode: 'Arcade' }, overrides: Partial<GameDeps> = {}) {
  const ear: FakeEar = createFakeEar();
  const context = fakeContext();
  ear.provideAudio({ context, source: {}, stream: null } as unknown as EarAudio);
  const deps: Partial<GameDeps> = { loadTrack: vi.fn(async () => track), orchestra: null, clicks: () => () => undefined, ...overrides };
  renderScreen(<Gameplay deps={deps} />, { ear, path: `${ROUTES.game}${search}`, route: ROUTES.game, state, theme: palcoTheme });
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

describe('Gameplay', () => {
  it('falha ao desenhar mantém a partida avançando até o resultado', async () => {
    const { deps, run } = setup('?simular=0', undefined, { loadTrack: vi.fn().mockRejectedValue(new Error('cena indisponível')) });
    await waitFor(() => expect(deps.loadTrack).toHaveBeenCalled());
    run(12);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`${ROUTES.badge}|${ROUTES.results}`)), { timeout: 3000 });
  });

  it('monta placar, afinação, partitura e a pista sob demanda', async () => {
    const { deps } = setup();
    expect(await screen.findByRole('region', { name: 'Placar' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Afinação' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Partitura' })).toBeInTheDocument();
    await waitFor(() => expect(deps.loadTrack).toHaveBeenCalled());
  });

  it('?simular toca a música inteira; selo novo vai para a tela do selo', async () => {
    const { run } = setup('?simular=0');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    run(12);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.badge), { timeout: 3000 });
    expect(loadEarnedBadges()).toContain('primeira-musica');
  });

  it('erros demais param a orquestra: vai para "a orquestra parou"', async () => {
    const { run } = setup('?simular=0&erros=16');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    run(12);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.gameOver), { timeout: 3000 });
  });

  it('pausa suspende o áudio e o Continuar conta um compasso antes de voltar', async () => {
    const { context } = setup('?simular=0');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(screen.getByRole('dialog', { name: 'PAUSADO' })).toBeInTheDocument();
    expect(context.suspend).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByRole('timer')).toHaveTextContent('4');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 3000 });
    expect(context.resume).toHaveBeenCalled();
  });

  it('velocidade na pausa: avisa, confirma, a partida vira prática e termina sem selo', async () => {
    const { run } = setup('?simular=0');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    run(1.5);
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await userEvent.click(screen.getByRole('button', { name: '70%' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/conta como prática/);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await userEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 3000 });
    run(20);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.results), { timeout: 3000 });
    expect(loadEarnedBadges()).toEqual([]);
    const result = (window as Window & { __vhResult?: { laps?: unknown[]; badges: string[] } }).__vhResult;
    expect(result?.laps?.length).toBeGreaterThan(0);
    expect(result?.badges).toEqual([]);
  });

  it('ESC pausa', async () => {
    setup();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'PAUSADO' })).toBeInTheDocument();
  });

  it('aba escondida fecha o microfone e pausa; Continuar reabre no toque', async () => {
    const { ear } = setup();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    act(() => ear.close('hidden'));
    expect(screen.getByRole('dialog', { name: 'PAUSADO' })).toHaveTextContent(/O microfone fechou/);
    await userEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(ear.started).toBe(2);
  });

  it('aba escondida durante a contagem de volta: a contagem para e a pausa volta', async () => {
    const { ear, context } = setup();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await userEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByRole('timer')).toBeInTheDocument();
    act(() => ear.close('hidden'));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'PAUSADO' })).toHaveTextContent(/O microfone fechou/), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 1200));
    expect(context.resume).not.toHaveBeenCalled();
  });

  it('microfone bloqueado vai para a tela de problema', async () => {
    const ear = createFakeEar();
    ear.failNextStart('NotAllowedError');
    renderScreen(<Gameplay deps={{ loadTrack: vi.fn(), orchestra: null }} />, { ear, path: ROUTES.game, route: ROUTES.game });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/microfone\/problema\?motivo=sem-permissao/));
  });

  it('opções guardadas chegam na pista; mudar na pausa guarda e aplica na hora', async () => {
    localStorage.setItem('vh:ajustes', JSON.stringify({ noteNames: true }));
    const { deps } = setup();
    await waitFor(() => expect(deps.loadTrack).toHaveBeenCalled());
    expect(vi.mocked(deps.loadTrack!).mock.calls[0][1]).toMatchObject({ noteNames: true, patterns: false });
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Padrões para daltonismo' }));
    expect(track.setLook).toHaveBeenLastCalledWith({ patterns: true, noteNames: true });
    expect(JSON.parse(localStorage.getItem('vh:ajustes')!)).toMatchObject({ colorblind: true, noteNames: true });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mostrar linha de afinação' }));
    expect(screen.getByRole('region', { name: 'Afinação' }).querySelector('polyline')).toBeNull();
  });

  it('sair para músicas na pausa', async () => {
    setup();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sair para músicas' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });
});
