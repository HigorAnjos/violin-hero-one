/** Cordas soltas, da mais grave para a mais aguda: 0 = Sol (G), 1 = Ré (D), 2 = Lá (A), 3 = Mi (E). */
export type StringIndex = 0 | 1 | 2 | 3;

export const OPEN_STRING_MIDI: readonly [number, number, number, number] = [55, 62, 69, 76];
/** Letra que aparece sempre junto da cor da corda (a cor nunca é o único sinal). */
export const STRING_LETTERS = ['G', 'D', 'A', 'E'] as const;
export const STRING_SOLFEGE = ['Sol', 'Ré', 'Lá', 'Mi'] as const;

/** Lá de referência padrão do jogo (ajustável pelo jogador). */
export const DEFAULT_A4 = 442;
export const MIN_A4 = 415;
export const MAX_A4 = 466;

/**
 * Até a 3ª posição (escopo da 1.0): o 4º dedo alcança a oitava da corda solta.
 * Posições acima ficam para depois.
 */
export const MAX_SPAN_SEMITONES = 12;

export const LOWEST_MIDI = OPEN_STRING_MIDI[0];
export const HIGHEST_MIDI = OPEN_STRING_MIDI[3] + MAX_SPAN_SEMITONES;

export function midiToFrequency(midi: number, a4: number = DEFAULT_A4): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** A nota cabe na corda entre a corda solta e a 3ª posição? */
export function stringFits(midi: number, string: StringIndex): boolean {
  const open = OPEN_STRING_MIDI[string];
  return midi >= open && midi <= open + MAX_SPAN_SEMITONES;
}
