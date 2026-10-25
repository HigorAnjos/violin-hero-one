import type { PitchReading } from '../game/audio/types';
import { scheduleClicks } from '../game/audio/latency/click';
import {
  createEngine,
  renderPerformance,
  type BadgeId,
  type Engine,
  type EngineEvent,
  type EngineNote,
  type PerformanceOptions,
  type TimedReading,
} from '../game/engine';
import type { Song } from '../game/notation/song';
import { countIn } from '../game/synth';
import type { EarAudio } from './Ear';
import type { GameOrchestra, OrchestraFactory, OrchestraPrefs } from './orchestra';

/** Uma nota leva 2 s do topo da pista à linha: a música começa depois disso. */
export const LEAD_SECONDS = 2;

/** O que a pista precisa da partida (src/game/render), sem carregar o Pixi aqui. */
export interface GameTrack {
  update(now: number): void;
  onJudgment(event: Extract<EngineEvent, { type: 'judgment' }>): void;
}

export interface GameSessionOptions {
  song: Song;
  audio: EarAudio;
  a4: number;
  latencySeconds: number;
  noFail?: boolean;
  earnedBadges?: readonly BadgeId[];
  /** ?simular: o violinista sintético toca no lugar do microfone. */
  performance?: PerformanceOptions | null;
  orchestra?: OrchestraFactory | null;
  orchestraPrefs?: OrchestraPrefs;
  /** Compasso de entrada; padrão: o clique da calibração. */
  clicks?: (context: BaseAudioContext, times: readonly number[]) => () => void;
  onEvent?: (event: EngineEvent) => void;
}

export interface GameSession {
  readonly engine: Engine;
  /** Hora de jogo do primeiro tempo da música. */
  readonly startAt: number;
  /** Hora de jogo: a do AudioContext atual mais o deslocamento das reaberturas. */
  now(): number;
  /** Hora de jogo de um instante do contexto atual (ex.: PitchReading.time). */
  gameTime(contextTime: number): number;
  /** Uma leitura do Ouvido (no relógio do contexto atual). */
  push(reading: PitchReading | null): void;
  /** Um quadro: leituras simuladas, motor e pista na mesma hora. Devolve a hora de jogo. */
  frame(): number;
  setTrack(track: GameTrack | null): void;
  /** As notas no relógio do contexto atual (para o ouvido simulado tocar junto). */
  contextNotes(): EngineNote[];
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Linear, 0 a 1 (ajuste rápido da pausa). */
  setOrchestraVolume(volume: number): void;
  /** Microfone reaberto num AudioContext novo: fica pausado; no resume() a hora de jogo continua de onde parou. */
  reanchor(audio: EarAudio): Promise<void>;
  destroy(): void;
}

/** Tempos do compasso de entrada que ainda cabem antes do início (o resto já passou na tela Contagem). */
export function countInTimes(song: Song, startAt: number, from: number): number[] {
  return countIn(song, { startAt })
    .map((beat) => beat.time)
    .filter((t) => t >= from);
}

export function createGameSession(options: GameSessionOptions): GameSession {
  const { song, a4, latencySeconds } = options;
  let audio = options.audio;
  let offset = 0;
  let track: GameTrack | null = null;
  let orchestra: GameOrchestra | null = null;
  let orchestraLoading: Promise<void> | null = null;
  let destroyed = false;
  let pausedAt: number | null = null;
  let reopened = false;

  const now = () => (pausedAt ?? audio.context.currentTime + offset);
  const startAt = audio.context.currentTime + LEAD_SECONDS;

  const engine = createEngine({
    song,
    startAt,
    a4,
    latencySeconds,
    noFail: options.noFail,
    earnedBadges: options.earnedBadges,
    onEvent: (event) => {
      if (event.type === 'judgment') {
        track?.onJudgment(event);
        orchestra?.update(event.state);
      } else {
        void orchestra?.stop(event.type === 'gameover' ? 1.5 : 0.6);
      }
      options.onEvent?.(event);
    },
  });

  const simulated: TimedReading[] = options.performance ? renderPerformance(engine.notes, a4, { latencySeconds, ...options.performance }).readings : [];
  let nextSimulated = 0;

  const stopClicks = (options.clicks ?? scheduleClicks)(audio.context, countInTimes(song, startAt, audio.context.currentTime + 0.05));

  let volume = options.orchestraPrefs?.volume;
  const startOrchestra = () => {
    if (!options.orchestra) return;
    const context = audio.context;
    const prefs = options.orchestraPrefs;
    orchestraLoading = options.orchestra(context, song, {
      startAt: startAt - offset,
      a4,
      energy: engine.state.energy,
      volume,
      enabled: prefs?.enabled,
      headphones: prefs?.headphones,
    })
      .then((created) => {
        if (destroyed || audio.context !== context) created.dispose();
        else orchestra = created;
      })
      .catch(() => undefined);
  };
  startOrchestra();

  return {
    engine,
    startAt,
    now,
    gameTime: (contextTime) => contextTime + offset,
    push(reading) {
      if (options.performance) return;
      engine.push(reading && { ...reading, time: reading.time + offset });
    },
    frame() {
      const t = now();
      while (nextSimulated < simulated.length && simulated[nextSimulated].time <= t) engine.push(simulated[nextSimulated++].reading);
      engine.advance(t);
      track?.update(t);
      return t;
    },
    setTrack(next) {
      track = next;
    },
    contextNotes() {
      return engine.notes.map((n) => ({ ...n, time: n.time - offset }));
    },
    async pause() {
      pausedAt ??= now();
      await audio.context.suspend().catch(() => undefined);
    },
    async resume() {
      await audio.context.resume().catch(() => undefined);
      if (pausedAt !== null) offset = pausedAt - audio.context.currentTime;
      pausedAt = null;
      if (reopened && !destroyed) {
        reopened = false;
        await orchestraLoading;
        startOrchestra();
      }
    },
    setOrchestraVolume(next) {
      volume = next;
      orchestra?.setVolume(next);
    },
    async reanchor(next) {
      pausedAt ??= now();
      orchestra?.dispose();
      orchestra = null;
      stopClicks();
      audio = next;
      reopened = true;
      // A hora de jogo fica parada até o resume(): só aí o contexto novo volta a andar
      await audio.context.suspend().catch(() => undefined);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopClicks();
      orchestra?.dispose();
      orchestra = null;
      track = null;
    },
  };
}
