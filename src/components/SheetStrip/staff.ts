import { timeline, type Song } from '../../game/notation/song';
import type { StringIndex } from '../../game/notation/violin';

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

export interface StaffNote {
  index: number;
  /** Início, em tempos desde o começo da música. */
  at: number;
  step: number;
  hollow: boolean;
  stemUp: boolean;
  string: StringIndex;
  finger: number;
  tie: boolean;
}

export interface StaffLayout {
  notes: StaffNote[];
  /** Começo de cada compasso, em tempos. */
  bars: number[];
  totalBeats: number;
  fifths: number;
}

const MIDDLE_LINE = E4 + 4;

export function staffLayout(song: Song): StaffLayout {
  const fifths = keyFifths(song.key);
  const bars: number[] = [];
  let start = 0;
  for (const m of song.measures) {
    bars.push(start);
    start += m.beats;
  }
  const notes = timeline(song).map((n) => {
    const step = diatonicStep(n.midi, fifths);
    return { index: n.index, at: n.at, step, hollow: n.beats >= 2, stemUp: step < MIDDLE_LINE, string: n.string, finger: n.finger, tie: n.tie === true };
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
