import type { PitchReading } from '../game/audio/types';
import { scheduleClicks } from '../game/audio/latency/click';
import {
  BADGES,
  buildResult,
  createEngine,
  createPractice,
  nextMeasureTime,
  renderPerformance,
  type BadgeId,
  type Engine,
  type EngineEvent,
  type EngineNote,
  type EngineState,
  type NoteJudgment,
  type PerformanceOptions,
  type Practice,
  type PracticeEvent,
  type PracticeResult,
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
/** O metrônomo agenda os cliques este tanto à frente; uma troca de andamento ou de laço refaz o que já foi agendado. */
export const METRONOME_AHEAD_SECONDS = 0.5;
/**
 * Quadro que chega este tanto depois do anterior veio de uma travada da thread principal: as leituras do Ouvido de
 * durante a travada ainda estão na fila (o requestAnimationFrame pode vir antes delas), então o quadro não expira notas.
 * Bem acima de um quadro a 10 fps.
 */
export const STALL_SECONDS = 0.2;

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

export type ClickScheduler = (context: BaseAudioContext, times: readonly number[], destination?: AudioNode) => () => void;

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
  /** Compasso de entrada e metrônomo; padrão: o clique da calibração. */
  clicks?: ClickScheduler;
  /** Liga a prática: velocidade e laço A–B, sempre sem falha. */
  practice?: PracticeStart | null;
  /** Do nível do jogador (levelSettings): folga de afinação e de tempo, e a descida da pista. */
  toleranceCents?: number;
  windows?: TimingWindows;
  /** Segundos do topo da pista à linha; padrão LEAD_SECONDS. */
  leadSeconds?: number;
  /** Volume do metrônomo, 0 a 1; 0 (padrão) desliga. */
  metronome?: number;
  onEvent?: (event: SessionEvent) => void;
}

/**
 * O relógio da prática, no relógio de jogo (o mesmo de now() e da pista): os trechos de andamento desde o começo, já
 * com os saltos do laço e as trocas de andamento. A faixa de partitura desenha a partir dele.
 */
export interface PracticeClock {
  /** Desde o começo da partida; copia a lista a cada chamada (guarde e peça de novo quando `until` passar). */
  segments(until: number): TempoSegment[];
  /** O laço A–B ligado agora (a faixa marca A e B); null fora da prática ou sem laço. */
  currentLoop?(): LoopRange | null;
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
  /** O motor da partida; depois de toPractice, o placar das duas partes somado. */
  readonly engine: Engine;
  /** Hora de jogo do primeiro tempo da música (na prática, do compasso de início). */
  readonly startAt: number;
  /** Na prática, e na partida que virou prática. */
  readonly practice: PracticeControls | null;
  /** Os trechos de andamento da partida (fora da prática, um só, de startAt no andamento da música); acompanha toPractice. */
  readonly clock: PracticeClock;
  /** Hora de jogo em que a partida comum virou prática; null se não virou. */
  readonly handoffAt: number | null;
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
  /** Linear, 0 a 1; 0 desliga. Os cliques caem nos tempos da linha do tempo (laço e andamento inclusos). */
  setMetronome(volume: number): void;
  /**
   * A partida comum vira prática no próximo início de compasso (sem refazer o que já foi tocado), com a velocidade
   * dada: daí em diante sem falha e sem selos. Devolve o instante, ou null se a música acaba antes ou já é prática.
   */
  toPractice(speed: number): number | null;
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

/** Os instantes dos tempos inteiros da música em [from, until), nos trechos de andamento dados. */
export function beatTimes(segments: readonly TempoSegment[], from: number, until: number): number[] {
  const out: number[] = [];
  for (const s of segments) {
    const end = Math.min(until, s.endTime);
    if (end <= from || s.time >= until) continue;
    const start = Math.max(from, s.time);
    for (let b = Math.ceil(s.beat + (start - s.time) / s.spb - 1e-9); b < s.endBeat; b++) {
      const t = s.time + (b - s.beat) * s.spb;
      if (t >= end) break;
      if (t >= start) out.push(t);
    }
  }
  return out;
}

const measureStart = (song: Song, measure: number) => song.measures.slice(0, measure).reduce((sum, m) => sum + m.beats, 0);

const measureAtBeat = (song: Song, beat: number) => {
  let start = 0;
  for (let i = 0; i < song.measures.length; i++) {
    start += song.measures[i].beats;
    if (beat < start - 1e-6) return i;
  }
  return song.measures.length - 1;
};

const noteJudgment = (e: NoteJudgment): NoteJudgment => ({
  index: e.index,
  noteIndex: e.noteIndex,
  measure: e.measure,
  string: e.string,
  midi: e.midi,
  judgment: e.judgment,
  issue: e.issue,
  offsetMs: e.offsetMs,
  cents: e.cents,
  playedMidi: e.playedMidi,
  points: e.points,
});

/** O placar da partida que virou prática: a parte comum e a prática somadas. */
export function mergeStates(first: EngineState, second: EngineState): EngineState {
  const judged = first.judged + second.judged;
  const late = second.judged > 0;
  return {
    score: first.score + second.score,
    combo: late ? second.combo : first.combo,
    maxCombo: Math.max(first.maxCombo, second.maxCombo),
    multiplier: late ? second.multiplier : first.multiplier,
    energy: late ? second.energy : first.energy,
    accuracy: judged ? (first.accuracy * first.judged + second.accuracy * second.judged) / judged : 0,
    judged,
    total: first.total + second.total,
  };
}

export function createGameSession(options: GameSessionOptions): GameSession {
  const { song, a4, latencySeconds, toleranceCents, windows } = options;
  const clicks = options.clicks ?? scheduleClicks;
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
  const spb = 60 / song.bpm;
  const steady: TempoSegment[] = [{ time: startAt, beat: 0, spb, endTime: Infinity, endBeat: Infinity }];
  const setup = options.practice ?? null;
  const from = setup ? (setup.from ?? setup.loop?.startMeasure ?? 0) : 0;
  const speed = setup?.speed ?? 1;
  // A linha do tempo da prática, no relógio de jogo: a autoridade dos motores; a orquestra recebe os mesmos pedidos
  let line: Timeline | null = setup ? createTimeline(song, { startAt: startAt - (measureStart(song, from) * spb) / speed, factor: speed }) : null;
  if (line && setup?.loop) line.setLoop(setup.loop);
  let committer: ReturnType<Timeline['cursor']> | null = line?.cursor(audio.context.currentTime) ?? null;
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

  // Depois de toPractice: a partida comum (só o que vem antes da virada) e a prática que assumiu
  let first: Engine | null = null;
  let handoffAt: number | null = null;
  const firstJudgments: NoteJudgment[] = [];
  const merged: EngineNote[] = [];

  const emit = (event: SessionEvent) => {
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

  const onEvent = (event: SessionEvent) => {
    if (!setup && event.type === 'judgment') firstJudgments.push(noteJudgment(event));
    if (handoffAt === null) return emit(event);
    // A parte comum só julga o que ficou antes da virada; o fim dela não é o fim da partida
    if (event.type === 'judgment') emit({ ...event, state: session.engine.state });
  };

  // Com fone a orquestra não vaza no microfone: não há o que descartar
  const sounding = options.orchestraPrefs?.headphones ? undefined : (t: number) => orchestra?.soundingAt(t - offset) ?? [];
  let practice: Practice | null = setup
    ? createPractice({ song, from, startAt, a4, latencySeconds, toleranceCents, windows, sounding, onEvent })
    : null;
  const base: Engine =
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

  /** A partida que virou prática, vista como um motor só: notas em sequência, placar somado. */
  const handoff: Engine = {
    get notes() {
      return merged;
    },
    get state() {
      return mergeStates(first!.state, practice!.state);
    },
    get status() {
      return practice!.status;
    },
    push(reading) {
      first!.push(reading);
      practice!.push(reading);
    },
    advance(t) {
      first!.advance(t);
      practice!.advance(t);
    },
    retire(at) {
      practice!.retire(at);
    },
    result() {
      return practice!.result();
    },
  };

  const plan = (t: number) => {
    if (!practice || !line || !committer) return;
    committer.advance(t + LOOKAHEAD_SECONDS);
    if (t < plannedAt + PLAN_EVERY_SECONDS) return;
    plannedAt = t;
    practice.sync(line.segments(t + PLAN_AHEAD_SECONDS), line.loop, t);
  };
  plan(now());
  if (!practice) simulate(base.notes);

  // Hora do último quadro e até onde o motor já expirou notas (frame)
  let lastFrame = now();
  let expiredTo = lastFrame;

  const stopClicks = clicks(audio.context, countInTimes(song, startAt, audio.context.currentTime + 0.05, song.bpm * speed));

  let metronome = options.metronome ?? 0;
  let metronomeGain: GainNode | null = null;
  let ticksUntil = -Infinity;
  let stopTicks: (() => void)[] = [];
  const clearTicks = () => {
    stopTicks.forEach((stop) => stop());
    stopTicks = [];
    ticksUntil = -Infinity;
  };
  const tick = (t: number) => {
    if (metronome <= 0 || pausedAt !== null) return;
    const until = t + METRONOME_AHEAD_SECONDS;
    if (until - ticksUntil < METRONOME_AHEAD_SECONDS / 2) return;
    const times = beatTimes(line ? line.segments(until) : steady, Math.max(ticksUntil, t, startAt), until);
    ticksUntil = until;
    if (!times.length) return;
    if (!metronomeGain) {
      metronomeGain = audio.context.createGain();
      metronomeGain.gain.value = metronome;
      metronomeGain.connect(audio.context.destination);
    }
    stopTicks.push(
      clicks(
        audio.context,
        times.map((time) => time - offset),
        metronomeGain,
      ),
    );
  };

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
      energy: base.state.energy,
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

  let controls: PracticeControls | null = null;
  const makeControls = (p: Practice, l: Timeline): PracticeControls => ({
    practice: p,
    get speed() {
      return currentSpeed;
    },
    get loop() {
      return l.loop;
    },
    segments: (until) => l.segments(until),
    setSpeed(next) {
      const t = now();
      const at = nextMeasureTime(song, l.segments(t + PLAN_AHEAD_SECONDS), Math.max(t + TEMPO_CHANGE_MARGIN_SECONDS, startAt));
      if (at === null) return null;
      l.setTempo(next, at);
      for (let i = tempoChanges.length - 1; i >= 0; i--) if (tempoChanges[i].at >= at) tempoChanges.splice(i, 1);
      tempoChanges.push({ factor: next, at });
      orchestra?.setTempo?.(next, at - offset);
      currentSpeed = next;
      plannedAt = -Infinity;
      plan(t);
      clearTicks();
      return at;
    },
    setLoop(range) {
      l.setLoop(range);
      orchestra?.setLoop?.(range);
      plannedAt = -Infinity;
      plan(now());
      clearTicks();
    },
    stop() {
      p.stop();
    },
  });
  if (practice && line) controls = makeControls(practice, line);

  const session: GameSession = {
    get engine() {
      return first ? handoff : base;
    },
    startAt,
    get practice() {
      return controls;
    },
    clock: { segments: (until) => (line ? line.segments(until) : steady.map((s) => ({ ...s }))), currentLoop: () => line?.loop ?? null },
    get handoffAt() {
      return handoffAt;
    },
    now,
    beatAt: (t) => (line ? line.beatAt(t) : (t - startAt) / spb),
    gameTime: (contextTime) => contextTime + offset,
    push(reading) {
      if (options.performance) return;
      session.engine.push(reading && { ...reading, time: reading.time + offset });
    },
    frame() {
      const t = now();
      plan(t);
      tick(t);
      const engine = session.engine;
      while (nextSimulated < simulated.length && simulated[nextSimulated].time <= t) {
        lastSimulated = simulated[nextSimulated].time;
        engine.push(simulated[nextSimulated++].reading);
      }
      // Depois da travada a expiração fica parada e alcança a hora no dobro da velocidade, já com as leituras da fila
      const step = t - lastFrame;
      lastFrame = t;
      if (step <= STALL_SECONDS) expiredTo = Math.min(t, expiredTo + 2 * Math.max(step, 0));
      engine.advance(expiredTo);
      track?.update(t);
      return t;
    },
    setTrack(next) {
      track = next;
      if (practice) next?.setNotes?.(session.engine.notes);
    },
    contextNotes() {
      return session.engine.notes.map((n) => ({ ...n, time: n.time - offset }));
    },
    async pause() {
      pausedAt ??= now();
      clearTicks();
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
    setMetronome(next) {
      metronome = Math.max(0, Math.min(1, next));
      if (metronomeGain) metronomeGain.gain.value = metronome;
      if (metronome === 0) clearTicks();
    },
    toPractice(next) {
      if (practice || destroyed || base.status !== 'playing') return null;
      const t = now();
      const at = nextMeasureTime(song, steady, Math.max(t + TEMPO_CHANGE_MARGIN_SECONDS, startAt));
      if (at === null) return null;
      const measure = measureAtBeat(song, (at - startAt) / spb);
      first = base;
      handoffAt = at;
      first.retire(at);
      line = createTimeline(song, { startAt });
      line.setTempo(next, at);
      committer = line.cursor(t);
      tempoChanges.push({ factor: next, at });
      orchestra?.setTempo?.(next, at - offset);
      currentSpeed = next;
      const kept = first.notes.length;
      const rebuild = (notes: readonly EngineNote[]) => {
        merged.length = 0;
        merged.push(...first!.notes, ...notes.map((n) => ({ ...n, index: n.index + kept })));
      };
      practice = createPractice({
        song,
        from: measure,
        startAt: at,
        a4,
        latencySeconds,
        toleranceCents,
        windows,
        sounding,
        onEvent: (event) => {
          if (event.type === 'notes') {
            rebuild(event.notes);
            return emit({ type: 'notes', notes: merged });
          }
          if (event.type === 'judgment') return emit({ ...event, index: event.index + kept, state: session.engine.state });
          if (event.type === 'done') return emit({ type: 'done', result: mergeResults(event.result) });
          emit(event);
        },
      });
      rebuild(practice.notes);
      controls = makeControls(practice, line);
      plannedAt = -Infinity;
      plan(t);
      clearTicks();
      return at;
    },
    async reanchor(next) {
      pausedAt ??= now();
      orchestra?.dispose();
      orchestra = null;
      stopClicks();
      clearTicks();
      metronomeGain?.disconnect();
      metronomeGain = null;
      audio = next;
      reopened = true;
      // A hora de jogo fica parada até o resume(): só aí o contexto novo volta a andar
      await audio.context.suspend().catch(() => undefined);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopClicks();
      clearTicks();
      metronomeGain?.disconnect();
      orchestra?.dispose();
      orchestra = null;
      track = null;
    },
  };

  /** O resultado da partida que virou prática: o que veio antes e as voltas, sem selos (prática não conquista selo). */
  function mergeResults(second: PracticeResult): PracticeResult {
    const kept = first!.notes.length;
    const state = mergeStates(first!.state, practice!.state);
    return {
      ...buildResult({
        status: 'finished',
        judgments: [...firstJudgments, ...second.judgments.map((j) => ({ ...j, index: j.index + kept }))],
        score: state.score,
        maxCombo: state.maxCombo,
        energy: second.energy,
        totalMeasures: song.measures.length,
        alreadyEarned: BADGES.map((b) => b.id),
      }),
      laps: second.laps,
      bestLap: second.bestLap,
    };
  }

  return session;
}
