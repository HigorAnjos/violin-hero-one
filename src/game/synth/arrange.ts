import type { OrchestraSection } from '../../assets/styles/themes/types';
import { timeline, type Song } from '../notation/song';

export type Degree = 'I' | 'IV' | 'V';
export type Mode = 'major' | 'minor';

export interface Key {
  tonic: number;
  mode: Mode;
}

const DEGREE_ROOT: Readonly<Record<Degree, number>> = { I: 0, IV: 5, V: 7 };
const PREFERENCE: readonly Degree[] = ['I', 'V', 'IV'];
const MAJOR_TRIAD = [0, 4, 7] as const;
const MINOR_TRIAD = [0, 3, 7] as const;
const DOWNBEAT_BONUS = 0.5;
const EPSILON = 1e-9;

/**
 * Registros da orquestra: baixo Mi1–Ré♯2 e acordes Mi2–Ré♯3, no máximo ~157 Hz no Lá 442 (~166 Hz no Lá 466). Tudo
 * abaixo do passa-alta de 170 Hz do Ouvido e uma quarta abaixo do Sol3, então o vazamento pelo alto-falante não vira
 * leitura de altura.
 */
export const BASS_FLOOR = 28;
export const CHORD_FLOOR = 40;
export const HIGHEST_ORCHESTRA_MIDI = CHORD_FLOOR + 11;

export type Part = 'bass' | 'pad' | 'arpeggio' | 'brass' | 'timpani';
export const PARTS: readonly Part[] = ['bass', 'pad', 'arpeggio', 'brass', 'timpani'];

export const PART_SECTION: Readonly<Record<Part, OrchestraSection>> = {
  bass: 'strings',
  pad: 'strings',
  arpeggio: 'woodwinds',
  brass: 'brass',
  timpani: 'percussion',
};

export interface PartNote {
  /** Início, em tempos desde o primeiro tempo da música (o mesmo `at` da timeline). */
  beat: number;
  beats: number;
  midi: number;
  /** 0 a 1. */
  velocity: number;
}

export interface ChordSpan {
  beat: number;
  beats: number;
  degree: Degree;
  /** Classes de altura da tríade, fundamental primeiro. */
  pitchClasses: number[];
  /** Começa no primeiro tempo do compasso. */
  downbeat: boolean;
}

export interface Arrangement {
  key: Key;
  chords: ChordSpan[];
  parts: Record<Part, PartNote[]>;
}

const LETTER_PC: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "D major", "F# minor", "B♭ major"… */
export function parseKey(key: string): Key {
  const match = /^\s*([A-G])([#♯b♭]?)\s+(major|minor)\s*$/i.exec(key);
  if (!match) throw new RangeError(`tonalidade "${key}" não suportada: esperado "<nota> major" ou "<nota> minor"`);
  const accidental = match[2] === '#' || match[2] === '♯' ? 1 : match[2] === 'b' || match[2] === '♭' ? -1 : 0;
  return { tonic: mod12(LETTER_PC[match[1].toUpperCase()] + accidental), mode: match[3].toLowerCase() as Mode };
}

/** Tríade do grau; no menor, i e iv menores e V maior (menor harmônica). */
export function triad(key: Key, degree: Degree): number[] {
  const shape = key.mode === 'minor' && degree !== 'V' ? MINOR_TRIAD : MAJOR_TRIAD;
  return shape.map((step) => mod12(key.tonic + DEGREE_ROOT[degree] + step));
}

/** O midi mais grave de `pitchClass` a partir de `lowest`. */
export function placeAbove(pitchClass: number, lowest: number): number {
  return lowest + mod12(pitchClass - lowest);
}

/** Meio compasso por acorde nos compassos pares completos; compasso inteiro nos ímpares, na anacruse e no último curto. */
export function chordSpans(song: Song): Omit<ChordSpan, 'degree' | 'pitchClasses'>[] {
  const spans: Omit<ChordSpan, 'degree' | 'pitchClasses'>[] = [];
  const full = song.timeSignature.beats;
  let start = 0;
  for (const measure of song.measures) {
    const span = Math.abs(measure.beats - full) < EPSILON && full % 2 === 0 ? full / 2 : measure.beats;
    for (let beat = 0; beat < measure.beats - EPSILON; beat += span) {
      spans.push({ beat: start + beat, beats: Math.min(span, measure.beats - beat), downbeat: beat === 0 });
    }
    start += measure.beats;
  }
  return spans;
}

/**
 * Acompanhamento derivado da melodia: em cada trecho, o acorde de I, IV ou V que cobre mais duração da melodia com
 * notas do acorde (a nota do tempo forte pesa mais); o último trecho é sempre I. Daí saem as partes de cada naipe.
 */
export function arrange(song: Song): Arrangement {
  const key = parseKey(song.key);
  const melody = timeline(song);
  const spans = chordSpans(song);
  const chords: ChordSpan[] = spans.map((span, i) => {
    const degree = i === spans.length - 1 ? 'I' : bestDegree(melody, key, span.beat, span.beats);
    return { ...span, degree, pitchClasses: triad(key, degree) };
  });

  const parts: Record<Part, PartNote[]> = { bass: [], pad: [], arpeggio: [], brass: [], timpani: [] };
  for (const { beat, beats, pitchClasses, downbeat } of chords) {
    const root = placeAbove(pitchClasses[0], BASS_FLOOR);
    parts.bass.push({ beat, beats, midi: root, velocity: 1 });
    for (const pc of pitchClasses) parts.pad.push({ beat, beats, midi: placeAbove(pc, CHORD_FLOOR), velocity: 1 });
    const arpeggio = [0, 1, 2, 1].map((i) => placeAbove(pitchClasses[i], CHORD_FLOOR));
    const eighths = Math.round(beats * 2);
    for (let i = 0; i < eighths; i++) {
      parts.arpeggio.push({ beat: beat + i / 2, beats: 0.5, midi: arpeggio[i % 4], velocity: i % 2 ? 0.7 : 1 });
    }
    const accent = downbeat ? 1 : 0.75;
    parts.brass.push({ beat, beats, midi: root, velocity: accent }, { beat, beats, midi: root + 7, velocity: accent });
    parts.timpani.push({ beat, beats: Math.min(1, beats), midi: root, velocity: downbeat ? 1 : 0.6 });
  }
  return { key, chords, parts };
}

function bestDegree(melody: readonly { at: number; beats: number; midi: number }[], key: Key, from: number, beats: number): Degree {
  const to = from + beats;
  let best: Degree = PREFERENCE[0];
  let bestScore = -Infinity;
  for (const degree of PREFERENCE) {
    const tones = new Set(triad(key, degree));
    let score = 0;
    for (const note of melody) {
      if (!tones.has(mod12(note.midi))) continue;
      score += Math.max(0, Math.min(to, note.at + note.beats) - Math.max(from, note.at));
      if (note.at <= from + EPSILON && note.at + note.beats > from + EPSILON) score += DOWNBEAT_BONUS;
    }
    if (score > bestScore + EPSILON) {
      best = degree;
      bestScore = score;
    }
  }
  return best;
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}
