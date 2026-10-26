import React from 'react';
import { audioDeviceKey, latencySeconds, latencyToMs } from '../game/audio';
import { centsBetween } from '../game/audio/tuning';
import { scheduleClicks } from '../game/audio/latency/click';
import type { EngineNote, GameResult, Judgment, LapSummary, LevelSettings, PerformanceOptions } from '../game/engine';
import { secondsPerBeat, type Song } from '../game/notation/song';
import type { Sheet, SheetOptions, Track, TrackOptions } from '../game/render';
import { levelFor, loadOrchestraSettings, saveOrchestraSettings, type LoopRange, type OrchestraLevel } from '../game/synth';
import { explainJudgment, type Explanation } from '../components/JudgmentHint/explain';
import type { TracePoint } from '../components/TuningCard/TuningCard';
import { TRACE_SECONDS } from '../components/TuningCard/TuningCard';
import { loadEarnedBadges } from '../services/badges';
import type { Ear, EarAudio } from './Ear';
import { createGameSession, type GameSession, type GameSessionOptions, type PracticeClock, type PracticeStart, type SessionEvent } from './gameSession';
import { loadOrchestra, type OrchestraFactory } from './orchestra';
import { createShowQueue } from './showQueue';
import { isRehearsalEar } from './simulatedEar';

export type TrackLoader = (host: HTMLElement, options: TrackOptions) => Promise<Track>;
export type SheetLoader = (host: HTMLElement, options: SheetOptions) => Promise<Sheet>;

/** A pista vem sob demanda: o Pixi não entra no download inicial. */
export const loadTrack: TrackLoader = (host, options) => import('../game/render').then((m) => m.createTrack(host, options));
/** A faixa de partitura, do mesmo pedaço da pista. */
export const loadSheet: SheetLoader = (host, options) => import('../game/render').then((m) => m.createSheet(host, options));

export interface GameDeps {
  loadTrack: TrackLoader;
  loadSheet: SheetLoader;
  orchestra: OrchestraFactory | null;
  clicks: GameSessionOptions['clicks'];
}

export const GAME_DEPS: GameDeps = { loadTrack, loadSheet, orchestra: loadOrchestra, clicks: scheduleClicks };

/** Pista em perspectiva (Arcade) ou faixa de partitura (5b, prática). */
export type GameView = 'track' | 'sheet';

export type GamePhase = 'starting' | 'playing' | 'paused' | 'counting' | 'over' | 'broken';

export interface GameHud {
  score: number;
  combo: number;
  multiplier: number;
  accuracy: number;
  level: OrchestraLevel;
  /** Próxima nota a julgar. */
  target: EngineNote | null;
  /** A que vem depois dela. */
  next: EngineNote | null;
  liveCents: number | null;
  trace: TracePoint[];
  explanation: Explanation | null;
  /** O último julgamento em fila (cada um fica ao menos 250 ms); null depois que some. */
  callout: Callout | null;
  /** Segundos desde o primeiro tempo (negativo antes). */
  elapsed: number;
  measure: number;
  judged: number;
  /** Só na prática. */
  practice: PracticeHud | null;
}

export interface PracticeHud {
  /** Volta que está sendo julgada, a partir de 0. */
  lap: number;
  /** As voltas já fechadas, em ordem. */
  laps: LapSummary[];
  /** Índice em `laps` da de maior precisão (empate: a primeira); null sem volta fechada. */
  bestLap: number | null;
  speed: number;
  loop: LoopRange | null;
}

/** O que a tela Practice comanda durante a partida. */
export interface PracticeApi {
  /** 0,5 a 1; vale no próximo início de compasso. */
  setSpeed(speed: number): void;
  setLoop(range: LoopRange | null): void;
  /** Encerra; o resultado (PracticeResult, com as voltas) chega em onFinish. */
  stop(): void;
}

/** A volta fechada de maior precisão; empate fica com a primeira (os pontos crescem com o combo). */
export function bestLapOf(laps: readonly LapSummary[]): number | null {
  let best: number | null = null;
  laps.forEach((lap, i) => {
    if (lap.complete && lap.notes > 0 && (best === null || lap.accuracy > laps[best].accuracy)) best = i;
  });
  return best;
}

export interface GameOptions {
  ear: Ear;
  song: Song;
  a4: number;
  noFail?: boolean;
  /** ?simular (só DEV/e2e). */
  performance: PerformanceOptions | null;
  host: React.RefObject<HTMLElement | null>;
  /** Padrão: a pista. Lido na montagem. */
  view?: GameView;
  trackOptions: Omit<TrackOptions, 'notes' | 'width' | 'height'>;
  box: () => { x: number; y: number; width: number; height: number };
  onBeat?: (beat: number) => void;
  onFinish: (result: GameResult) => void;
  onMicError: (error: unknown) => void;
  /** A prática dentro da partida (lida na montagem): trecho, laço A–B e velocidade. Sempre sem falha. */
  practice?: PracticeStart | null;
  /** Folgas e descida da pista do nível do jogador (lido na montagem); padrão: as do motor. */
  level?: Pick<LevelSettings, 'toleranceCents' | 'windows' | 'trackLeadSeconds'>;
  deps?: Partial<GameDeps>;
}

/** O erro fica à vista este tempo depois do julgamento, se nada vier depois. */
const EXPLAIN_SECONDS = 2.5;
/** O julgamento grande (5b) fica à vista este tempo, se nada vier depois. */
export const CALLOUT_SECONDS = 0.9;

/** O julgamento grande da tela, com o combo de depois dele. */
export interface Callout {
  judgment: Judgment;
  combo: number;
  /** Muda a cada julgamento mostrado, para a animação recomeçar. */
  serial: number;
}
const HUD_EVERY_FRAMES = 4;
/** Dá tempo de ver o último julgamento antes de trocar de tela. */
export const FINISH_DELAY_MS = 1500;

const EMPTY_HUD: GameHud = {
  score: 0,
  combo: 0,
  multiplier: 1,
  accuracy: 0,
  level: 3,
  target: null,
  next: null,
  liveCents: null,
  trace: [],
  explanation: null,
  callout: null,
  elapsed: 0,
  measure: 0,
  judged: 0,
  practice: null,
};

/** Liga Ouvido, motor, pista e orquestra num requestAnimationFrame só, com pausa e reabertura do microfone. */
export function useGame(options: GameOptions) {
  const opts = React.useRef(options);
  React.useEffect(() => {
    opts.current = options;
  });
  const { ear, song, a4, noFail, performance } = options;
  const [phase, setPhase] = React.useState<GamePhase>('starting');
  const [hud, setHud] = React.useState<GameHud>(EMPTY_HUD);
  const [counting, setCounting] = React.useState<number | null>(null);
  const [micClosed, setMicClosed] = React.useState(false);
  const [volume, setVolume] = React.useState(() => loadOrchestraSettings().volume);
  const [latencyMs, setLatencyMs] = React.useState<number | null>(null);
  const live = React.useRef<{ session: GameSession | null; latency: number; paused: boolean; closes: number }>({
    session: null,
    latency: 0,
    paused: false,
    closes: 0,
  });

  const follow = React.useCallback(() => {
    const { session, latency } = live.current;
    if (session && isRehearsalEar(ear) && !performance) ear.follow(session.contextNotes(), latency);
  }, [ear, performance]);

  React.useEffect(() => {
    const deps = { ...GAME_DEPS, ...opts.current.deps };
    const player = opts.current.level;
    const shared = live.current;
    let alive = true;
    let raf = 0;
    let track: Track | Sheet | null = null;
    let frames = 0;
    let level: OrchestraLevel = 3;
    const explained = createShowQueue<Explanation>(EXPLAIN_SECONDS);
    const called = createShowQueue<Omit<Callout, 'serial'>>(CALLOUT_SECONDS);
    const trace: { time: number; cents: number }[] = [];
    let liveCents: number | null = null;
    let session: GameSession | null = null;
    const offs: (() => void)[] = [];
    const laps: LapSummary[] = [];

    const target = () => (session ? (session.engine.notes[session.engine.state.judged] ?? null) : null);

    const pushHud = (now: number) => {
      if (!session) return;
      const s = session.engine.state;
      while (trace.length && now - trace[0].time > TRACE_SECONDS) trace.shift();
      const elapsed = now - session.startAt;
      const t = target();
      const call = called.current(now);
      setHud({
        score: s.score,
        combo: s.combo,
        multiplier: s.multiplier,
        accuracy: s.accuracy,
        level,
        target: t,
        next: session.engine.notes[s.judged + 1] ?? null,
        liveCents,
        trace: trace.map((p) => ({ age: now - p.time, cents: p.cents })),
        explanation: explained.current(now)?.item ?? null,
        callout: call && { ...call.item, serial: call.serial },
        elapsed,
        measure: t ? t.measure : song.measures.length - 1,
        judged: t ? t.noteIndex : Number.MAX_SAFE_INTEGER,
        practice: session.practice && {
          lap: session.practice.practice.lap,
          laps: [...laps],
          bestLap: bestLapOf(laps),
          speed: session.practice.speed,
          loop: session.practice.loop,
        },
      });
    };

    const onEvent = (event: SessionEvent) => {
      if (!session) return;
      if (event.type === 'notes') return follow();
      if (event.type === 'lap') {
        laps.push(event.summary);
        return;
      }
      if (event.type === 'judgment') {
        level = levelFor(event.state, level);
        const note = session.engine.notes[event.index];
        const explanation = explainJudgment(event, note, latencyToMs(live.current.latency), player);
        const now = session.now();
        if (explanation) explained.push(explanation, now);
        called.push({ judgment: event.judgment, combo: event.state.combo }, now);
        return;
      }
      if (event.type === 'gameover') level = 0;
      setPhase('over');
      const result = event.result;
      setTimeout(() => alive && opts.current.onFinish(result), FINISH_DELAY_MS);
    };

    const frame = () => {
      if (!alive || !session) return;
      const now = session.frame();
      opts.current.onBeat?.(session.beatAt(now));
      if (++frames % HUD_EVERY_FRAMES === 0) pushHud(now);
      raf = requestAnimationFrame(frame);
    };

    const begin = (audio: EarAudio) => {
      const latency = latencySeconds(audioDeviceKey(audio.stream ?? undefined, audio.context));
      live.current.latency = latency;
      setLatencyMs(latencyToMs(latency));
      session = createGameSession({
        song,
        audio,
        a4,
        latencySeconds: latency,
        noFail,
        earnedBadges: loadEarnedBadges(),
        performance,
        orchestra: deps.orchestra,
        orchestraPrefs: loadOrchestraSettings(),
        clicks: deps.clicks,
        practice: opts.current.practice,
        toleranceCents: player?.toleranceCents,
        windows: player?.windows,
        leadSeconds: player?.trackLeadSeconds,
        onEvent,
      });
      shared.session = session;
      follow();
      offs.push(
        ear.onPitch((reading) => {
          if (!session) return;
          session.push(reading);
          // Na nota da vez, o desvio para o alvo; fora dela (troca de nota, legato), o da nota que soa
          const t = target();
          liveCents = !reading ? null : t && reading.midi === t.midi ? centsBetween(reading.hz, t.frequency) : reading.cents;
          if (reading && liveCents !== null) trace.push({ time: session.gameTime(reading.time), cents: liveCents });
        }),
        ear.onClosed((reason) => {
          if (reason !== 'hidden' || !session) return;
          live.current.paused = true;
          live.current.closes += 1;
          void session.pause();
          setMicClosed(true);
          setPhase((p) => (p === 'over' ? p : 'paused'));
        })
      );
      setPhase('playing');
      raf = requestAnimationFrame(frame);

      const host = opts.current.host.current;
      if (!host) return;
      const box = opts.current.box();
      const { theme, reducedMotion, showFps, onFps } = opts.current.trackOptions;
      const surface: Promise<Track | Sheet> =
        opts.current.view === 'sheet'
          ? deps.loadSheet(host, { theme, reducedMotion, showFps, onFps, song, clock: session.clock, width: box.width, height: box.height })
          : deps.loadTrack(host, {
              ...opts.current.trackOptions,
              leadSeconds: player?.trackLeadSeconds,
              notes: session.engine.notes,
              width: box.width,
              height: box.height,
            });
      surface
        .then((created) => {
          if (!alive) return created.destroy();
          track = created;
          session?.setTrack(created);
        })
        .catch(() => undefined);
    };

    ear.setA4(a4);
    ear
      .start()
      .then(() => {
        if (!alive) return;
        const audio = ear.audio();
        if (!audio) return setPhase('broken');
        begin(audio);
      })
      .catch((error: unknown) => alive && opts.current.onMicError(error));

    const onResize = () => {
      const box = opts.current.box();
      track?.resize(box.width, box.height);
    };
    addEventListener('resize', onResize);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      offs.forEach((off) => off());
      if (isRehearsalEar(ear)) ear.follow(null);
      track?.destroy();
      session?.destroy();
      shared.session = null;
    };
  }, [ear, song, a4, noFail, performance, follow]);

  const pause = React.useCallback(() => {
    const session = live.current.session;
    if (!session || live.current.paused) return;
    live.current.paused = true;
    void session.pause();
    setPhase((p) => (p === 'playing' ? 'paused' : p));
  }, []);

  const resume = React.useCallback(async () => {
    const session = live.current.session;
    if (!session) return;
    if (micClosed) {
      // Dentro do toque: o iOS só libera o microfone e o áudio num gesto
      try {
        await ear.start();
      } catch (error) {
        opts.current.onMicError(error);
        return;
      }
      const audio = ear.audio();
      if (!audio) return;
      await session.reanchor(audio);
      setMicClosed(false);
    }
    setPhase('counting');
    const beats = song.timeSignature.beats;
    const beatMs = (secondsPerBeat(song) * 1000) / (session.practice?.speed ?? 1);
    const closes = live.current.closes;
    for (let left = beats; left > 0; left--) {
      setCounting(left);
      await new Promise((r) => setTimeout(r, beatMs));
      if (live.current.session !== session) return;
      // A aba saiu de vista no meio da contagem: o microfone fechou e a pausa voltou
      if (live.current.closes !== closes) return setCounting(null);
    }
    setCounting(null);
    await session.resume();
    live.current.paused = false;
    follow();
    setPhase('playing');
  }, [ear, micClosed, song, follow]);

  const changeVolume = React.useCallback((next: number) => {
    setVolume(next);
    live.current.session?.setOrchestraVolume(next);
    saveOrchestraSettings({ ...loadOrchestraSettings(), volume: next });
  }, []);

  const practice = React.useMemo<PracticeApi>(
    () => ({
      setSpeed: (speed) => void live.current.session?.practice?.setSpeed(speed),
      setLoop: (range) => live.current.session?.practice?.setLoop(range),
      stop: () => live.current.session?.practice?.stop(),
    }),
    [],
  );

  /** O relógio de tempos da partida, para a faixa de partitura: vazio até a partida começar. */
  const clock = React.useMemo<PracticeClock>(() => ({ segments: (until) => live.current.session?.clock.segments(until) ?? [] }), []);

  return { phase, hud, counting, micClosed, volume, latencyMs, pause, resume, changeVolume, practice, clock };
}
