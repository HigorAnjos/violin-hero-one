import type { PitchReading } from '../audio/types';
import { songDurationBeats, type Song } from '../notation/song';
import { BADGES } from './badges';
import { createEngine, type EngineOptions, type MeasureRange } from './engine';
import { ENERGY_START, applyEnergy, energyFraction } from './energy';
import { buildResult } from './result';
import { accuracyPercent, applyJudgment, emptyCounts, initialScore } from './score';
import type { Engine, EngineEvent, EngineNote, EngineState, EngineStatus, GameResult, Judgment, NoteJudgment } from './types';

/** Um trecho de andamento constante da linha do tempo da orquestra (TempoSegment do synth, sem importá-lo). */
export interface PracticeSegment {
  time: number;
  beat: number;
  spb: number;
  endTime: number;
  endBeat: number;
}

/** Laço A–B por compasso, inclusivo (LoopRange do synth). */
export interface PracticeLoop {
  startMeasure: number;
  endMeasure: number;
}

export interface LapSummary {
  /** A partir de 0: a primeira passada, do compasso de início, é a volta 0. */
  lap: number;
  /** Compassos tocados, a partir de 0: de `from` (incluso) a `to` (excluso). */
  from: number;
  to: number;
  notes: number;
  counts: Record<Judgment, number>;
  accuracy: number;
  /** Pontos da volta, com o multiplicador do combo que vem da volta anterior. */
  score: number;
  /** Fatores de andamento (0,5 a 1) em que a volta foi tocada, em ordem. */
  factors: number[];
  /** Fechada por um salto do laço ou pelo fim da música; false na volta cortada pelo stop(). */
  complete: boolean;
}

export interface PracticeResult extends GameResult {
  laps: LapSummary[];
  /** Índice em `laps` da volta completa de maior precisão (empate: a primeira, porque os pontos crescem com o combo das voltas anteriores); null sem volta completa julgada. */
  bestLap: number | null;
}

export type PracticeEvent =
  | ({ type: 'judgment' } & NoteJudgment & { state: EngineState; lap: number })
  | { type: 'notes'; notes: readonly EngineNote[] }
  | { type: 'lap'; summary: LapSummary }
  | { type: 'done'; result: PracticeResult };

export interface PracticeOptions
  extends Pick<EngineOptions, 'song' | 'a4' | 'latencySeconds' | 'windows' | 'toleranceCents' | 'sounding'> {
  /** Compasso em que a prática começa, a partir de 0. */
  from: number;
  /** Instante (relógio de jogo) do primeiro tempo de `from`. */
  startAt: number;
  /** Andamento de fator 1; padrão: o da música. */
  bpm?: number;
  onEvent?: (event: PracticeEvent) => void;
}

export interface Practice extends Omit<Engine, 'result'> {
  readonly notes: readonly EngineNote[];
  readonly lap: number;
  readonly laps: readonly LapSummary[];
  /**
   * Acerta os motores com a linha do tempo (Timeline.segments, desde o começo) e o laço atual. Cria o motor de cada
   * trecho de andamento e de cada volta assim que ele aparece nos trechos (a shell pede uns segundos à frente, para a
   * pista); o que mudou a partir de `now` é aposentado e refeito.
   */
  sync(segments: readonly PracticeSegment[], loop: PracticeLoop | null, now: number): void;
  /** Encerra a prática agora: notas em aberto não contam. */
  stop(): void;
  result(): PracticeResult;
}

interface Piece {
  t0: number;
  t1: number;
  b0: number;
  b1: number;
  spb: number;
  lap: number;
  /** O trecho abre sem salto: troca de andamento no meio da música. */
  continues: boolean;
}

interface Motor extends Piece {
  engine: Engine;
  base: number;
  factor: number;
}

interface LapState {
  counts: Record<Judgment, number>;
  score: number;
  closed: boolean;
}

const EPSILON = 1e-6;

/**
 * Instante do primeiro início de compasso a partir de `after`, nos trechos dados: onde a troca de andamento vale, para o
 * motor novo começar num compasso inteiro. null se a música acaba antes.
 */
export function nextMeasureTime(song: Song, segments: readonly PracticeSegment[], after: number): number | null {
  const starts = [0];
  for (const m of song.measures) starts.push(starts[starts.length - 1] + m.beats);
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.endTime <= after) continue;
    const beat = s.beat + (Math.max(after, s.time) - s.time) / s.spb;
    const next = starts.find((b) => b >= beat - EPSILON);
    if (next === undefined || next >= starts[starts.length - 1] - EPSILON) return null;
    if (next < s.endBeat - EPSILON) return s.time + (next - s.beat) * s.spb;
  }
  return null;
}

const sameMapping = (a: Piece, b: Piece) =>
  a.lap === b.lap && Math.abs(a.spb - b.spb) < EPSILON * a.spb && Math.abs(a.b0 + (b.t0 - a.t0) / a.spb - b.b0) < EPSILON;

/**
 * A prática dentro da partida: um Motor por trecho de andamento constante dentro de uma volta do laço A–B (Decisões,
 * "Prática no motor"), costurados num placar só. O combo e a energia seguem de um motor para o outro; os pontos e a
 * precisão também saem por volta. Toda fronteira cai em início de compasso: a shell troca o andamento no próximo
 * compasso e o laço salta no fim de B. Sempre sem falha, e sem selos.
 */
export function createPractice(options: PracticeOptions): Practice {
  const { song, onEvent } = options;
  const baseSpb = 60 / (options.bpm ?? song.bpm);
  const measureStarts = [0];
  for (const m of song.measures) measureStarts.push(measureStarts[measureStarts.length - 1] + m.beats);
  const totalBeats = songDurationBeats(song);
  const startBeat = measureStarts[options.from];
  if (startBeat === undefined || options.from >= song.measures.length) throw new RangeError(`compasso inicial inválido: ${options.from}`);

  const measureAt = (beat: number) => {
    let i = 0;
    while (i + 1 < measureStarts.length && measureStarts[i + 1] <= beat + EPSILON) i++;
    return i;
  };

  const motors: Motor[] = [];
  const notes: EngineNote[] = [];
  const judgments: NoteJudgment[] = [];
  const counts = emptyCounts();
  const laps: LapState[] = [];
  let score = initialScore();
  let energy = ENERGY_START;
  let status: EngineStatus = 'playing';
  let lastLoop: PracticeLoop | null = null;
  let clock = -Infinity;
  let final: PracticeResult | undefined;

  const state = (): EngineState => ({
    ...score,
    energy: energyFraction(energy),
    accuracy: accuracyPercent(counts),
    judged: judgments.length,
    total: notes.length,
  });

  const summary = (lap: number): LapSummary => {
    const l = laps[lap];
    const own = motors.filter((m) => m.lap === lap);
    const factors: number[] = [];
    for (const m of own) if (factors.at(-1) !== m.factor) factors.push(m.factor);
    return {
      lap,
      from: own.length ? measureAt(own[0].b0) : options.from,
      to: own.length ? measureAt(own[own.length - 1].b1) : options.from,
      notes: own.reduce((sum, m) => sum + m.engine.notes.length, 0),
      counts: { ...l.counts },
      accuracy: accuracyPercent(l.counts),
      score: l.score,
      factors,
      complete: l.closed,
    };
  };

  const rebuildNotes = () => {
    notes.length = 0;
    for (const m of motors) {
      m.base = notes.length;
      for (const n of m.engine.notes) notes.push({ ...n, index: notes.length });
    }
    onEvent?.({ type: 'notes', notes });
  };

  function piecesOf(segments: readonly PracticeSegment[], loop: PracticeLoop | null): Piece[] {
    const loopEnd = loop ? measureStarts[loop.endMeasure + 1] : null;
    const out: Piece[] = [];
    let lap = 0;
    let started = false;
    segments.forEach((s, i) => {
      const jump = i > 0 && Math.abs(segments[i - 1].endBeat - s.beat) > EPSILON;
      if (!started) {
        if (s.endBeat <= startBeat + EPSILON || s.beat > startBeat + EPSILON) return;
        started = true;
      } else if (jump) lap++;
      const b0 = Math.max(s.beat, out.length ? s.beat : startBeat);
      const t0 = s.time + (b0 - s.beat) * s.spb;
      const open = !Number.isFinite(s.endBeat);
      const b1 = Math.min(totalBeats, open ? (loopEnd !== null && b0 < loopEnd - EPSILON ? loopEnd : totalBeats) : s.endBeat);
      if (b1 <= b0 + EPSILON) return;
      out.push({ t0, t1: t0 + (b1 - b0) * s.spb, b0, b1, spb: s.spb, lap, continues: out.length > 0 && !jump });
    });
    return out;
  }

  function divergence(desired: readonly Piece[], now: number): number | null {
    const live = motors.filter((m) => m.t1 > now);
    const want = desired.filter((p) => p.t1 > now);
    const at = (list: readonly Piece[], t: number) => list.find((p) => p.t0 <= t && t < p.t1) ?? null;
    const marks = [...new Set([now, ...live.flatMap((p) => [p.t0, p.t1]), ...want.flatMap((p) => [p.t0, p.t1])])]
      .filter((t) => t >= now)
      .sort((a, b) => a - b);
    for (let i = 0; i + 1 < marks.length; i++) {
      const mid = (marks[i] + marks[i + 1]) / 2;
      const have = at(live, mid);
      const need = at(want, mid);
      if (!have && !need) continue;
      if (!have || !need || !sameMapping(have, need)) return Math.max(marks[i], have?.t0 ?? -Infinity, need?.t0 ?? -Infinity);
    }
    return null;
  }

  function truncate(at: number): void {
    for (let i = motors.length - 1; i >= 0; i--) {
      const m = motors[i];
      if (m.t1 <= at) break;
      if (m.t0 >= at - EPSILON && m.engine.state.judged === 0) {
        motors.splice(i, 1);
        continue;
      }
      m.engine.retire(at);
      m.b1 = m.b0 + (at - m.t0) / m.spb;
      m.t1 = at;
    }
    while (laps.length && !motors.some((m) => m.lap === laps.length - 1)) laps.pop();
  }

  function onJudgment(motor: Motor, event: Extract<EngineEvent, { type: 'judgment' }>): void {
    if (status !== 'playing') return;
    const { judgment } = event;
    const applied = applyJudgment(score, judgment);
    score = applied.state;
    energy = applyEnergy(energy, judgment);
    counts[judgment]++;
    const record: NoteJudgment = {
      index: motor.base + event.index,
      noteIndex: event.noteIndex,
      measure: event.measure,
      string: event.string,
      midi: event.midi,
      judgment,
      issue: event.issue,
      offsetMs: event.offsetMs,
      cents: event.cents,
      playedMidi: event.playedMidi,
      points: applied.points,
    };
    judgments.push(record);
    const lap = laps[motor.lap];
    lap.counts[judgment]++;
    lap.score += applied.points;
    onEvent?.({ type: 'judgment', ...record, state: state(), lap: motor.lap });
  }

  function spawn(piece: Piece, from: number): void {
    const b0 = measureStarts[measureAt(from)];
    const section: MeasureRange = { from: measureAt(b0), to: measureAt(piece.b1) };
    const t0 = piece.t0 + (b0 - piece.b0) * piece.spb;
    const motor: Motor = { ...piece, t0, b0, engine: undefined as unknown as Engine, base: 0, factor: baseSpb / piece.spb };
    motor.engine = createEngine({
      song,
      startAt: t0,
      section,
      tiedIn: piece.continues || b0 > piece.b0 + EPSILON,
      bpm: 60 / piece.spb,
      a4: options.a4,
      latencySeconds: options.latencySeconds,
      windows: options.windows,
      toleranceCents: options.toleranceCents,
      sounding: options.sounding,
      noFail: true,
      onEvent: (event) => {
        if (event.type === 'judgment') onJudgment(motor, event);
      },
    });
    while (laps.length <= piece.lap) laps.push({ counts: emptyCounts(), score: 0, closed: false });
    motors.push(motor);
  }

  /** A volta fecha quando a seguinte já começou (o salto passou) e nenhuma nota dela segue em aberto. */
  function closeLaps(): void {
    laps.forEach((l, lap) => {
      if (l.closed) return;
      const next = motors.find((m) => m.lap === lap + 1);
      if (!next || next.t0 > clock) return;
      if (motors.some((m) => m.lap === lap && m.engine.status === 'playing')) return;
      l.closed = true;
      onEvent?.({ type: 'lap', summary: summary(lap) });
    });
  }

  function finish(completeLast: boolean): void {
    if (status !== 'playing') return;
    status = 'finished';
    while (laps.length > 1 && !laps.at(-1)!.closed && motors.find((m) => m.lap === laps.length - 1)!.t0 > clock) laps.pop();
    const last = laps.length - 1;
    if (last >= 0 && completeLast && !laps[last].closed) laps[last].closed = true;
    const lapSummaries = laps.map((_, lap) => summary(lap));
    let bestLap: number | null = null;
    lapSummaries.forEach((l, i) => {
      if (!l.complete || l.counts.perfect + l.counts.great + l.counts.good + l.counts.miss === 0) return;
      const best = bestLap === null ? null : lapSummaries[bestLap];
      if (!best || l.accuracy > best.accuracy) bestLap = i;
    });
    final = {
      ...buildResult({
        status: 'finished',
        judgments,
        score: score.score,
        maxCombo: score.maxCombo,
        energy: energyFraction(energy),
        totalMeasures: song.measures.length,
        alreadyEarned: BADGES.map((b) => b.id),
      }),
      laps: lapSummaries,
      bestLap,
    };
    onEvent?.({ type: 'done', result: final });
  }

  function checkEnd(): void {
    if (status !== 'playing' || lastLoop || !motors.length) return;
    const last = motors[motors.length - 1];
    if (last.b1 < totalBeats - EPSILON) return;
    if (motors.some((m) => m.engine.status === 'playing')) return;
    closeLaps();
    finish(true);
  }

  return {
    notes,
    get state() {
      return state();
    },
    get status() {
      return status;
    },
    get lap() {
      for (let i = motors.length - 1; i >= 0; i--) if (motors[i].engine.state.judged > 0) return motors[i].lap;
      return 0;
    },
    get laps() {
      return laps.map((_, lap) => summary(lap));
    },
    sync(segments, loop, now) {
      if (status !== 'playing') return;
      clock = Math.max(clock, now);
      lastLoop = loop;
      const desired = piecesOf(segments, loop);
      const at = divergence(desired, now);
      if (at === null) return;
      truncate(at);
      for (const piece of desired) if (piece.t1 > at + EPSILON) spawn(piece, piece.b0 + Math.max(0, at - piece.t0) / piece.spb);
      rebuildNotes();
      closeLaps();
      checkEnd();
    },
    push(reading: PitchReading | null) {
      if (status !== 'playing') return;
      for (const m of motors) m.engine.push(reading);
    },
    advance(now: number) {
      if (status !== 'playing') return;
      clock = Math.max(clock, now);
      for (const m of motors) m.engine.advance(now);
      closeLaps();
      checkEnd();
    },
    retire(at: number) {
      if (status !== 'playing') return;
      truncate(at);
      rebuildNotes();
    },
    stop() {
      closeLaps();
      finish(false);
    },
    result() {
      if (!final) throw new Error('a prática ainda não terminou');
      return final;
    },
  };
}
