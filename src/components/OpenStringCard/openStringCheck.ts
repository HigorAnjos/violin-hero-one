import type { PitchReading } from '../../game/audio/types';
import { OPEN_STRING_MIDI } from '../../game/notation/violin';

/** Quanto tempo cada corda precisa soar, sem parar, para contar como ouvida. */
export const HOLD_SECONDS = 2;
/** Clareza mínima: abaixo disso é ruído ou arco arranhando, não conta nem zera. */
export const MIN_CLARITY = 0.8;
/** Buraco maior que isso entre leituras é falha do som, não tempo segurando. */
const MAX_GAP_SECONDS = 0.15;

export interface OpenStringCheck {
  /** Corda da vez (0 = Sol … 3 = Mi); 4 quando as quatro já foram ouvidas. */
  current: number;
  heldSeconds: number;
  /** Desvio da leitura mais recente da corda da vez; null quando ela não está soando. */
  liveCents: number | null;
  /** Desvio médio de cada corda ouvida, arredondado; null até ser ouvida. */
  results: (number | null)[];
  lastTime: number | null;
  centsSum: number;
  samples: number;
}

export const initialCheck = (): OpenStringCheck => ({
  current: 0,
  heldSeconds: 0,
  liveCents: null,
  results: [null, null, null, null],
  lastTime: null,
  centsSum: 0,
  samples: 0,
});

const releaseHold = (state: OpenStringCheck): OpenStringCheck =>
  state.lastTime === null && state.heldSeconds === 0 ? state : { ...state, heldSeconds: 0, liveCents: null, lastTime: null, centsSum: 0, samples: 0 };

/**
 * Avança a checagem com uma leitura do Ouvido. Tolerância generosa: qualquer leitura que caia na
 * nota da corda solta (±50 cents) conta; outra nota ou fim do som zeram só a corda da vez.
 */
export function advanceCheck(state: OpenStringCheck, reading: PitchReading | null): OpenStringCheck {
  if (state.current >= OPEN_STRING_MIDI.length) return state;
  if (!reading) return releaseHold(state);
  if (reading.clarity < MIN_CLARITY) return state;
  if (reading.midi !== OPEN_STRING_MIDI[state.current]) return releaseHold(state);

  const gap = state.lastTime === null ? 0 : reading.time - state.lastTime;
  const heldSeconds = state.heldSeconds + Math.min(Math.max(gap, 0), MAX_GAP_SECONDS);
  const centsSum = state.centsSum + reading.cents;
  const samples = state.samples + 1;
  if (heldSeconds < HOLD_SECONDS) {
    return { ...state, heldSeconds, liveCents: reading.cents, lastTime: reading.time, centsSum, samples };
  }
  const results = [...state.results];
  results[state.current] = Math.round(centsSum / samples) || 0;
  return { ...initialCheck(), current: state.current + 1, results };
}

export const isComplete = (state: OpenStringCheck) => state.current >= OPEN_STRING_MIDI.length;

/** "+4 ¢", "−2 ¢", "0 ¢": o sinal de menos tipográfico, como no afinador. */
export function formatCents(cents: number): string {
  const rounded = Math.round(cents) || 0;
  if (rounded === 0) return '0 ¢';
  return rounded > 0 ? `+${rounded} ¢` : `−${-rounded} ¢`;
}

const hzFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatHz = (hz: number) => `${hzFormat.format(hz)} Hz`;
