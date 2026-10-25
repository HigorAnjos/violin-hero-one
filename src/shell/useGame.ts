import React from 'react';
import { audioDeviceKey, latencySeconds, latencyToMs } from '../game/audio';
import { centsBetween } from '../game/audio/tuning';
import { scheduleClicks } from '../game/audio/latency/click';
import type { EngineEvent, EngineNote, GameResult, PerformanceOptions } from '../game/engine';
import { secondsPerBeat, type Song } from '../game/notation/song';
import type { Track, TrackOptions } from '../game/render';
import { levelFor, loadOrchestraSettings, saveOrchestraSettings, type OrchestraLevel } from '../game/synth';
import { explainJudgment, type Explanation } from '../components/JudgmentHint/explain';
import type { TracePoint } from '../components/TuningCard/TuningCard';
import { TRACE_SECONDS } from '../components/TuningCard/TuningCard';
import { loadEarnedBadges } from '../services/badges';
import type { Ear, EarAudio } from './Ear';
import { createGameSession, type GameSession, type GameSessionOptions } from './gameSession';
import { loadOrchestra, type OrchestraFactory } from './orchestra';
import { isRehearsalEar } from './simulatedEar';

export type TrackLoader = (host: HTMLElement, options: TrackOptions) => Promise<Track>;

/** A pista vem sob demanda: o Pixi não entra no download inicial. */
export const loadTrack: TrackLoader = (host, options) => import('../game/render').then((m) => m.createTrack(host, options));

export interface GameDeps {
  loadTrack: TrackLoader;
  orchestra: OrchestraFactory | null;
  clicks: GameSessionOptions['clicks'];
}

export const GAME_DEPS: GameDeps = { loadTrack, orchestra: loadOrchestra, clicks: scheduleClicks };

export type GamePhase = 'starting' | 'playing' | 'paused' | 'counting' | 'over' | 'broken';

export interface GameHud {
  score: number;
  combo: number;
  multiplier: number;
  accuracy: number;
  level: OrchestraLevel;
  /** Próxima nota a julgar. */
  target: EngineNote | null;
  liveCents: number | null;
  trace: TracePoint[];
  explanation: Explanation | null;
  /** Segundos desde o primeiro tempo (negativo antes). */
  elapsed: number;
  measure: number;
  judged: number;
}

export interface GameOptions {
  ear: Ear;
  song: Song;
  a4: number;
  noFail?: boolean;
  /** ?simular (só DEV/e2e). */
  performance: PerformanceOptions | null;
  host: React.RefObject<HTMLElement | null>;
  trackOptions: Omit<TrackOptions, 'notes' | 'width' | 'height'>;
  box: () => { x: number; y: number; width: number; height: number };
  onBeat?: (beat: number) => void;
  onFinish: (result: GameResult) => void;
  onMicError: (error: unknown) => void;
  deps?: Partial<GameDeps>;
}

/** O erro fica à vista este tempo depois do julgamento. */
const EXPLAIN_SECONDS = 2.5;
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
  liveCents: null,
  trace: [],
  explanation: null,
  elapsed: 0,
  measure: 0,
  judged: 0,
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
    const shared = live.current;
    let alive = true;
    let raf = 0;
    let track: Track | null = null;
    let frames = 0;
    let level: OrchestraLevel = 3;
    let explained: { at: number; explanation: Explanation } | null = null;
    const trace: { time: number; cents: number }[] = [];
    let liveCents: number | null = null;
    let session: GameSession | null = null;
    const offs: (() => void)[] = [];
    const spb = secondsPerBeat(song);

    const target = () => (session ? (session.engine.notes[session.engine.state.judged] ?? null) : null);

    const pushHud = (now: number) => {
      if (!session) return;
      const s = session.engine.state;
      while (trace.length && now - trace[0].time > TRACE_SECONDS) trace.shift();
      const elapsed = now - session.startAt;
      const t = target();
      setHud({
        score: s.score,
        combo: s.combo,
        multiplier: s.multiplier,
        accuracy: s.accuracy,
        level,
        target: t,
        liveCents,
        trace: trace.map((p) => ({ age: now - p.time, cents: p.cents })),
        explanation: explained && now - explained.at < EXPLAIN_SECONDS ? explained.explanation : null,
        elapsed,
        measure: t ? t.measure : song.measures.length - 1,
        judged: t ? t.noteIndex : Number.MAX_SAFE_INTEGER,
      });
    };

    const onEvent = (event: EngineEvent) => {
      if (!session) return;
      if (event.type === 'judgment') {
        level = levelFor(event.state, level);
        const note = session.engine.notes[event.index];
        const explanation = explainJudgment(event, note, latencyToMs(live.current.latency));
        explained = explanation ? { at: session.now(), explanation } : null;
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
      opts.current.onBeat?.((now - session.startAt) / spb);
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
      deps
        .loadTrack(host, { ...opts.current.trackOptions, notes: session.engine.notes, width: box.width, height: box.height })
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
    const beatMs = secondsPerBeat(song) * 1000;
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

  return { phase, hud, counting, micClosed, volume, latencyMs, pause, resume, changeVolume };
}
