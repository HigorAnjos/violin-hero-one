import type { PitchReading } from '../game/audio/types';
import { scheduleClicks } from '../game/audio/latency/click';
import {
  createEngine,
  createPractice,
  nextMeasureTime,
  renderPerformance,
  type BadgeId,
  type Engine,
  type EngineEvent,
  type EngineNote,
  type PerformanceOptions,
  type Practice,
  type PracticeEvent,
  type TimedReading,
  type TimingWindows,
} from '../game/engine';
import type { Song } from '../game/notation/song';
import { LOOKAHEAD_SECONDS, countIn, createTimeline, type LoopRange, type TempoSegment, type Timeline } from '../game/synth';
import type { EarAudio } from './Ear';
import type { GameOrchestra, OrchestraFactory, OrchestraPrefs } from './orchestra';

/** Sem nível, uma nota leva 2 s do topo da pista à linha: a música começa depois disso. */
export const LEAD_SECONDS = 2;
/** A prática cria o motor de cada volta e de cada trecho de andamento este tanto antes, para a pista já mostrar as notas. */
export const PLAN_AHEAD_SECONDS = 3;
/** Intervalo entre os acertos da prática com a linha do tempo, fora das mudanças pedidas. */
export const PLAN_EVERY_SECONDS = 0.25;
/** A troca de andamento vale no primeiro início de compasso depois disto: o piso do agendador (200 ms) com folga. */
export const TEMPO_CHANGE_MARGIN_SECONDS = 0.3;

/** O que a pista precisa da partida (src/game/render), sem carregar o Pixi aqui. */
export interface GameTrack {
  update(now: number): void;
  onJudgment(event: Extract<EngineEvent, { type: 'judgment' }>): void;
  setNotes?(notes: readonly EngineNote[]): void;
}

/** A prática dentro da partida: o trecho de onde começa, o laço A–B (compassos inclusivos) e a velocidade. */
export interface PracticeStart {
  /** Compasso de início, a partir de 0; padrão: o A do laço, ou 0. */
  from?: number;
  loop: LoopRange | null;
  /** Fator de 0,5 a 1 sobre o andamento da música. */
  speed: number;
}

export type SessionEvent = EngineEvent | PracticeEvent;

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
  /** Liga a prática: velocidade e laço A–B, sempre sem falha. */
  practice?: PracticeStart | null;
  /** Do nível do jogador (levelSettings): folga de afinação e de tempo, e a descida da pista. */
  toleranceCents?: number;
  windows?: TimingWindows;
  /** Segundos do topo da pista à linha; padrão LEAD_SECONDS. */
  leadSeconds?: number;
  onEvent?: (event: SessionEvent) => void;
}

/**
 * O relógio da prática, no relógio de jogo (o mesmo de now() e da pista): os trechos de andamento desde o começo, já
 * com os saltos do laço e as trocas de andamento. A faixa de partitura desenha a partir dele.
 */
export interface PracticeClock {
  /** Desde o começo da partida; copia a lista a cada chamada (guarde e peça de novo quando `until` passar). */
  segments(until: number): TempoSegment[];
}

export interface PracticeControls extends PracticeClock {
  readonly practice: Practice;
  readonly speed: number;
  readonly loop: LoopRange | null;
  /** Vale no próximo início de compasso; devolve esse instante (relógio de jogo), ou null se a música acaba antes. */
  setSpeed(speed: number): number | null;
  /** Liga, troca ou desliga (null) o laço; salta no fim de B, ou no próximo compasso se a música já passou de B. */
  setLoop(range: LoopRange | null): void;
  /** Encerra: o resultado sai no evento done, com as voltas. */
  stop(): void;
}

export interface GameSession {
  readonly engine: Engine;
  /** Hora de jogo do primeiro tempo da música (na prática, do compasso de início). */
  readonly startAt: number;
  /** Só na prática. */
  readonly practice: PracticeControls | null;
  /** Os trechos de andamento da partida (fora da prática, um só, de startAt no andamento da música). */
  readonly clock: PracticeClock;
  /** Hora de jogo: a do AudioContext atual mais o deslocamento das reaberturas. */
  now(): number;
  /** Tempo da música no instante de jogo `t` (na prática, com os saltos do laço e as trocas de andamento). */
  beatAt(t: number): number;
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
export function countInTimes(song: Song, startAt: number, from: number, bpm: number = song.bpm): number[] {
  return countIn(song, { startAt, bpm })
    .map((beat) => beat.time)
    .filter((t) => t >= from);
}

const measureStart = (song: Song, measure: number) => song.measures.slice(0, measure).reduce((sum, m) => sum + m.beats, 0);

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
  const startAt = audio.context.currentTime + (options.leadSeconds ?? LEAD_SECONDS);
  const { toleranceCents, windows } = options;
  const spb = 60 / song.bpm;
  const setup = options.practice ?? null;
  const from = setup ? (setup.from ?? setup.loop?.startMeasure ?? 0) : 0;
  const speed = setup?.speed ?? 1;
  // A linha do tempo da prática, no relógio de jogo: a autoridade dos motores; a orquestra recebe os mesmos pedidos
  const line: Timeline | null = setup ? createTimeline(song, { startAt: startAt - (measureStart(song, from) * spb) / speed, factor: speed }) : null;
  if (line && setup?.loop) line.setLoop(setup.loop);
  const committer = line?.cursor(audio.context.currentTime);
  const tempoChanges: { factor: number; at: number }[] = [];
  let plannedAt = -Infinity;
  let currentSpeed = speed;

  let simulated: TimedReading[] = [];
  let nextSimulated = 0;
  let lastSimulated = -Infinity;
  const simulate = (notes: readonly EngineNote[]) => {
    if (!options.performance) return;
    simulated = renderPerformance(notes, a4, { latencySeconds, ...options.performance }).readings;
    nextSimulated = simulated.findIndex((r) => r.time > lastSimulated);
    if (nextSimulated < 0) nextSimulated = simulated.length;
  };

  const onEvent = (event: SessionEvent) => {
    if (event.type === 'judgment') {
      track?.onJudgment(event);
      orchestra?.update(event.state);
    } else if (event.type === 'notes') {
      track?.setNotes?.(event.notes);
      simulate(event.notes);
    } else if (event.type !== 'lap') {
      void orchestra?.stop(event.type === 'gameover' ? 1.5 : 0.6);
    }
    options.onEvent?.(event);
  };

  // Com fone a orquestra não vaza no microfone: não há o que descartar
  const sounding = options.orchestraPrefs?.headphones ? undefined : (t: number) => orchestra?.soundingAt(t - offset) ?? [];
  const practice = setup
    ? createPractice({ song, from, startAt, a4, latencySeconds, toleranceCents, windows, sounding, onEvent })
    : null;
  const engine: Engine =
    practice ??
    createEngine({
      song,
      startAt,
      a4,
      latencySeconds,
      toleranceCents,
      windows,
      noFail: options.noFail,
      earnedBadges: options.earnedBadges,
      sounding,
      onEvent,
    });

  const plan = (t: number) => {
    if (!practice || !line || !committer) return;
    committer.advance(t + LOOKAHEAD_SECONDS);
    if (t < plannedAt + PLAN_EVERY_SECONDS) return;
    plannedAt = t;
    practice.sync(line.segments(t + PLAN_AHEAD_SECONDS), line.loop, t);
  };
  plan(now());
  if (!practice) simulate(engine.notes);

  const stopClicks = (options.clicks ?? scheduleClicks)(
    audio.context,
    countInTimes(song, startAt, audio.context.currentTime + 0.05, song.bpm * speed),
  );

  let volume = options.orchestraPrefs?.volume;
  const startOrchestra = () => {
    if (!options.orchestra) return;
    const context = audio.context;
    const prefs = options.orchestraPrefs;
    // Na prática, a orquestra (re)nasce no trecho de agora da linha do tempo, com o laço e as trocas que ainda vêm
    const t = now();
    const current = line?.segments(t).at(-1);
    orchestraLoading = options.orchestra(context, song, {
      startAt: (current ? current.time - current.beat * current.spb : startAt) - offset,
      tempo: current ? spb / current.spb : undefined,
      a4,
      energy: engine.state.energy,
      volume,
      enabled: prefs?.enabled,
      headphones: prefs?.headphones,
    })
      .then((created) => {
        if (destroyed || audio.context !== context) return created.dispose();
        orchestra = created;
        if (!line) return;
        created.setLoop?.(line.loop);
        for (const change of tempoChanges) if (change.at > now()) created.setTempo?.(change.factor, change.at - offset);
      })
      .catch(() => undefined);
  };
  startOrchestra();

  const controls: PracticeControls | null =
    practice && line
      ? {
          practice,
          get speed() {
            return currentSpeed;
          },
          get loop() {
            return line.loop;
          },
          segments: (until) => line.segments(until),
          setSpeed(next) {
            const t = now();
            const at = nextMeasureTime(song, line.segments(t + PLAN_AHEAD_SECONDS), Math.max(t + TEMPO_CHANGE_MARGIN_SECONDS, startAt));
            if (at === null) return null;
            line.setTempo(next, at);
            for (let i = tempoChanges.length - 1; i >= 0; i--) if (tempoChanges[i].at >= at) tempoChanges.splice(i, 1);
            tempoChanges.push({ factor: next, at });
            orchestra?.setTempo?.(next, at - offset);
            currentSpeed = next;
            plannedAt = -Infinity;
            plan(t);
            return at;
          },
          setLoop(range) {
            line.setLoop(range);
            orchestra?.setLoop?.(range);
            plannedAt = -Infinity;
            plan(now());
          },
          stop() {
            practice.stop();
          },
        }
      : null;

  return {
    engine,
    startAt,
    practice: controls,
    clock: controls ?? { segments: () => [{ time: startAt, beat: 0, spb, endTime: Infinity, endBeat: Infinity }] },
    now,
    beatAt: (t) => (line ? line.beatAt(t) : (t - startAt) / spb),
    gameTime: (contextTime) => contextTime + offset,
    push(reading) {
      if (options.performance) return;
      engine.push(reading && { ...reading, time: reading.time + offset });
    },
    frame() {
      const t = now();
      plan(t);
      while (nextSimulated < simulated.length && simulated[nextSimulated].time <= t) {
        lastSimulated = simulated[nextSimulated].time;
        engine.push(simulated[nextSimulated++].reading);
      }
      engine.advance(t);
      track?.update(t);
      return t;
    },
    setTrack(next) {
      track = next;
      if (practice) next?.setNotes?.(practice.notes);
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
