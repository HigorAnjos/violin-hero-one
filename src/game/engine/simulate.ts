import type { PitchReading } from '../audio/types';
import { DEFAULT_A4, midiToFrequency } from '../notation/violin';
import { createEngine, type EngineOptions } from './engine';
import { DETECTION_LAG_SECONDS } from './judge';
import type { EngineEvent, EngineNote, GameResult } from './types';

export const MAX_SIMULATE_MS = 1000;
export const HOP_SECONDS = 0.01;
/** Nota errada é um tom acima: longe de qualquer tolerância, nunca confundida com desafinação. */
export const WRONG_NOTE_SEMITONES = 2;
/** Pausa de arco destacado entre uma nota e a próxima; maior que NEW_ATTACK_GAP_SECONDS. */
export const DETACHED_GAP_SECONDS = 0.08;
/** Troca de arco em legato: o nível cai este tanto neste tempo, sem silêncio. */
export const BOW_CHANGE = { depthDb: 15, seconds: 0.03 };
const LEVEL_DB = -12;
const FRAME_SECONDS = 1 / 60;

/** Como uma nota é tocada; o padrão é no tempo, afinada e a nota certa. */
export interface NotePlay {
  offsetMs?: number;
  cents?: number;
  /** Semitons de diferença da nota certa (nota errada). */
  semitones?: number;
  /** Não tocar a nota. */
  skip?: boolean;
}

export interface PerformanceOptions {
  /** Atraso de todas as notas, em ms (negativo = adiantado). */
  offsetMs?: number;
  /** Quantas notas sair erradas, sorteadas com `seed`. */
  errors?: number;
  /** Notas erradas explícitas (índices de ataque); substitui `errors`. */
  wrong?: readonly number[];
  seed?: number;
  /** Latência do aparelho somada à hora das leituras (o que a calibração desconta). */
  latencySeconds?: number;
  /** Vibrato senoidal de 5,5 Hz com esta profundidade, em cents. */
  vibratoCents?: number;
  /** detached: silêncio curto entre notas; legato: só a queda de nível da troca de arco. */
  articulation?: 'detached' | 'legato';
  /** Ajuste nota a nota, aplicado por cima do resto. */
  perNote?: (note: EngineNote) => NotePlay | undefined;
}

export interface TimedReading {
  time: number;
  reading: PitchReading | null;
}

export interface Performance {
  readings: TimedReading[];
  /** Índices de ataque tocados errados. */
  wrong: number[];
}

/** Gerador pseudoaleatório pequeno e determinístico (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` índices distintos sorteados com a semente, em ordem. */
export function pickWrongNotes(noteCount: number, count: number, seed = 1): number[] {
  const n = Math.max(0, Math.min(noteCount, Math.floor(count)));
  const indices = Array.from({ length: noteCount }, (_, i) => i);
  const random = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (noteCount - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, n).sort((a, b) => a - b);
}

function reading(time: number, hz: number, a4: number, level: number): PitchReading {
  const exact = 69 + 12 * Math.log2(hz / a4);
  const midi = Math.round(exact);
  return { time, hz, midi, cents: (exact - midi) * 100, clarity: 0.97, level };
}

interface Sounded {
  onset: number;
  end: number;
  hz: number;
}

/**
 * As leituras que o Ouvido emitiria para um violinista sintético tocando as notas: uma a cada 10 ms, com o atraso
 * da janela de altura (DETECTION_LAG_SECONDS) e a latência do aparelho. Determinístico.
 */
export function renderPerformance(notes: readonly EngineNote[], a4: number = DEFAULT_A4, options: PerformanceOptions = {}): Performance {
  const { offsetMs = 0, errors = 0, seed = 1, latencySeconds = 0, vibratoCents = 0, articulation = 'detached' } = options;
  const wrong = options.wrong ? [...options.wrong] : pickWrongNotes(notes.length, errors, seed);
  const wrongSet = new Set(wrong);
  const sounded: Sounded[] = [];
  for (const note of notes) {
    const play: NotePlay = {
      offsetMs,
      semitones: wrongSet.has(note.index) ? WRONG_NOTE_SEMITONES : 0,
      ...options.perNote?.(note),
    };
    if (play.skip) continue;
    const onset = note.time + (play.offsetMs ?? 0) / 1000;
    const hz = midiToFrequency(note.midi + (play.semitones ?? 0), a4) * 2 ** ((play.cents ?? 0) / 1200);
    sounded.push({ onset, end: onset + note.duration, hz });
  }

  const delay = DETECTION_LAG_SECONDS + latencySeconds;
  const vibrato = (t: number) => 2 ** ((vibratoCents * Math.sin(2 * Math.PI * 5.5 * t)) / 1200);
  const readings: TimedReading[] = [];
  const steps = (from: number, to: number) => Math.max(0, Math.floor((to - from) / HOP_SECONDS + 1e-9) + 1);

  if (articulation === 'detached') {
    sounded.forEach((s, i) => {
      const next = sounded[i + 1];
      const stop = Math.min(s.end, next ? next.onset : Infinity) - DETACHED_GAP_SECONDS;
      const count = steps(s.onset, Math.max(s.onset + 0.05, stop));
      for (let k = 0; k < count; k++) {
        const t = s.onset + k * HOP_SECONDS;
        readings.push({ time: t + delay, reading: reading(t + delay, s.hz * vibrato(t), a4, LEVEL_DB) });
      }
      const last = s.onset + (count - 1) * HOP_SECONDS + delay;
      readings.push({ time: last + HOP_SECONDS / 2, reading: null });
    });
    return { readings, wrong };
  }

  if (sounded.length === 0) return { readings, wrong };
  const first = sounded[0].onset;
  const last = sounded[sounded.length - 1].end;
  const dipGain = -BOW_CHANGE.depthDb;
  const count = steps(first + DETECTION_LAG_SECONDS, last);
  let source = 0;
  for (let k = 0; k < count; k++) {
    const s = first + DETECTION_LAG_SECONDS + k * HOP_SECONDS;
    while (source + 1 < sounded.length && sounded[source + 1].onset <= s - DETECTION_LAG_SECONDS + 1e-9) source++;
    const dip = sounded.some((n, i) => i > 0 && s >= n.onset - BOW_CHANGE.seconds && s < n.onset);
    const t = s + latencySeconds;
    readings.push({ time: t, reading: reading(t, sounded[source].hz * vibrato(s), a4, LEVEL_DB + (dip ? dipGain : 0)) });
  }
  readings.push({ time: readings[readings.length - 1].time + HOP_SECONDS / 2, reading: null });
  return { readings, wrong };
}

export interface Simulation {
  result: GameResult;
  events: EngineEvent[];
  wrong: number[];
}

/** Uma partida inteira sem áudio: o violinista sintético alimenta o motor, quadro a quadro, até o fim ou o game over. */
export function simulateGame(options: Omit<EngineOptions, 'onEvent'>, performance: PerformanceOptions = {}): Simulation {
  const events: EngineEvent[] = [];
  const engine = createEngine({ ...options, onEvent: (e) => events.push(e) });
  const a4 = options.a4 ?? DEFAULT_A4;
  const take = renderPerformance(engine.notes, a4, performance);
  let frame = options.startAt - 1;
  for (const { time, reading } of take.readings) {
    for (; frame + FRAME_SECONDS <= time; frame += FRAME_SECONDS) engine.advance(frame + FRAME_SECONDS);
    engine.push(reading);
  }
  const lastNote = engine.notes[engine.notes.length - 1];
  const end = (lastNote ? lastNote.time + lastNote.duration : options.startAt) + 3;
  for (; engine.status === 'playing' && frame < end; frame += FRAME_SECONDS) engine.advance(frame + FRAME_SECONDS);
  return { result: engine.result(), events, wrong: take.wrong };
}

export interface SimulateParams {
  offsetMs: number;
  errors: number;
}

/** ?simular=<ms>[&erros=N]: ms em ±1000 (vírgula ou ponto), N inteiro não negativo; null se ausente ou inválido. */
export function parseSimulate(search: string): SimulateParams | null {
  const params = new URLSearchParams(search);
  const raw = params.get('simular');
  if (raw == null || raw.trim() === '') return null;
  const offsetMs = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) > MAX_SIMULATE_MS) return null;
  const rawErrors = params.get('erros');
  const errors = rawErrors == null || rawErrors.trim() === '' ? 0 : Number(rawErrors.trim());
  if (!Number.isInteger(errors) || errors < 0) return null;
  return { offsetMs, errors };
}
