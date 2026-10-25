import { tuneString } from '../../game/audio';
import type { PitchReading } from '../../game/audio/types';
import { DEFAULT_TOLERANCE_CENTS } from '../../game/engine';
import { TUNING_GREAT, TUNING_PERFECT } from '../../game/engine/score';
import { STRING_LETTERS, STRING_SOLFEGE, type StringIndex } from '../../game/notation/violin';
import { MIN_CLARITY } from '../OpenStringCard/openStringCheck';

/** Até aqui o motor dá Perfeito na afinação (e a corda conta como afinada): a legenda mostra o número do motor. */
export const TUNED_CENTS = Math.round(TUNING_PERFECT * DEFAULT_TOLERANCE_CENTS);
/** Até aqui, Ótimo. */
export const CLOSE_CENTS = Math.round(TUNING_GREAT * DEFAULT_TOLERANCE_CENTS);
/** Até aqui, Bom: a tolerância do motor. */
export const GOOD_CENTS = DEFAULT_TOLERANCE_CENTS;
/** Afinada por este tempo seguido, a corda ganha o ✓. */
export const TUNED_HOLD_SECONDS = 1;
/** Mais longe que isso de uma corda solta é nota com dedo, não corda para afinar. */
const MAX_CENTS = 100;

export interface TunerLive {
  string: StringIndex;
  cents: number;
  hz: number;
}

export interface TunerState {
  live: TunerLive | null;
  /** Desvio médio de cada corda já afinada; null até lá. */
  tuned: (number | null)[];
  holdString: StringIndex | null;
  holdSince: number;
  holdSum: number;
  holdCount: number;
}

export const initialTuner = (): TunerState => ({ live: null, tuned: [null, null, null, null], holdString: null, holdSince: 0, holdSum: 0, holdCount: 0 });

const released = (state: TunerState, live: TunerLive | null): TunerState => ({ ...state, live, holdString: null, holdSum: 0, holdCount: 0 });

/** Avança o afinador com uma leitura do Ouvido, no Lá dado: a corda solta mais perto é a que está sendo afinada. */
export function advanceTuner(state: TunerState, reading: PitchReading | null, a4: number): TunerState {
  if (!reading || reading.clarity < MIN_CLARITY) return reading ? state : released(state, null);
  const t = tuneString(reading.hz, a4);
  if (!t || Math.abs(t.cents) > MAX_CENTS) return released(state, null);
  const live = { string: t.string, cents: t.cents, hz: reading.hz };
  if (Math.abs(t.cents) > TUNED_CENTS) return released(state, live);
  const same = state.holdString === t.string;
  const holdSince = same ? state.holdSince : reading.time;
  const holdSum = (same ? state.holdSum : 0) + t.cents;
  const holdCount = (same ? state.holdCount : 0) + 1;
  const next = { ...state, live, holdString: t.string, holdSince, holdSum, holdCount };
  if (reading.time - holdSince < TUNED_HOLD_SECONDS) return next;
  const tuned = [...state.tuned];
  tuned[t.string] = Math.round(holdSum / holdCount) || 0;
  return { ...next, tuned };
}

export type TuneWord = 'AFINADO' | 'ALTO' | 'BAIXO';

export function tuneWord(cents: number): TuneWord {
  if (Math.abs(cents) <= TUNED_CENTS) return 'AFINADO';
  return cents > 0 ? 'ALTO' : 'BAIXO';
}

/** Dica embaixo do valor: para que lado girar, ou a próxima corda. */
export function tuneHint(state: TunerState): string {
  const live = state.live;
  if (!live) {
    const next = state.tuned.findIndex((c) => c === null);
    return next < 0 ? 'Quatro cordas afinadas.' : `Toque a corda ${STRING_SOLFEGE[next]} (${STRING_LETTERS[next]}) solta.`;
  }
  if (Math.abs(live.cents) > TUNED_CENTS) return live.cents > 0 ? 'Afrouxe um pouco o microafinador' : 'Aperte um pouco o microafinador';
  const next = state.tuned.findIndex((c, i) => c === null && i !== live.string);
  return next < 0 ? 'Pronto. Todas as cordas afinadas.' : `Pronto. Próxima corda: ${STRING_SOLFEGE[next]} (${STRING_LETTERS[next]})`;
}

/** Posição da agulha (0 a 100) na régua da tolerância do motor (±50 ¢). */
export function needlePercent(cents: number): number {
  return 50 + (Math.max(-GOOD_CENTS, Math.min(GOOD_CENTS, cents)) / GOOD_CENTS) * 50;
}
