// Editor de partitura (ScoreEditor.dc): as operações sobre uma música em edição, puras e sem tela. A fonte da verdade
// é a melodia em semínimas desde o começo da música; a Song sai dela a cada passo (compassos sempre cheios, pausa no
// vão, nota que passa da barra vira ligadura) com o dedilhado sugerido. O ditado entra pelo mesmo insertNote da tela.
import { fingerMelody, placements } from './fingering';
import { LEVEL_RULES } from './levels';
import { SONG_FORMAT_VERSION, songProblems, type Finger, type Level, type Song, type SongNote, type TimeSignature } from './song';
import { HIGHEST_MIDI, LOWEST_MIDI, type StringIndex } from './violin';

const EPSILON = 1e-6;
const tidy = (value: number) => Math.round(value * 1e9) / 1e9;
const same = (a: number, b: number) => Math.abs(a - b) < EPSILON;

/** Figuras da paleta, em semínimas: a tecla 1 é a semibreve, a 5 a semicolcheia. */
export const DURATIONS = [4, 2, 1, 0.5, 0.25] as const;
export type Duration = (typeof DURATIONS)[number];

export const DURATION_NAMES: Record<Duration, string> = {
  4: 'semibreve',
  2: 'mínima',
  1: 'semínima',
  0.5: 'colcheia',
  0.25: 'semicolcheia',
};

export const TIME_SIGNATURES: readonly TimeSignature[] = [
  { beats: 2, unit: 4 },
  { beats: 3, unit: 4 },
  { beats: 4, unit: 4 },
  { beats: 6, unit: 8 },
];

/** Tonalidades do seletor: as que cabem bem no violino até a 3ª posição. `key` é o formato de Song.key. */
export const KEY_CHOICES: readonly { key: string; fifths: number; label: string }[] = [
  { key: 'C major', fifths: 0, label: 'Dó maior' },
  { key: 'G major', fifths: 1, label: 'Sol maior' },
  { key: 'D major', fifths: 2, label: 'Ré maior' },
  { key: 'A major', fifths: 3, label: 'Lá maior' },
  { key: 'E major', fifths: 4, label: 'Mi maior' },
  { key: 'F major', fifths: -1, label: 'Fá maior' },
  { key: 'Bb major', fifths: -2, label: 'Si♭ maior' },
  { key: 'Eb major', fifths: -3, label: 'Mi♭ maior' },
  { key: 'A minor', fifths: 0, label: 'Lá menor' },
  { key: 'E minor', fifths: 1, label: 'Mi menor' },
  { key: 'B minor', fifths: 2, label: 'Si menor' },
  { key: 'D minor', fifths: -1, label: 'Ré menor' },
  { key: 'G minor', fifths: -2, label: 'Sol menor' },
];

export const MIN_BPM = 30;
export const MAX_BPM = 240;
/** Compassos de uma partitura nova. */
export const STARTING_MEASURES = 4;
const HISTORY_LIMIT = 200;

export interface Placement {
  string: StringIndex;
  finger: Finger;
}

/** Nota em edição, em semínimas desde o começo da música (não do compasso): mudar o compasso não mexe nela. */
export interface EditorNote {
  at: number;
  length: number;
  midi: number;
  /** Ligada à nota anterior, que termina colada e tem a mesma altura. */
  tie?: boolean;
  /** Corda e dedo escolhidos pela pessoa; sem isso, vale o sugerido. */
  placement?: Placement;
}

/** O que a Song leva além das notas. */
export interface EditorMeta {
  id: string;
  title: string;
  composer: string;
  key: string;
  /** Tempos (da unidade do compasso) por minuto, como Song.bpm. */
  bpm: number;
  timeSignature: TimeSignature;
}

export interface EditorDoc {
  meta: EditorMeta;
  /** Em ordem de início, sem sobreposição. */
  notes: EditorNote[];
  /** Compassos na pauta: os escritos e os vazios onde ainda dá para escrever. */
  measures: number;
}

interface Snapshot {
  doc: EditorDoc;
  cursor: number;
}

export interface EditorState {
  doc: EditorDoc;
  /** Onde a próxima nota entra, em semínimas desde o começo da música. */
  cursor: number;
  /** Figura da próxima nota (e da nota no cursor, ao trocar). */
  duration: Duration;
  dotted: boolean;
  past: Snapshot[];
  future: Snapshot[];
  /** Motivo da última operação recusada (nota fora do violino, nada para apagar…); nulo quando a última deu certo. */
  refusal: string | null;
}

/** Semínimas de um compasso inteiro. */
export const barQuarters = (ts: TimeSignature) => (ts.beats * 4) / ts.unit;
/** Semínimas de um tempo da Song (a unidade do compasso). */
const quartersPerBeat = (ts: TimeSignature) => 4 / ts.unit;

export const entryLength = (state: Pick<EditorState, 'duration' | 'dotted'>) => state.duration * (state.dotted ? 1.5 : 1);

const totalQuarters = (doc: EditorDoc) => doc.measures * barQuarters(doc.meta.timeSignature);

// --- nomes e alturas ----------------------------------------------------------------------------------------------

const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const LETTER_SOLFEGE = ['Dó', 'Ré', 'Mi', 'Fá', 'Sol', 'Lá', 'Si'];
const SHARP_LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const FLAT_LETTER = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
/** "C".."B" → letra (Dó = 0). */
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof LETTERS)[number];

export function keyFifthsOf(key: string): number {
  const choice = KEY_CHOICES.find((k) => k.key === key);
  if (choice) return choice.fifths;
  throw new RangeError(`tonalidade "${key}" fora do editor`);
}

function keyAlteration(letter: number, fifths: number): number {
  if (fifths > 0) return SHARP_ORDER.slice(0, fifths).includes(letter) ? 1 : 0;
  if (fifths < 0) return FLAT_ORDER.slice(0, -fifths).includes(letter) ? -1 : 0;
  return 0;
}

/** Grau diatônico (Dó0 = 0), escrito com sustenidos nas armaduras de sustenido e bemóis nas de bemol. */
function stepOf(midi: number, fifths: number): number {
  const letters = fifths < 0 ? FLAT_LETTER : SHARP_LETTER;
  return (Math.floor(midi / 12) - 1) * 7 + letters[((midi % 12) + 12) % 12];
}

function midiOfStep(step: number, alteration: number): number {
  const letter = ((step % 7) + 7) % 7;
  return (Math.floor(step / 7) + 1) * 12 + LETTER_PC[letter] + alteration;
}

/** "Fá♯5", na grafia da tonalidade. */
export function noteName(midi: number, fifths = 0): string {
  const step = stepOf(midi, fifths);
  const letter = ((step % 7) + 7) % 7;
  const alteration = midi - midiOfStep(step, 0);
  const sign = alteration > 0 ? '♯' : alteration < 0 ? '♭' : '';
  return `${LETTER_SOLFEGE[letter]}${sign}${Math.floor(step / 7)}`;
}

const RANGE = `${noteName(LOWEST_MIDI)} a ${noteName(HIGHEST_MIDI)}`;

/** Motivo para recusar a nota, ou nulo se ela cabe no violino até a 3ª posição. */
export function rangeProblem(midi: number, fifths = 0): string | null {
  if (Number.isInteger(midi) && midi >= LOWEST_MIDI && midi <= HIGHEST_MIDI) return null;
  return `${noteName(midi, fifths)} não cabe no violino (${RANGE}).`;
}

// --- estado ---------------------------------------------------------------------------------------------------------

export function createEditor(meta: Partial<EditorMeta> = {}, measures = STARTING_MEASURES): EditorState {
  return {
    doc: {
      meta: {
        id: meta.id ?? 'editor',
        title: meta.title ?? '',
        composer: meta.composer ?? '',
        key: meta.key ?? 'D major',
        bpm: meta.bpm ?? 72,
        timeSignature: meta.timeSignature ?? { beats: 4, unit: 4 },
      },
      notes: [],
      measures: Math.max(1, measures),
    },
    cursor: 0,
    duration: 1,
    dotted: false,
    past: [],
    future: [],
    refusal: null,
  };
}

/** Uma Song pronta (de um rascunho antigo, do import) vira documento: as ligaduras ficam, o dedilhado vira escolha. */
export function editorFromSong(song: Song): EditorState {
  const q = quartersPerBeat(song.timeSignature);
  const bar = barQuarters(song.timeSignature);
  const notes: EditorNote[] = [];
  let start = 0;
  for (const m of song.measures) {
    for (const n of m.notes) {
      const note: EditorNote = { at: tidy(start + n.beat * q), length: tidy(n.beats * q), midi: n.midi, placement: { string: n.string, finger: n.finger } };
      if (n.tie) note.tie = true;
      notes.push(note);
    }
    start += m.beats * q;
  }
  const { id, title, composer, key, bpm, timeSignature } = song;
  const state = createEditor({ id, title, composer, key, bpm, timeSignature }, Math.ceil(start / bar - EPSILON));
  return { ...state, doc: { ...state.doc, notes: normalize(notes) } };
}

/** O documento guardado (rascunho) volta a ser estado, sem histórico. Lança se não for um documento do editor. */
export function editorFromDoc(raw: unknown): EditorState {
  const doc = raw as EditorDoc;
  if (!doc || typeof doc !== 'object' || !doc.meta || !Array.isArray(doc.notes)) throw new TypeError('rascunho sem documento');
  const state = createEditor(doc.meta, Number(doc.measures) || STARTING_MEASURES);
  const outside = doc.notes.map((n) => rangeProblem(Number(n.midi))).find(Boolean);
  if (outside) throw new RangeError(`rascunho inválido: ${outside}`);
  const notes = normalize(
    doc.notes.map((n) => {
      const note: EditorNote = { at: Number(n.at), length: Number(n.length), midi: Number(n.midi) };
      if (n.tie === true) note.tie = true;
      if (n.placement) note.placement = { string: n.placement.string, finger: n.placement.finger };
      return note;
    }),
  );
  const next = { ...state, doc: { ...state.doc, notes } };
  const problems = editorProblems(next);
  if (problems.length) throw new RangeError(`rascunho inválido: ${problems.join('; ')}`);
  return withRoom({ ...next, cursor: notes.length ? notes[notes.length - 1].at + notes[notes.length - 1].length : 0 });
}

/** Ordena e desfaz ligadura que perdeu a nota igual colada antes. */
function normalize(notes: EditorNote[]): EditorNote[] {
  const sorted = [...notes].sort((a, b) => a.at - b.at);
  return sorted.map((note, i) => {
    if (!note.tie) return note;
    const before = sorted[i - 1];
    if (before && before.midi === note.midi && same(before.at + before.length, note.at)) return note;
    return without(note, 'tie');
  });
}

function without(note: EditorNote, field: 'tie' | 'placement'): EditorNote {
  const copy = { ...note };
  delete copy[field];
  return copy;
}

/** O cursor sempre cai dentro de um compasso: chegando ao fim, a pauta ganha um compasso vazio. */
function withRoom(state: EditorState): EditorState {
  const bar = barQuarters(state.doc.meta.timeSignature);
  const end = state.doc.notes.reduce((max, n) => Math.max(max, n.at + n.length), 0);
  const needed = Math.max(1, Math.ceil(end / bar - EPSILON), Math.floor(state.cursor / bar + EPSILON) + 1);
  const measures = Math.max(state.doc.measures, needed);
  return measures === state.doc.measures ? state : { ...state, doc: { ...state.doc, measures } };
}

/** Mudança no documento: guarda o anterior para desfazer e limpa o refazer. */
function commit(state: EditorState, doc: EditorDoc, cursor: number): EditorState {
  const past = [...state.past, { doc: state.doc, cursor: state.cursor }].slice(-HISTORY_LIMIT);
  return withRoom({ ...state, doc, cursor: tidy(cursor), past, future: [], refusal: null });
}

const refuse = (state: EditorState, reason: string): EditorState => ({ ...state, refusal: reason });

export function undo(state: EditorState): EditorState {
  const last = state.past[state.past.length - 1];
  if (!last) return refuse(state, 'Nada para desfazer.');
  return { ...state, ...last, past: state.past.slice(0, -1), future: [{ doc: state.doc, cursor: state.cursor }, ...state.future], refusal: null };
}

export function redo(state: EditorState): EditorState {
  const [next, ...rest] = state.future;
  if (!next) return refuse(state, 'Nada para refazer.');
  return { ...state, ...next, future: rest, past: [...state.past, { doc: state.doc, cursor: state.cursor }], refusal: null };
}

// --- seleção e cursor ---------------------------------------------------------------------------------------------

/** A nota que começa no cursor (a que a troca de figura muda). */
export function noteAtCursor(state: EditorState): EditorNote | undefined {
  return state.doc.notes.find((n) => same(n.at, state.cursor));
}

/**
 * A nota selecionada: a que começa no cursor ou, logo depois de escrever, a que acabou de entrar (termina no cursor).
 * Subir, descer, acidente, ligadura, corda e dedo valem para ela.
 */
export function selectedNote(state: EditorState): EditorNote | undefined {
  return noteAtCursor(state) ?? state.doc.notes.find((n) => same(n.at + n.length, state.cursor));
}

/**
 * Pontos onde o cursor para: o começo de cada nota e, nos vãos, cada tempo do compasso. O fim da pauta só conta se
 * o último compasso tem nota: chegar lá abre um compasso vazio, e andar pelo vazio não cria outro.
 */
export function cursorStops(doc: EditorDoc): number[] {
  const beat = quartersPerBeat(doc.meta.timeSignature);
  const total = totalQuarters(doc);
  const lastEnd = doc.notes.reduce((max, n) => Math.max(max, n.at + n.length), 0);
  const stops = new Set<number>(lastEnd > total - barQuarters(doc.meta.timeSignature) + EPSILON ? [total] : []);
  for (const n of doc.notes) stops.add(tidy(n.at));
  let gap = 0;
  const fill = (from: number, to: number) => {
    stops.add(tidy(from));
    for (let p = Math.ceil(from / beat - EPSILON) * beat; p < to - EPSILON; p += beat) stops.add(tidy(p));
  };
  for (const n of doc.notes) {
    if (n.at > gap + EPSILON) fill(gap, n.at);
    gap = Math.max(gap, n.at + n.length);
  }
  if (gap < total - EPSILON) fill(gap, total);
  return [...stops].sort((a, b) => a - b);
}

/** ← e →: anda entre as notas (e os tempos vazios). */
export function moveCursor(state: EditorState, direction: -1 | 1): EditorState {
  const stops = cursorStops(state.doc);
  const target = direction > 0 ? stops.find((s) => s > state.cursor + EPSILON) : [...stops].reverse().find((s) => s < state.cursor - EPSILON);
  if (target === undefined) return { ...state, refusal: null };
  return withRoom({ ...state, cursor: target, refusal: null });
}

/** Leva o cursor para `at` (toque na pauta), na grade da figura escolhida dentro do compasso. */
export function setCursor(state: EditorState, at: number): EditorState {
  return withRoom({ ...state, cursor: snapToGrid(state, at), refusal: null });
}

/** O começo de nota sob `at` vale (tocar numa nota a seleciona); no vão, a grade da figura escolhida. */
export function snapToGrid(state: EditorState, at: number): number {
  const total = totalQuarters(state.doc);
  const clamped = Math.min(Math.max(0, at), total);
  const hit = state.doc.notes.find((n) => clamped >= n.at - EPSILON && clamped < n.at + n.length - EPSILON);
  if (hit) return hit.at;
  const bar = barQuarters(state.doc.meta.timeSignature);
  const measureStart = Math.floor(clamped / bar + EPSILON) * bar;
  const grid = Math.min(state.duration, bar);
  return tidy(Math.min(total, measureStart + Math.floor((clamped - measureStart) / grid + EPSILON) * grid));
}

/** Compasso (a partir de 0) e tempo (a partir de 1) do cursor, para "comp. 6 · tempo 3". */
export function cursorPosition(state: EditorState, at = state.cursor): { measure: number; beat: number } {
  const ts = state.doc.meta.timeSignature;
  const bar = barQuarters(ts);
  const measure = Math.min(Math.floor(at / bar + EPSILON), state.doc.measures - 1);
  return { measure, beat: tidy((at - measure * bar) / quartersPerBeat(ts) + 1) };
}

// --- escrever ------------------------------------------------------------------------------------------------------

/**
 * Escreve sobre o trecho [at, at + length): a nota que começa antes é encurtada até `at`, as que começam dentro saem
 * (o resto delas vira pausa). Com `note`, ela entra no lugar.
 */
function overwrite(notes: readonly EditorNote[], at: number, length: number, note?: EditorNote): EditorNote[] {
  const end = at + length;
  const out: EditorNote[] = [];
  for (const n of notes) {
    if (n.at + n.length <= at + EPSILON || n.at >= end - EPSILON) out.push(n);
    else if (n.at < at - EPSILON) out.push({ ...n, length: tidy(at - n.at) });
  }
  if (note) out.push(note);
  return normalize(out);
}

/**
 * Entrada de nota por API (teclado, toque, ditado): escreve `midi` no cursor com a figura escolhida (ou `length`
 * semínimas) por cima do que houver e anda o cursor. Nota fora do violino é recusada com o motivo.
 */
export function insertNote(state: EditorState, midi: number, length = entryLength(state)): EditorState {
  const problem = rangeProblem(midi, keyFifthsOf(state.doc.meta.key));
  if (problem) return refuse(state, problem);
  const note: EditorNote = { at: tidy(state.cursor), length: tidy(length), midi };
  const notes = overwrite(state.doc.notes, state.cursor, length, note);
  return commit(state, { ...state.doc, notes }, state.cursor + length);
}

/** Pausa no cursor com a figura escolhida: apaga o que houver no trecho e anda. */
export function insertRest(state: EditorState): EditorState {
  const length = entryLength(state);
  const notes = overwrite(state.doc.notes, state.cursor, length);
  return commit(state, { ...state.doc, notes }, state.cursor + length);
}

/** Altura da letra (A–G) com a armadura, na oitava mais perto da nota de antes; nula se não cabe no violino. */
export function letterMidi(state: EditorState, letter: Letter): number | null {
  const fifths = keyFifthsOf(state.doc.meta.key);
  const index = LETTERS.indexOf(letter);
  const before = [...state.doc.notes].reverse().find((n) => n.at < state.cursor - EPSILON);
  const reference = before?.midi ?? 67;
  const pc = LETTER_PC[index] + keyAlteration(index, fifths);
  let best: number | null = null;
  for (let octave = 2; octave <= 7; octave++) {
    const midi = (octave + 1) * 12 + pc;
    if (rangeProblem(midi)) continue;
    if (best === null || Math.abs(midi - reference) < Math.abs(best - reference)) best = midi;
  }
  return best;
}

/** Tecla A–G: a nota da letra no cursor. */
export function insertLetter(state: EditorState, letter: Letter): EditorState {
  const midi = letterMidi(state, letter);
  return midi === null ? refuse(state, `${letter} não cabe no violino.`) : insertNote(state, midi);
}

/** Apaga a nota do cursor (fica pausa); logo depois de escrever, apaga a que acabou de entrar e volta o cursor. */
export function deleteNote(state: EditorState): EditorState {
  const at = noteAtCursor(state);
  const target = at ?? selectedNote(state);
  if (!target) return refuse(state, 'Nenhuma nota aqui para apagar.');
  const notes = normalize(state.doc.notes.filter((n) => n !== target));
  return commit(state, { ...state.doc, notes }, at ? state.cursor : target.at);
}

/** Troca a nota selecionada por outra (mesmo começo e figura); fora do violino, recusa. */
function replaceSelected(state: EditorState, change: (note: EditorNote, fifths: number) => EditorNote | string): EditorState {
  const target = selectedNote(state);
  if (!target) return refuse(state, 'Escolha uma nota primeiro.');
  const fifths = keyFifthsOf(state.doc.meta.key);
  const next = change(target, fifths);
  if (typeof next === 'string') return refuse(state, next);
  const problem = rangeProblem(next.midi, fifths);
  if (problem) return refuse(state, problem);
  // Outra altura: a escolha de corda e dedo era da nota antiga
  const changed = next.midi === target.midi ? next : without(next, 'placement');
  const notes = normalize(state.doc.notes.map((n) => (n === target ? changed : n)));
  return commit(state, { ...state.doc, notes }, state.cursor);
}

/** ↑ e ↓: a nota selecionada sobe ou desce um grau da escala (com a armadura). */
export function stepNote(state: EditorState, steps: number): EditorState {
  return replaceSelected(state, (note, fifths) => {
    const step = stepOf(note.midi, fifths) + steps;
    return { ...note, midi: midiOfStep(step, keyAlteration(((step % 7) + 7) % 7, fifths)) };
  });
}

/** Shift+↑ e Shift+↓: uma oitava. */
export function octaveNote(state: EditorState, octaves: number): EditorState {
  return replaceSelected(state, (note) => ({ ...note, midi: note.midi + 12 * octaves }));
}

export type Accidental = 'sharp' | 'flat' | 'natural';

/** ♯, ♭ e ♮ na nota selecionada: a mesma letra, alterada (o ♮ tira inclusive o da armadura). */
export function setAccidental(state: EditorState, accidental: Accidental): EditorState {
  const alteration = { sharp: 1, flat: -1, natural: 0 }[accidental];
  return replaceSelected(state, (note, fifths) => ({ ...note, midi: midiOfStep(stepOf(note.midi, fifths), alteration) }));
}

/**
 * Figura da próxima nota; se o cursor está numa nota, ela muda junto (mais longa, escreve por cima das seguintes;
 * mais curta, deixa pausa).
 */
export function setDuration(state: EditorState, duration: Duration, dotted = false): EditorState {
  const chosen = { ...state, duration, dotted, refusal: null };
  const target = noteAtCursor(state);
  if (!target) return chosen;
  const length = entryLength(chosen);
  if (same(length, target.length)) return chosen;
  const rest = state.doc.notes.filter((n) => n !== target);
  const notes = overwrite(rest, target.at, length, { ...target, length: tidy(length) });
  return commit(chosen, { ...state.doc, notes }, state.cursor);
}

/** Ponto de aumento: liga e desliga, na próxima nota e na do cursor. */
export function toggleDot(state: EditorState): EditorState {
  return setDuration(state, state.duration, !state.dotted);
}

/**
 * Ligadura da nota selecionada com a seguinte: se a seguinte já é a mesma e vem colada, liga ou desliga; senão a
 * mesma nota entra depois, ligada, com a figura escolhida.
 */
export function toggleTie(state: EditorState): EditorState {
  const target = selectedNote(state);
  if (!target) return refuse(state, 'Escolha uma nota para ligar.');
  const end = target.at + target.length;
  const next = state.doc.notes.find((n) => same(n.at, end));
  if (next && next.midi === target.midi) {
    const notes = state.doc.notes.map((n) => (n === next ? (next.tie ? without(n, 'tie') : { ...n, tie: true }) : n));
    return commit(state, { ...state.doc, notes: normalize(notes) }, state.cursor);
  }
  const length = entryLength(state);
  const tied: EditorNote = { at: tidy(end), length: tidy(length), midi: target.midi, tie: true };
  const notes = overwrite(state.doc.notes, end, length, tied);
  return commit(state, { ...state.doc, notes }, end + length);
}

// --- dedilhado ---------------------------------------------------------------------------------------------------

/** Corda escolhida para a nota selecionada: a posição mais baixa em que ela cabe nessa corda. */
export function setString(state: EditorState, string: StringIndex): EditorState {
  return replaceSelected(state, (note) => {
    const found = placements(note.midi, 3).find((p) => p.string === string);
    if (!found) return `${noteName(note.midi, keyFifthsOf(state.doc.meta.key))} não cabe na corda ${['Sol', 'Ré', 'Lá', 'Mi'][string]}.`;
    return { ...note, placement: { string, finger: found.finger } };
  });
}

/** Dedo escolhido na corda atual da nota selecionada. */
export function setFinger(state: EditorState, finger: Finger): EditorState {
  const song = editorSong(state);
  return replaceSelected(state, (note) => {
    const current = derivedPlacement(state, song, note);
    const found = placements(note.midi, 3).find((p) => p.string === current.string && p.finger === finger);
    if (!found) return `Na corda ${['Sol', 'Ré', 'Lá', 'Mi'][current.string]}, essa nota não sai com o dedo ${finger}.`;
    return { ...note, placement: { string: current.string, finger } };
  });
}

/** Volta a nota selecionada ao dedilhado sugerido. */
export function clearPlacement(state: EditorState): EditorState {
  return replaceSelected(state, (note) => without(note, 'placement'));
}

/** Corda e dedo com que a nota sai na Song derivada (o sugerido ou o escolhido). */
export function derivedPlacement(state: EditorState, song: Song, note: EditorNote): Placement {
  const { measure, beat } = cursorPosition(state, note.at);
  const found = song.measures[measure]?.notes.find((n) => same(n.beat, beat - 1));
  return found ? { string: found.string, finger: found.finger } : { string: 0, finger: 0 };
}

// --- ficha ---------------------------------------------------------------------------------------------------------

/** Título não entra no desfazer: digitar letra por letra não vira passo. */
export function setTitle(state: EditorState, title: string): EditorState {
  return { ...state, doc: { ...state.doc, meta: { ...state.doc.meta, title } }, refusal: null };
}

/** Andamento em tempos por minuto, de MIN_BPM a MAX_BPM. */
export function setBpm(state: EditorState, bpm: number): EditorState {
  if (!Number.isFinite(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) return refuse(state, `Andamento entre ${MIN_BPM} e ${MAX_BPM}.`);
  return commit(state, { ...state.doc, meta: { ...state.doc.meta, bpm: Math.round(bpm) } }, state.cursor);
}

/** Armadura nova: as notas ficam com o mesmo som (só a grafia e as letras do teclado mudam). */
export function setKey(state: EditorState, key: string): EditorState {
  if (!KEY_CHOICES.some((k) => k.key === key)) return refuse(state, 'Tonalidade fora da lista.');
  return commit(state, { ...state.doc, meta: { ...state.doc.meta, key } }, state.cursor);
}

/**
 * Compasso novo: as notas ficam onde estavam no tempo e as barras se redistribuem (a que atravessa a barra nova vira
 * ligadura na Song). O andamento acompanha a troca de unidade para a semínima seguir na mesma velocidade.
 */
export function setTimeSignature(state: EditorState, ts: TimeSignature): EditorState {
  if (!TIME_SIGNATURES.some((t) => t.beats === ts.beats && t.unit === ts.unit)) return refuse(state, 'Compasso fora da lista.');
  const old = state.doc.meta.timeSignature;
  const bpm = Math.round((state.doc.meta.bpm * ts.unit) / old.unit);
  const measures = Math.max(1, Math.ceil(totalQuarters(state.doc) / barQuarters(ts) - EPSILON));
  const doc = { ...state.doc, meta: { ...state.doc.meta, timeSignature: { ...ts }, bpm }, measures };
  return commit(state, doc, Math.min(state.cursor, measures * barQuarters(ts)));
}

// --- a Song --------------------------------------------------------------------------------------------------------

interface Piece {
  measure: number;
  beat: number;
  beats: number;
  midi: number;
  tie: boolean;
  placement?: Placement;
}

/** Corta cada nota nas barras: o pedaço depois da barra continua ligado. */
function pieces(doc: EditorDoc): Piece[] {
  const ts = doc.meta.timeSignature;
  const bar = barQuarters(ts);
  const q = quartersPerBeat(ts);
  const out: Piece[] = [];
  for (const note of doc.notes) {
    let at = note.at;
    const end = note.at + note.length;
    let first = true;
    while (at < end - EPSILON) {
      const measure = Math.floor(at / bar + EPSILON);
      const stop = Math.min(end, (measure + 1) * bar);
      out.push({ measure, beat: tidy((at - measure * bar) / q), beats: tidy((stop - at) / q), midi: note.midi, tie: first ? note.tie === true : true, placement: note.placement });
      at = stop;
      first = false;
    }
  }
  return out;
}

/** Dedilhado do editor: o do Fácil (1ª posição) se a melodia cabe nela; senão o do Médio, até a 3ª. */
function suggestion(list: readonly Piece[]) {
  const notes = list.map((p) => ({ midi: p.midi, tie: p.tie }));
  try {
    return fingerMelody(notes, LEVEL_RULES.easy.fingering);
  } catch {
    return fingerMelody(notes, LEVEL_RULES.medium.fingering);
  }
}

/** O nível com que a música escrita entra: como escrita, sem simplificar. */
export const EDITOR_LEVEL: Level = 'hard';

/** A Song do documento: todos os compassos da pauta, cheios (o vão é pausa), com o dedilhado. */
export function editorSong(state: Pick<EditorState, 'doc'>): Song {
  const { doc } = state;
  const list = pieces(doc);
  const suggested = suggestion(list);
  const measures: Song['measures'] = [];
  const count = Math.max(doc.measures, ...list.map((p) => p.measure + 1));
  for (let i = 0; i < count; i++) measures.push({ beats: doc.meta.timeSignature.beats, notes: [] });
  let previous: SongNote | undefined;
  list.forEach((piece, i) => {
    // Ligadura repete corda e dedo da nota de antes; senão vale a escolha da pessoa, depois o sugerido
    const chosen = piece.tie && previous ? previous : (piece.placement ?? suggested[i]);
    const note: SongNote = { beat: piece.beat, beats: piece.beats, midi: piece.midi, string: chosen.string, finger: chosen.finger };
    if (piece.tie) note.tie = true;
    measures[piece.measure].notes.push(note);
    previous = note;
  });
  const { id, title, composer, key, bpm, timeSignature } = doc.meta;
  return { formatVersion: SONG_FORMAT_VERSION, id, title: title.trim() || 'Sem título', composer, key, bpm, timeSignature: { ...timeSignature }, level: EDITOR_LEVEL, measures };
}

/** Problemas da Song em edição; partitura ainda sem notas não é problema enquanto se escreve. */
export function editorProblems(state: Pick<EditorState, 'doc'>): string[] {
  return songProblems(editorSong(state)).filter((p) => p !== 'música sem notas');
}

/** A Song para salvar: sem os compassos vazios do fim. Lança com o motivo se não dá para salvar. */
export function songToSave(state: Pick<EditorState, 'doc'>): Song {
  const song = editorSong(state);
  let last = song.measures.length;
  while (last > 0 && song.measures[last - 1].notes.length === 0) last--;
  if (last === 0) throw new RangeError('Escreva pelo menos uma nota antes de salvar.');
  const trimmed = { ...song, measures: song.measures.slice(0, last) };
  const problems = songProblems(trimmed);
  if (problems.length) throw new RangeError(`A partitura tem problema: ${problems.join('; ')}`);
  return trimmed;
}

/** A nota mais grave e a mais aguda escritas, e se tudo sai na 1ª posição (o aviso "Tudo cabe no violino"). */
export function rangeSummary(state: Pick<EditorState, 'doc'>): { lowest: number; highest: number; firstPosition: boolean } | null {
  const midis = state.doc.notes.map((n) => n.midi);
  if (!midis.length) return null;
  const firstPosition = midis.every((m) => placements(m, 1).length > 0);
  return { lowest: Math.min(...midis), highest: Math.max(...midis), firstPosition };
}
