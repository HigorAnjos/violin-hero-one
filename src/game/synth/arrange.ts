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
 * Registro médio, que o alto-falante de celular toca: baixo e tímpano Mi2–Ré♯3, metais a partir do Lá2, acordes e arpejo
 * Mi3–Ré♯4. O que protege a detecção não é o registro, é `avoidMelody`: nenhuma nota da orquestra soa junto com a nota
 * esperada do violino nem a uma oitava dela.
 */
export const BASS_FLOOR = 40;
export const BRASS_FLOOR = 45;
export const CHORD_FLOOR = 52;
/** Uma nota que bate com a melodia pode descer até aqui antes de ser cortada. */
export const LOWEST_ORCHESTRA_MIDI = 28;
export const HIGHEST_ORCHESTRA_MIDI = CHORD_FLOOR + 11;
/** Distâncias proibidas, em semitons, entre uma nota da orquestra e a nota esperada que soa junto. */
export const FORBIDDEN_INTERVALS: readonly number[] = [0, 12];

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

export interface ArrangeOptions {
  /**
   * Padrão true: tira ou muda de oitava toda nota que soaria junto com a nota esperada do violino, ou a uma oitava dela,
   * para o vazamento no microfone nunca parecer a nota certa. Com fone o microfone não ouve a orquestra: false, completa.
   */
  avoidMelody?: boolean;
}

type MelodyNote = { at: number; beats: number; midi: number };

/** A nota da orquestra soaria junto com uma nota esperada na mesma altura ou a uma oitava? */
export function clashes(midi: number, beat: number, beats: number, melody: readonly MelodyNote[]): boolean {
  return melody.some(
    (note) =>
      note.at < beat + beats - EPSILON &&
      note.at + note.beats > beat + EPSILON &&
      FORBIDDEN_INTERVALS.includes(Math.abs(midi - note.midi)),
  );
}

/**
 * Acompanhamento derivado da melodia: em cada trecho, o acorde de I, IV ou V que cobre mais duração da melodia com
 * notas do acorde (a nota do tempo forte pesa mais); o último trecho é sempre I. Daí saem as partes de cada naipe.
 */
export function arrange(song: Song, options: ArrangeOptions = {}): Arrangement {
  const avoid = options.avoidMelody ?? true;
  const key = parseKey(song.key);
  const melody = timeline(song);
  const spans = chordSpans(song);
  const chords: ChordSpan[] = spans.map((span, i) => {
    const degree = i === spans.length - 1 ? 'I' : bestDegree(melody, key, span.beat, span.beats);
    return { ...span, degree, pitchClasses: triad(key, degree) };
  });

  // A mesma nota uma oitava abaixo e depois acima; nenhuma livre, a nota sai.
  const place = (midi: number, beat: number, beats: number): number | null => {
    if (!avoid) return midi;
    for (const candidate of [midi, midi - 12, midi + 12]) {
      if (candidate < LOWEST_ORCHESTRA_MIDI || candidate > HIGHEST_ORCHESTRA_MIDI + 12) continue;
      if (!clashes(candidate, beat, beats, melody)) return candidate;
    }
    return null;
  };
  const parts: Record<Part, PartNote[]> = { bass: [], pad: [], arpeggio: [], brass: [], timpani: [] };
  const add = (part: Part, beat: number, beats: number, midi: number | null, velocity: number) => {
    if (midi !== null) parts[part].push({ beat, beats, midi, velocity });
  };

  for (const { beat, beats, pitchClasses, downbeat } of chords) {
    const bassRoot = placeAbove(pitchClasses[0], BASS_FLOOR);
    add('bass', beat, beats, place(bassRoot, beat, beats), 1);
    for (const pc of pitchClasses) add('pad', beat, beats, place(placeAbove(pc, CHORD_FLOOR), beat, beats), 1);

    const pattern = [0, 1, 2, 1];
    const eighths = Math.round(beats * 2);
    for (let i = 0; i < eighths; i++) {
      const at = beat + i / 2;
      const order = [pattern[i % 4], ...[0, 1, 2].filter((k) => k !== pattern[i % 4])];
      const midi = order.map((k) => place(placeAbove(pitchClasses[k], CHORD_FLOOR), at, 0.5)).find((m) => m !== null) ?? null;
      add('arpeggio', at, 0.5, midi, i % 2 ? 0.7 : 1);
    }

    const accent = downbeat ? 1 : 0.75;
    const brassRoot = placeAbove(pitchClasses[0], BRASS_FLOOR);
    add('brass', beat, beats, place(brassRoot, beat, beats), accent);
    add('brass', beat, beats, place(brassRoot + 7, beat, beats), accent);
    const hit = Math.min(1, beats);
    add('timpani', beat, hit, place(bassRoot, beat, hit), downbeat ? 1 : 0.6);
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
