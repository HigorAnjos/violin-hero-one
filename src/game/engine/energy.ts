import type { Judgment } from './types';

/** Energia em pontos inteiros de 0 a ENERGY_MAX, para a soma não acumular erro de ponto flutuante. */
export const ENERGY_MAX = 100;
export const ENERGY_START = 60;
/** Erro tira o dobro do que um Perfeito devolve: 8 erros seguidos desde o começo param a orquestra. */
export const ENERGY_DELTA: Record<Judgment, number> = { perfect: 4, great: 3, good: 2, miss: -8 };

export function applyEnergy(energy: number, judgment: Judgment): number {
  return Math.max(0, Math.min(ENERGY_MAX, energy + ENERGY_DELTA[judgment]));
}

export function energyFraction(energy: number): number {
  return energy / ENERGY_MAX;
}
