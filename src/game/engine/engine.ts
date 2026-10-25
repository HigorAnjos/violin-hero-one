import type { PitchReading } from '../audio/types';
import { timeline, type Song } from '../notation/song';
import { DEFAULT_A4, midiToFrequency } from '../notation/violin';
import { ENERGY_START, applyEnergy, energyFraction } from './energy';
import { createJudge, type Verdict } from './judge';
import { buildResult } from './result';
import { DEFAULT_TOLERANCE_CENTS, DEFAULT_WINDOWS, accuracyPercent, applyJudgment, emptyCounts, initialScore, judgeHit } from './score';
import type {
  BadgeId,
  Engine,
  EngineListener,
  EngineNote,
  EngineState,
  EngineStatus,
  GameResult,
  NoteJudgment,
  TimingWindows,
} from './types';

/** Trecho de compassos, a partir de 0: de `from` (incluso) a `to` (excluso). */
export interface MeasureRange {
  from: number;
  to: number;
}

export interface EngineOptions {
  song: Song;
  /** Tempo do AudioContext, em segundos, do primeiro tempo da música (ou do trecho, com `section`). */
  startAt: number;
  /**
   * Só este trecho é julgado (o loop A–B da prática). Cada volta e cada troca de andamento é um motor novo: as notas
   * vão para o relógio do AudioContext na criação, e criar é barato.
   */
  section?: MeasureRange;
  /** Andamento da partida; padrão: o da música. */
  bpm?: number;
  /** Lá de referência, em Hz. */
  a4?: number;
  /** Latência calibrada, em segundos, descontada de PitchReading.time. */
  latencySeconds?: number;
  windows?: TimingWindows;
  /** Desvio máximo, em cents, para a nota contar como certa. */
  toleranceCents?: number;
  /** Modo "a música não para": a energia cai, mas a orquestra nunca para. */
  noFail?: boolean;
  /** Selos já conquistados, para o resultado listar só os novos. */
  earnedBadges?: readonly BadgeId[];
  /**
   * Orchestra.soundingAt, para descartar leitura que é a orquestra vazando no microfone e não a nota esperada. Sem ele,
   * nada é descartado.
   */
  sounding?: (time: number) => readonly number[];
  onEvent?: EngineListener;
}

/**
 * Os ataques da música no relógio do AudioContext; a nota ligada só estende a duração da anterior. Com `section`, só as
 * notas do trecho, com o primeiro tempo dele em `startAt`; a ligada que abre o trecho vira ataque.
 */
export function scheduleNotes(
  song: Song,
  startAt: number,
  bpm: number = song.bpm,
  a4: number = DEFAULT_A4,
  section?: MeasureRange,
): EngineNote[] {
  const spb = 60 / bpm;
  const from = section?.from ?? 0;
  const to = section?.to ?? song.measures.length;
  const offset = song.measures.slice(0, from).reduce((total, m) => total + m.beats, 0);
  const notes: EngineNote[] = [];
  for (const n of timeline(song)) {
    if (n.measure < from || n.measure >= to) continue;
    const previous = notes[notes.length - 1];
    if (n.tie && previous) {
      previous.duration += n.beats * spb;
      continue;
    }
    notes.push({
      index: notes.length,
      noteIndex: n.index,
      measure: n.measure,
      time: startAt + (n.at - offset) * spb,
      duration: n.beats * spb,
      midi: n.midi,
      string: n.string,
      finger: n.finger,
      frequency: midiToFrequency(n.midi, a4),
    });
  }
  return notes;
}

export function createEngine(options: EngineOptions): Engine {
  const { song, onEvent } = options;
  const windows = options.windows ?? DEFAULT_WINDOWS;
  const tolerance = options.toleranceCents ?? DEFAULT_TOLERANCE_CENTS;
  const notes = scheduleNotes(song, options.startAt, options.bpm ?? song.bpm, options.a4 ?? DEFAULT_A4, options.section);
  const judgments: NoteJudgment[] = [];
  const counts = emptyCounts();

  let score = initialScore();
  let energy = ENERGY_START;
  let status: EngineStatus = notes.length ? 'playing' : 'finished';
  let final: GameResult | undefined;

  const state = (): EngineState => ({
    ...score,
    energy: energyFraction(energy),
    accuracy: accuracyPercent(counts),
    judged: judgments.length,
    total: notes.length,
  });

  function toJudgment(verdict: Verdict): Omit<NoteJudgment, 'points'> {
    const note = notes[verdict.index];
    const base = { index: note.index, noteIndex: note.noteIndex, measure: note.measure, string: note.string, midi: note.midi };
    if (verdict.kind === 'hit') {
      const { judgment, issue } = judgeHit(verdict.offsetMs, verdict.cents, windows, tolerance);
      return { ...base, judgment, issue, offsetMs: verdict.offsetMs, cents: verdict.cents, playedMidi: null };
    }
    const a = verdict.attempt;
    if (!a) return { ...base, judgment: 'miss', issue: 'not-played', offsetMs: null, cents: null, playedMidi: null };
    const issue =
      a.kind === 'timing' ? (a.offsetMs > 0 ? 'late' : 'early') : a.kind === 'tuning' ? (a.cents > 0 ? 'sharp' : 'flat') : 'wrong-note';
    return {
      ...base,
      judgment: 'miss',
      issue,
      offsetMs: a.offsetMs,
      cents: a.cents,
      playedMidi: a.kind === 'wrong' ? a.playedMidi : null,
    };
  }

  function finish(next: GameResult['status']): void {
    status = next;
    final = buildResult({
      status: next,
      judgments,
      score: score.score,
      maxCombo: score.maxCombo,
      energy: energyFraction(energy),
      totalMeasures: song.measures.length,
      heldCents: judge.heldCents,
      alreadyEarned: options.earnedBadges,
    });
    onEvent?.({ type: next === 'failed' ? 'gameover' : 'done', result: final });
  }

  const judge = createJudge(
    notes,
    { windows, toleranceCents: tolerance, latencySeconds: options.latencySeconds, sounding: options.sounding },
    (verdict) => {
      if (status !== 'playing') return;
      const partial = toJudgment(verdict);
      const applied = applyJudgment(score, partial.judgment);
      score = applied.state;
      energy = applyEnergy(energy, partial.judgment);
      counts[partial.judgment]++;
      const record: NoteJudgment = { ...partial, points: applied.points };
      judgments.push(record);
      onEvent?.({ type: 'judgment', ...record, state: state() });
      if (energy <= 0 && !options.noFail) finish('failed');
      else if (judgments.length === notes.length) finish('finished');
    },
  );

  if (status === 'finished') finish('finished');

  return {
    notes,
    get state() {
      return state();
    },
    get status() {
      return status;
    },
    push(reading: PitchReading | null) {
      if (status === 'playing') judge.push(reading);
    },
    advance(now: number) {
      if (status === 'playing') judge.advance(now);
    },
    result() {
      if (!final) throw new Error('a partida ainda não terminou');
      return final;
    },
  };
}
