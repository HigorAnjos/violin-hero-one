import { MAX_A4, MIN_A4, OPEN_STRING_MIDI, midiToFrequency, type StringIndex } from '../notation/violin';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const SOLFEGE = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'] as const;

/** Até aqui (em módulo) a corda conta como afinada. */
export const IN_TUNE_CENTS = 5;
/** Até aqui está perto: falta só um ajuste fino. */
export const CLOSE_CENTS = 15;

export type TuneState = 'in-tune' | 'close' | 'off';

export function assertA4(a4: number): void {
  if (!Number.isFinite(a4) || a4 < MIN_A4 || a4 > MAX_A4) {
    throw new RangeError(`Lá de referência fora de ${MIN_A4}–${MAX_A4} Hz: ${a4}`);
  }
}

/** MIDI fracionário: 69 é o Lá de referência. */
export function frequencyToMidi(hz: number, a4: number): number {
  return 69 + 12 * Math.log2(hz / a4);
}

export function centsBetween(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

export function noteName(midi: number): string {
  return `${NAMES[mod12(midi)]}${octave(midi)}`;
}

export function solfegeName(midi: number): string {
  return `${SOLFEGE[mod12(midi)]} ${octave(midi)}`;
}

export interface NoteReading {
  midi: number;
  cents: number;
  name: string;
  solfege: string;
}

/** Nota temperada mais próxima de `hz` no Lá dado, ou null para frequência inválida. */
export function readNote(hz: number, a4: number): NoteReading | null {
  if (!Number.isFinite(hz) || hz <= 0) return null;
  const exact = frequencyToMidi(hz, a4);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100, name: noteName(midi), solfege: solfegeName(midi) };
}

export function tuneState(cents: number): TuneState {
  const off = Math.abs(cents);
  if (off <= IN_TUNE_CENTS) return 'in-tune';
  if (off <= CLOSE_CENTS) return 'close';
  return 'off';
}

export interface StringTuning {
  string: StringIndex;
  targetHz: number;
  /** Desvio da corda solta; negativo = abaixo (apertar), positivo = acima (afrouxar). */
  cents: number;
  state: TuneState;
  /** Para onde girar a cravelha/microafinador; null quando afinada. */
  turn: 'up' | 'down' | null;
}

/**
 * Afinador por corda: compara `hz` com a corda pedida ou, sem ela, com a corda solta mais próxima.
 * Pode passar de ±50 cents: uma corda muito frouxa ainda é ela mesma, só falta muito.
 */
export function tuneString(hz: number, a4: number, string?: StringIndex): StringTuning | null {
  if (!Number.isFinite(hz) || hz <= 0) return null;
  const target = string ?? nearestString(hz, a4);
  const targetHz = midiToFrequency(OPEN_STRING_MIDI[target], a4);
  const cents = centsBetween(hz, targetHz);
  const state = tuneState(cents);
  return { string: target, targetHz, cents, state, turn: state === 'in-tune' ? null : cents < 0 ? 'up' : 'down' };
}

export function nearestString(hz: number, a4: number): StringIndex {
  const exact = frequencyToMidi(hz, a4);
  let best: StringIndex = 0;
  for (const s of [1, 2, 3] as const) {
    if (Math.abs(exact - OPEN_STRING_MIDI[s]) < Math.abs(exact - OPEN_STRING_MIDI[best])) best = s;
  }
  return best;
}

function mod12(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

function octave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}
