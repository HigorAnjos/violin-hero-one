import { timeline, type Measure, type Song, type TimeSignature } from '../notation/song';
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

/** Figura da pausa em semínimas: semibreve (4) a semicolcheia (0,25). */
export type RestValue = 4 | 2 | 1 | 0.5 | 0.25;

/** Pausa dentro do compasso, em tempos desde o começo dele (como SongNote.beat). */
export interface MeasureRest {
  beat: number;
  beats: number;
  value: RestValue;
  dotted: boolean;
}

const EPSILON = 1e-6;
/** Figuras que a pausa pode ter, da maior para a menor: [semínimas, figura, pontuada]. */
const REST_FIGURES: readonly [number, RestValue, boolean][] = [
  [4, 4, false],
  [3, 2, true],
  [2, 2, false],
  [1.5, 1, true],
  [1, 1, false],
  [0.75, 0.5, true],
  [0.5, 0.5, false],
  [0.25, 0.25, false],
];

const isMultiple = (x: number, of: number) => Math.abs(x / of - Math.round(x / of)) < EPSILON;

/**
 * Pode uma pausa de `length` semínimas começar em `p` (semínimas desde o tempo forte do compasso)? Mais longa que o
 * tempo: começa num tempo, vale tempos inteiros e, em 4/4 e afins, não atravessa o meio do compasso; a de dois tempos
 * ou mais começa num tempo ímpar (1 ou 3). Mais curta: fica dentro de um tempo, alinhada ao próprio valor, e a
 * pontuada só no começo do tempo.
 */
function restFits(p: number, length: number, dotted: boolean, beat: number, bar: number): boolean {
  if (length >= beat - EPSILON) {
    if (!isMultiple(p, beat) || !isMultiple(length, beat)) return false;
    if (length > beat + EPSILON && !isMultiple(p, 2 * beat)) return false;
    const beats = Math.round(bar / beat);
    const half = beats % 2 === 0 && beats >= 4 ? bar / 2 : NaN;
    return !(p < half - EPSILON && p + length > half + EPSILON);
  }
  const start = Math.floor((p + EPSILON) / beat) * beat;
  if (p + length > start + beat + EPSILON) return false;
  return dotted ? Math.abs(p - start) < EPSILON : isMultiple(p - start, length);
}

/**
 * As pausas de um compasso, derivadas do vão entre as notas (o modelo Song não tem pausa explícita), em figuras
 * legíveis pela métrica: compasso inteiro vazio é a pausa de semibreve; o resto se decompõe do maior valor que cabe
 * para o menor, respeitando os tempos. Na anacruse (primeiro compasso mais curto) o compasso é o fim de um inteiro.
 */
export function measureRests(measure: Measure, time: TimeSignature, pickup = false): MeasureRest[] {
  const quarter = 4 / time.unit;
  const bar = time.beats * quarter;
  const compound = time.unit === 8 && time.beats % 3 === 0 && time.beats > 3;
  const beat = compound ? 1.5 : quarter;
  if (measure.notes.length === 0 && Math.abs(measure.beats - time.beats) < EPSILON) {
    return [{ beat: 0, beats: measure.beats, value: 4, dotted: false }];
  }
  const offset = pickup ? time.beats - measure.beats : 0;
  const rests: MeasureRest[] = [];
  const fill = (from: number, to: number) => {
    let p = (from + offset) * quarter;
    const end = (to + offset) * quarter;
    while (p < end - EPSILON) {
      const figure = REST_FIGURES.find(([length, , dotted]) => p + length <= end + EPSILON && restFits(p, length, dotted, beat, bar));
      if (!figure) {
        // Resto que nenhuma figura escreve (quiáltera): pula até a próxima semicolcheia
        p = Math.min(end, (Math.floor(p / 0.25 + EPSILON) + 1) * 0.25);
        continue;
      }
      const [length, value, dotted] = figure;
      rests.push({ beat: p / quarter - offset, beats: length / quarter, value, dotted });
      p += length;
    }
  };
  let cursor = 0;
  for (const note of measure.notes) {
    if (note.beat > cursor + EPSILON) fill(cursor, note.beat);
    cursor = Math.max(cursor, note.beat + note.beats);
  }
  if (cursor < measure.beats - EPSILON) fill(cursor, measure.beats);
  return rests;
}

export interface StaffRest extends MeasureRest {
  measure: number;
  /** Início, em tempos desde o começo da música. */
  at: number;
}

/** Arco entre duas notas ligadas: `from` é a nota que ataca (ou a ligada anterior), `to` a que continua. */
export interface StaffTie {
  from: number;
  to: number;
  /** Inícios das duas notas, em tempos desde o começo da música. */
  fromAt: number;
  toAt: number;
  step: number;
  /** Do lado contrário à haste: abaixo das cabeças quando a haste sobe. */
  below: boolean;
  /** A primeira nota tem ponto: o arco começa depois dele. */
  dotted: boolean;
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
  /** Em ordem de início. */
  rests: StaffRest[];
  /** Em ordem de início da nota que continua (e da que ataca, porque não se sobrepõem). */
  ties: StaffTie[];
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
  const rests = song.measures.flatMap((m, i) =>
    measureRests(m, song.timeSignature, i === 0 && m.beats < song.timeSignature.beats).map((r): StaffRest => ({ ...r, measure: i, at: bars[i] + r.beat })),
  );
  const ties = notes.flatMap((n, i): StaffTie[] => {
    const from = notes[i - 1];
    if (!n.tie || !from) return [];
    return [{ from: i - 1, to: i, fromAt: from.at, toAt: n.at, step: from.step, below: from.stemUp, dotted: from.dotted }];
  });
  return { notes, rests, ties, bars, totalBeats: start, fifths };
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
