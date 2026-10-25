import { describe, expect, it } from 'vitest';
import { ENERGY_DELTA, ENERGY_MAX, ENERGY_START } from '../engine/energy';
import { LEVEL_LABEL, PERCUSSION_COMBO, levelFor, sectionsFor, type OrchestraLevel } from './sections';

const at = (energy: number, combo = 0) => ({ energy, combo });

describe('energia e combo → naipes', () => {
  it.each([
    [1, 3],
    [ENERGY_START / ENERGY_MAX, 3],
    [0.51, 3],
    [0.5, 2],
    [0.3, 2],
    [0.25, 1],
    [0.02, 1],
    [0, 0],
    [-1, 0],
    [Number.NaN, 0],
  ])('energia %s sem combo e sem histórico: nível %s', (energy, level) => {
    expect(levelFor(at(energy))).toBe(level);
  });

  it('a energia de início do Motor toca cordas, madeiras e metais', () => {
    expect(sectionsFor(levelFor(at(ENERGY_START / ENERGY_MAX)))).toEqual(['strings', 'woodwinds', 'brass']);
    expect(sectionsFor(0)).toEqual([]);
    expect(LEVEL_LABEL[4]).toBe('orquestra completa');
  });

  it('a percussão entra com 12 acertos seguidos, por cima dos metais, e sai quando o combo quebra', () => {
    expect(levelFor(at(0.9, PERCUSSION_COMBO - 1))).toBe(3);
    expect(levelFor(at(0.9, PERCUSSION_COMBO))).toBe(4);
    expect(sectionsFor(4)).toEqual(['strings', 'woodwinds', 'brass', 'percussion']);
    expect(levelFor(at(0.82, 0), 4)).toBe(3);
    expect(levelFor(at(0.4, 30))).toBe(2);
  });

  it('histerese: um naipe só sai 0,05 abaixo de onde entrou, e energia zero cala tudo', () => {
    expect(levelFor(at(0.48), 3)).toBe(3);
    expect(levelFor(at(0.45), 3)).toBe(2);
    expect(levelFor(at(0.21), 2)).toBe(2);
    expect(levelFor(at(0.01), 2)).toBe(1);
    expect(levelFor(at(0, 20), 4)).toBe(0);
  });

  it('acerto e erro alternados em volta de um limite não fazem o naipe piscar', () => {
    let energy = 52;
    let level: OrchestraLevel = levelFor(at(energy / ENERGY_MAX));
    const levels = [level];
    for (let i = 0; i < 6; i++) {
      energy += i % 2 ? ENERGY_DELTA.perfect : -ENERGY_DELTA.perfect;
      level = levelFor(at(energy / ENERGY_MAX), level);
      levels.push(level);
    }
    expect(new Set(levels)).toEqual(new Set([3]));
  });

  it('errar sem parar a partir do início vai tirando naipe por naipe até o silêncio', () => {
    let energy = ENERGY_START;
    let level: OrchestraLevel = levelFor(at(energy / ENERGY_MAX));
    const seen = [level];
    while (energy > 0) {
      energy = Math.max(0, energy + ENERGY_DELTA.miss);
      level = levelFor(at(energy / ENERGY_MAX), level);
      if (seen.at(-1) !== level) seen.push(level);
    }
    expect(seen).toEqual([3, 2, 1, 0]);
  });
});
