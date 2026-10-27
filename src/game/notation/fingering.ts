// Corda e dedo sugeridos: caminho de menor custo (Viterbi) sobre todas as posições possíveis de cada nota.
// O custo soma o deslocamento da mão entre posições, a troca de corda e a preferência do nível.
import type { Finger } from './song';
import { OPEN_STRING_MIDI, type StringIndex } from './violin';

export type Position = 1 | 2 | 3;

/** Semitons acima da corda solta → dedo, em cada posição (1ª a 3ª, o limite da 1.0). */
const FINGER_BY_OFFSET: Record<Position, Record<number, Finger>> = {
  1: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4 },
  2: { 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3, 9: 4 },
  3: { 5: 1, 6: 1, 7: 2, 8: 2, 9: 3, 10: 4, 11: 4, 12: 4 },
};

export interface Placement {
  string: StringIndex;
  finger: Finger;
  /** Posição da mão; a corda solta herda a posição em que a mão já está. */
  position: Position;
}

export interface FingeringRules {
  maxPosition: Position;
  /** Custo de usar corda solta (negativo = preferir). */
  openCost: number;
  /** Custo por posição acima da 1ª. */
  positionCost: number;
  /** Custo por posição de deslocamento entre notas. */
  shiftCost: number;
  /** Custo por corda atravessada entre notas. */
  crossCost: number;
}

/** Fácil: só a 1ª posição; corda solta vale mais que ir e voltar de corda (2 travessias) para fugir do 4º dedo. */
export const FIRST_POSITION_RULES: FingeringRules = { maxPosition: 1, openCost: -3, positionCost: 0, shiftCost: 0, crossCost: 1 };
/** Médio: até a 3ª, subindo só quando compensa. */
export const UP_TO_THIRD_RULES: FingeringRules = { maxPosition: 3, openCost: -1, positionCost: 2, shiftCost: 3, crossCost: 1 };

const STRINGS: readonly StringIndex[] = [0, 1, 2, 3];

/** Todas as formas de tocar a nota até `maxPosition`. */
export function placements(midi: number, maxPosition: Position): Placement[] {
  const found: Placement[] = [];
  for (const string of STRINGS) {
    const offset = midi - OPEN_STRING_MIDI[string];
    for (let position = 1 as Position; position <= maxPosition; position++) {
      const finger = offset === 0 ? 0 : FINGER_BY_OFFSET[position][offset];
      if (finger !== undefined) found.push({ string, finger, position });
    }
  }
  return found;
}

/** A nota cabe em alguma corda até essa posição? */
export const playable = (midi: number, maxPosition: Position) => placements(midi, maxPosition).length > 0;

const stepCost = (rules: FingeringRules, p: Placement) =>
  (p.finger === 0 ? rules.openCost : 0) + (p.position - 1) * rules.positionCost;

const moveCost = (rules: FingeringRules, from: Placement, to: Placement) =>
  Math.abs(from.position - to.position) * rules.shiftCost + Math.abs(from.string - to.string) * rules.crossCost;

/**
 * Dedilhado da melodia inteira. Nota ligada (`tie`) repete a corda e o dedo da anterior.
 * Lança se alguma nota não cabe até `maxPosition`. Empate: a ordem de `placements` (corda grave, posição baixa).
 */
export function fingerMelody(notes: readonly { midi: number; tie?: boolean }[], rules: FingeringRules): Placement[] {
  if (notes.length === 0) return [];
  const options = notes.map((note, i) => {
    const found = placements(note.midi, rules.maxPosition);
    if (!found.length) throw new RangeError(`nota ${i + 1} (midi ${note.midi}) não cabe no violino até a ${rules.maxPosition}ª posição`);
    return found;
  });
  let costs = options[0].map((p) => stepCost(rules, p));
  const back: number[][] = [options[0].map(() => -1)];
  for (let i = 1; i < notes.length; i++) {
    const previous = options[i - 1];
    const next: number[] = [];
    const from: number[] = [];
    for (const p of options[i]) {
      let best = Infinity;
      let bestFrom = -1;
      previous.forEach((q, j) => {
        if (notes[i].tie && (q.string !== p.string || q.finger !== p.finger || q.position !== p.position)) return;
        const cost = costs[j] + moveCost(rules, q, p);
        if (cost < best - 1e-9) {
          best = cost;
          bestFrom = j;
        }
      });
      next.push(best + stepCost(rules, p));
      from.push(bestFrom);
    }
    costs = next;
    back.push(from);
  }
  let k = costs.reduce((best, cost, j) => (cost < costs[best] - 1e-9 ? j : best), 0);
  if (!Number.isFinite(costs[k])) throw new RangeError('ligadura sem nota igual antes');
  const chosen: Placement[] = [];
  for (let i = notes.length - 1; i >= 0; i--) {
    chosen.push(options[i][k]);
    k = back[i][k];
  }
  return chosen.reverse();
}
