import { timeline, type Song } from '../notation/song';
import type { StringIndex } from '../notation/violin';

/** Pauta da faixa (SheetStrip.dc): linha de baixo (Mi4) em y 72, 5 px por grau. */
export const BOTTOM_LINE_Y = 72;
export const STEP_PX = 5;
const E4 = 30;
const TOP_LINE = E4 + 8;

const SHARP_LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const FLAT_LETTER = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

const MAJOR_FIFTHS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
};

/** Sustenidos (+) ou bemóis (−) da armadura, de "D major" / "B minor". */
export function keyFifths(key: string): number {
  const [tonic = 'C', mode = 'major'] = key.trim().split(/\s+/);
  const fifths = MAJOR_FIFTHS[tonic];
  if (fifths === undefined) return 0;
  return mode.toLowerCase().startsWith('min') ? fifths - 3 : fifths;
}

/** Grau diatônico (Dó0 = 0), escrito com sustenidos nas armaduras de sustenido e bemóis nas de bemol. */
export function diatonicStep(midi: number, fifths: number): number {
  const letters = fifths < 0 ? FLAT_LETTER : SHARP_LETTER;
  return (Math.floor(midi / 12) - 1) * 7 + letters[((midi % 12) + 12) % 12];
}

export const stepY = (step: number) => BOTTOM_LINE_Y - (step - E4) * STEP_PX;

/** Linhas suplementares (graus pares fora da pauta) entre a nota e a pauta. */
export function ledgerSteps(step: number): number[] {
  const out: number[] = [];
  for (let s = E4 - 2; s >= step; s -= 2) out.push(s);
  for (let s = TOP_LINE + 2; s <= step; s += 2) out.push(s);
  return out;
}

/** Armadura na clave de sol: posições (graus) dos sustenidos F C G D A E B e dos bemóis B E A D G C F. */
const SHARP_STEPS = [38, 35, 39, 36, 33, 37, 34];
const FLAT_STEPS = [34, 37, 33, 36, 32, 35, 31];

export function keySignature(fifths: number): { step: number; glyph: '♯' | '♭' }[] {
  const steps = fifths >= 0 ? SHARP_STEPS : FLAT_STEPS;
  return steps.slice(0, Math.abs(fifths)).map((step) => ({ step, glyph: fifths >= 0 ? '♯' : '♭' }));
}

export type Accidental = '♯' | '♭' | '♮';

const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const LETTER_SOLFEGE = ['Dó', 'Ré', 'Mi', 'Fá', 'Sol', 'Lá', 'Si'];
/** Letras (Dó = 0) na ordem em que entram na armadura: sustenidos F C G D A E B, bemóis B E A D G C F. */
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];

/** Alteração que a armadura dá à letra: +1, −1 ou 0. */
export function keyAlteration(letter: number, fifths: number): number {
  if (fifths > 0) return SHARP_ORDER.slice(0, fifths).includes(letter) ? 1 : 0;
  if (fifths < 0) return FLAT_ORDER.slice(0, -fifths).includes(letter) ? -1 : 0;
  return 0;
}

export interface Spelling {
  /** Grau diatônico (Dó0 = 0). */
  step: number;
  letter: number;
  /** −1, 0 ou +1 sobre a letra. */
  alteration: number;
  /** "Fá♯4". */
  name: string;
}

/** Como a nota se escreve na tonalidade: sustenidos nas armaduras de sustenido, bemóis nas de bemol. */
export function spell(midi: number, fifths: number): Spelling {
  const step = diatonicStep(midi, fifths);
  const letter = ((step % 7) + 7) % 7;
  const alteration = (((midi % 12) - LETTER_PC[letter] + 18) % 12) - 6;
  const sign = alteration > 0 ? '♯' : alteration < 0 ? '♭' : '';
  return { step, letter, alteration, name: `${LETTER_SOLFEGE[letter]}${sign}${Math.floor(midi / 12) - 1}` };
}

/** Figura da nota pela duração em semínimas: cabeça vazada, haste, colchetes e ponto. */
export interface NoteShape {
  hollow: boolean;
  stem: boolean;
  flags: 0 | 1 | 2;
  dotted: boolean;
}

const SHAPES: readonly [number, Omit<NoteShape, 'dotted'>][] = [
  [4, { hollow: true, stem: false, flags: 0 }],
  [2, { hollow: true, stem: true, flags: 0 }],
  [1, { hollow: false, stem: true, flags: 0 }],
  [0.5, { hollow: false, stem: true, flags: 1 }],
  [0, { hollow: false, stem: true, flags: 2 }],
];

export function noteShape(quarters: number): NoteShape {
  const [base, shape] = SHAPES.find(([min]) => quarters >= min - 1e-9) ?? SHAPES[SHAPES.length - 1];
  const unit = base === 0 ? 0.25 : base;
  return { ...shape, dotted: Math.abs(quarters - unit * 1.5) < 1e-6 };
}

export interface StaffNote extends NoteShape {
  index: number;
  measure: number;
  /** Início, em tempos desde o começo da música. */
  at: number;
  beats: number;
  step: number;
  stemUp: boolean;
  string: StringIndex;
  finger: number;
  tie: boolean;
  midi: number;
  name: string;
  /** Acidente escrito antes da nota (fora da armadura ou desfazendo outro do mesmo compasso). */
  accidental: Accidental | null;
}

export interface StaffLayout {
  notes: StaffNote[];
  /** Começo de cada compasso, em tempos. */
  bars: number[];
  totalBeats: number;
  fifths: number;
}

const MIDDLE_LINE = E4 + 4;
const GLYPH: Record<number, Accidental> = { 1: '♯', [-1]: '♭', 0: '♮' };

export function staffLayout(song: Song): StaffLayout {
  const fifths = keyFifths(song.key);
  const bars: number[] = [];
  let start = 0;
  for (const m of song.measures) {
    bars.push(start);
    start += m.beats;
  }
  const quarter = 4 / song.timeSignature.unit;
  // O acidente vale até o fim do compasso, na mesma altura escrita
  let measure = -1;
  const inForce = new Map<number, number>();
  const notes = timeline(song).map((n): StaffNote => {
    if (n.measure !== measure) {
      measure = n.measure;
      inForce.clear();
    }
    const spelling = spell(n.midi, fifths);
    const current = inForce.get(spelling.step) ?? keyAlteration(spelling.letter, fifths);
    const accidental = !n.tie && spelling.alteration !== current ? GLYPH[spelling.alteration] : null;
    inForce.set(spelling.step, spelling.alteration);
    return {
      index: n.index,
      measure: n.measure,
      at: n.at,
      beats: n.beats,
      step: spelling.step,
      stemUp: spelling.step < MIDDLE_LINE,
      string: n.string,
      finger: n.finger,
      tie: n.tie === true,
      midi: n.midi,
      name: spelling.name,
      accidental,
      ...noteShape(n.beats * quarter),
    };
  });
  return { notes, bars, totalBeats: start, fifths };
}

/** Compasso (a partir de 0) em que cai o tempo `beat`. */
export function measureAt(bars: readonly number[], beat: number): number {
  let m = 0;
  while (m + 1 < bars.length && bars[m + 1] <= beat) m++;
  return m;
}

/** "1:42". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
