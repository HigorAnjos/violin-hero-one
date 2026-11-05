import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { RecordingError, type Recorder, type Recording } from '../game/audio';
import { ODE } from '../game/engine/testing';
import type { Song } from '../game/notation/song';
import { loadEarnedBadges } from '../services/badges';
import { keepScreenOn } from '../services/platform';
import type { EarAudio } from '../shell/Ear';
import { createFakeEar, type FakeEar } from '../shell/fakeEar';
import type { PlayState } from '../shell/play';
import { ROUTES } from '../shell/routes';
import { stubLandscapePhone } from '../shell/stubLandscape';
import { renderScreen } from '../shell/testing';
import type { GameDeps } from '../shell/useGame';
import { devWindow } from '../shell/devTools';
import { Gameplay } from './Gameplay';

const screenOn = vi.hoisted(() => ({ release: vi.fn() }));
vi.mock('../services/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/platform')>()),
  keepScreenOn: vi.fn(() => screenOn.release),
}));

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

function setup(search = '', state: PlayState = { song: FAST, mode: 'Arcade' }, overrides: Partial<GameDeps> = {}, ear: FakeEar = createFakeEar()) {
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

  it('tela acesa (celular) da abertura ao fim da partida', async () => {
    vi.mocked(keepScreenOn).mockClear();
    screenOn.release.mockClear();
    const { run } = setup('?simular=0');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    expect(keepScreenOn).toHaveBeenCalledOnce();
    expect(screenOn.release).not.toHaveBeenCalled();
    run(12);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.badge), { timeout: 3000 });
    expect(screenOn.release).toHaveBeenCalledOnce();
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

  it('fora do celular deitado, sem o botão Pauta', async () => {
    setup();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /pauta/i })).not.toBeInTheDocument();
  });
});

describe('Gameplay no celular deitado: botão Pauta', () => {
  beforeEach(() => {
    stubLandscapePhone();
    track.resize.mockClear();
  });

  it('começa sem a pauta; ligar põe a pauta embaixo, encolhe a pista e guarda a escolha', async () => {
    const { deps } = setup();
    await waitFor(() => expect(deps.loadTrack).toHaveBeenCalled());
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    expect(vi.mocked(deps.loadTrack!).mock.calls[0][1]).toMatchObject({ width: 844, height: 390 });
    expect(screen.getByTestId('pista')).toHaveStyle({ height: '390px' });
    expect(screen.queryByRole('region', { name: 'Partitura' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar pauta' }));
    expect(screen.getByRole('button', { name: 'Esconder pauta' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Partitura' })).toBeInTheDocument();
    expect(screen.getByTestId('pista')).toHaveStyle({ height: '274px' });
    expect(track.resize).toHaveBeenLastCalledWith(844, 274, undefined);
    expect(JSON.parse(localStorage.getItem('vh:ajustes')!)).toMatchObject({ landscapeStaff: true });

    await userEvent.click(screen.getByRole('button', { name: 'Esconder pauta' }));
    expect(track.resize).toHaveBeenLastCalledWith(844, 390, undefined);
    expect(screen.queryByRole('region', { name: 'Partitura' })).not.toBeInTheDocument();
  });

  it('a escolha vale na próxima partida: a pista já nasce acima da pauta', async () => {
    localStorage.setItem('vh:ajustes', JSON.stringify({ landscapeStaff: true }));
    const { deps } = setup();
    await waitFor(() => expect(deps.loadTrack).toHaveBeenCalled());
    expect(vi.mocked(deps.loadTrack!).mock.calls[0][1]).toMatchObject({ width: 844, height: 274 });
    expect(screen.getByRole('button', { name: 'Esconder pauta' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('na pausa o botão vai para os Ajustes rápidos e alterna sem voltar o jogo', async () => {
    const { context, deps } = setup('?simular=0');
    await waitFor(() => expect(deps.loadTrack).toHaveBeenCalled());
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    const settings = screen.getByRole('region', { name: 'Ajustes rápidos' });
    expect(screen.getAllByRole('button', { name: 'Mostrar pauta' })).toHaveLength(1);
    await userEvent.click(within(settings).getByRole('button', { name: 'Mostrar pauta' }));
    expect(track.resize).toHaveBeenLastCalledWith(844, 274, undefined);
    expect(screen.getByRole('dialog', { name: 'PAUSADO' })).toBeInTheDocument();
    expect(context.resume).not.toHaveBeenCalled();
  });
});

describe('Gameplay gravando a entrega', () => {
  const RECORDING: Recording = { blob: new Blob(['som']), durationMs: 9000, mimeType: 'audio/webm;codecs=opus' };

  function recordingEar() {
    const recorder = {
      state: 'recording' as const,
      mimeType: RECORDING.mimeType,
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(async () => RECORDING),
      discard: vi.fn(),
    };
    const ear = Object.assign(createFakeEar(), { record: vi.fn((): Recorder => recorder) });
    return { ear, recorder };
  }

  const recorded = () => devWindow().__vhRecording;

  it('grava do começo ao fim da música e entrega a gravação com o resultado', async () => {
    const { ear, recorder } = recordingEar();
    const { run } = setup('?simular=0&gravar', undefined, {}, ear);
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    expect(ear.record).toHaveBeenCalledOnce();
    run(12);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`${ROUTES.badge}|${ROUTES.results}`)), { timeout: 3000 });
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(recorded()).toBe(RECORDING);
  });

  it('pausa junto com a partida e volta com ela', async () => {
    const { ear, recorder } = recordingEar();
    setup('?gravar', undefined, {}, ear);
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(recorder.pause).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    await waitFor(() => expect(recorder.resume).toHaveBeenCalledOnce(), { timeout: 3000 });
  });

  it('partida abandonada descarta a gravação', async () => {
    const { ear, recorder } = recordingEar();
    setup('?gravar', undefined, {}, ear);
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sair para músicas' }));
    expect(recorder.discard).toHaveBeenCalled();
    expect(recorder.stop).not.toHaveBeenCalled();
  });

  it('sem gravar, o Ouvido nem grava', async () => {
    const { ear } = recordingEar();
    setup('', undefined, {}, ear);
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    expect(ear.record).not.toHaveBeenCalled();
  });

  it('Ouvido que não grava (simulado): a partida segue e o fim diz por quê', async () => {
    const { run } = setup('?simular=0&gravar');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    run(12);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`${ROUTES.badge}|${ROUTES.results}`)), { timeout: 3000 });
    expect(recorded()).toBeInstanceOf(RecordingError);
    expect(recorded()).toMatchObject({ kind: 'unsupported' });
  });
});
