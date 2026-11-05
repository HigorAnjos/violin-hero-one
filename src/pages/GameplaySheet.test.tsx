import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { ODE } from '../game/engine/testing';
import type { Song } from '../game/notation/song';
import type { EarAudio } from '../shell/Ear';
import { createFakeEar } from '../shell/fakeEar';
import { ROUTES } from '../shell/routes';
import { stubLandscapePhone } from '../shell/stubLandscape';
import { renderScreen } from '../shell/testing';
import type { GameDeps } from '../shell/useGame';
import { GameplaySheet, playingNote } from './GameplaySheet';

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

function setup(search = '', overrides: Partial<GameDeps> = {}) {
  const ear = createFakeEar();
  const context = { currentTime: 1, state: 'running', suspend: vi.fn(async () => undefined), resume: vi.fn(async () => undefined) };
  ear.provideAudio({ context, source: {}, stream: null } as unknown as EarAudio);
  const sheet = { canvas: {} as HTMLCanvasElement, update: vi.fn(), onJudgment: vi.fn(), resize: vi.fn(), destroy: vi.fn() };
  const deps: Partial<GameDeps> = { loadTrack: vi.fn(), loadSheet: vi.fn(async () => sheet), orchestra: null, clicks: () => () => undefined, ...overrides };
  renderScreen(<GameplaySheet deps={deps} />, { ear, path: `${ROUTES.sheet}${search}`, route: ROUTES.sheet, state: { song: FAST }, theme: palcoTheme });
  const run = (seconds: number) =>
    act(() => {
      for (let i = 0; i < seconds * 60; i++) {
        context.currentTime += 1 / 60;
        const pending = frames;
        frames = [];
        pending.forEach((cb) => cb(0));
      }
    });
  return { deps, sheet, run };
}

describe('GameplaySheet', () => {
  it('falha ao desenhar mantém a partida avançando até o resultado', async () => {
    const { deps, run } = setup('?simular=0', { loadSheet: vi.fn().mockRejectedValue(new Error('cena indisponível')) });
    await waitFor(() => expect(deps.loadSheet).toHaveBeenCalled());
    run(12);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`${ROUTES.badge}|${ROUTES.results}`)), { timeout: 3000 });
  });

  it('monta a faixa de partitura (não a pista), o cabeçalho e os painéis da 5b', async () => {
    const { deps } = setup();
    await waitFor(() => expect(deps.loadSheet).toHaveBeenCalled());
    expect(deps.loadTrack).not.toHaveBeenCalled();
    expect(screen.getByText('Modo Partitura')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Partitura' })).toHaveTextContent(/Partitura · Ré maior · 4\/4 · compasso 1 de/);
    expect(screen.getByRole('region', { name: 'Nota atual' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Afinação ao vivo' })).toBeInTheDocument();
  });

  it('a faixa recebe o relógio da partida e os julgamentos', async () => {
    const { deps, sheet, run } = setup('?simular=0');
    await waitFor(() => expect(deps.loadSheet).toHaveBeenCalled());
    const options = vi.mocked(deps.loadSheet!).mock.calls[0][1];
    expect(options.song).toBe(FAST);
    expect(options.clock.segments(10)).toHaveLength(1);
    run(3);
    expect(sheet.update).toHaveBeenCalled();
    expect(sheet.onJudgment).toHaveBeenCalled();
  });

  it('?simular toca a música inteira e sai da partida', async () => {
    const { run } = setup('?simular=0');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    run(12);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`${ROUTES.badge}|${ROUTES.results}`)), { timeout: 3000 });
  });

  it('pausa com o botão de 44 px; reiniciar volta para a contagem da partitura', async () => {
    setup();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(screen.getByRole('dialog', { name: 'PAUSADO' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar música' }));
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.countdown);
  });

  it('fora do celular deitado, sem o botão Painel', async () => {
    setup();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /painel/i })).not.toBeInTheDocument();
  });
});

describe('GameplaySheet no celular deitado: botão Painel', () => {
  beforeEach(() => stubLandscapePhone());

  it('começa com o painel; esconder dá a altura para a pauta, refaz a faixa e guarda a escolha', async () => {
    const { deps, sheet } = setup();
    await waitFor(() => expect(deps.loadSheet).toHaveBeenCalled());
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    const button = screen.getByRole('button', { name: 'Painel', pressed: true });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    // Ao lado do Pausar, no cabeçalho
    expect(screen.getByRole('button', { name: 'Pausar' }).parentElement).toContainElement(button);
    sheet.resize.mockClear();
    await userEvent.click(button);
    // O painel some pelo CSS do celular deitado (o jsdom não aplica @media; o e2e mede)
    expect(screen.getByRole('button', { name: 'Painel', pressed: false })).toHaveAttribute('aria-pressed', 'false');
    expect(sheet.resize).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('vh:ajustes')!)).toMatchObject({ landscapePanel: false });
  });

  it('a escolha vale na próxima partida', async () => {
    localStorage.setItem('vh:ajustes', JSON.stringify({ landscapePanel: false }));
    setup();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: 'Painel', pressed: false })).toHaveAttribute('aria-pressed', 'false');
  });

  it('na pausa, um botão só, nos Ajustes rápidos, sem voltar o jogo', async () => {
    const { deps, sheet } = setup();
    await waitFor(() => expect(deps.loadSheet).toHaveBeenCalled());
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(screen.getAllByRole('button', { name: 'Painel', pressed: true })).toHaveLength(1);
    sheet.resize.mockClear();
    await userEvent.click(within(screen.getByRole('region', { name: 'Ajustes rápidos' })).getByRole('button', { name: 'Painel', pressed: true }));
    expect(sheet.resize).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'PAUSADO' })).toBeInTheDocument();
  });
});

describe('playingNote', () => {
  it('a duração em tempos no andamento de agora', () => {
    const note = { index: 0, noteIndex: 0, measure: 0, time: 0, duration: 1.2, midi: 74, string: 2, finger: 3, frequency: 590 } as const;
    expect(playingNote(note, ODE)).toMatchObject({ midi: 74, beats: 2 });
    expect(playingNote(note, ODE, 0.5)).toMatchObject({ beats: 1 });
    expect(playingNote(null, ODE)).toBeNull();
  });
});
