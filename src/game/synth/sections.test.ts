import { describe, expect, it } from 'vitest';
import { ENERGY_DELTA, ENERGY_MAX, ENERGY_START } from '../engine/energy';
import { LEVEL_LABEL, levelFor, sectionsFor, type OrchestraLevel } from './sections';

describe('energia → naipes', () => {
  it.each([
    [1, 4],
    [0.76, 4],
    [0.75, 3],
    [ENERGY_START / ENERGY_MAX, 3],
    [0.5, 2],
    [0.3, 2],
    [0.25, 1],
    [0.02, 1],
    [0, 0],
    [-1, 0],
    [Number.NaN, 0],
  ])('energia %s sem histórico: nível %s', (energy, level) => {
    expect(levelFor(energy)).toBe(level);
  });

  it('a energia de início do Motor toca cordas, madeiras e metais; cheia entra a percussão', () => {
    expect(sectionsFor(levelFor(ENERGY_START / ENERGY_MAX))).toEqual(['strings', 'woodwinds', 'brass']);
    expect(sectionsFor(4)).toEqual(['strings', 'woodwinds', 'brass', 'percussion']);
    expect(sectionsFor(0)).toEqual([]);
    expect(LEVEL_LABEL[4]).toBe('orquestra completa');
  });

  it('histerese: um naipe só sai 0,05 abaixo de onde entrou, e energia zero cala tudo', () => {
    expect(levelFor(0.74, 4)).toBe(4);
    expect(levelFor(0.7, 4)).toBe(3);
    expect(levelFor(0.48, 3)).toBe(3);
    expect(levelFor(0.45, 3)).toBe(2);
    expect(levelFor(0.21, 2)).toBe(2);
    expect(levelFor(0.01, 2)).toBe(1);
    expect(levelFor(0, 4)).toBe(0);
    expect(levelFor(0.74, 3)).toBe(3);
  });

  it('acerto e erro alternados em volta de um limite não fazem o naipe piscar', () => {
    let energy = 52;
    let level: OrchestraLevel = levelFor(energy / ENERGY_MAX);
    const levels = [level];
    for (let i = 0; i < 6; i++) {
      energy += i % 2 ? ENERGY_DELTA.perfect : -ENERGY_DELTA.perfect;
      level = levelFor(energy / ENERGY_MAX, level);
      levels.push(level);
    }
    expect(new Set(levels)).toEqual(new Set([3]));
  });

  it('errar sem parar a partir do início vai tirando naipe por naipe até o silêncio', () => {
    let energy = ENERGY_START;
    let level: OrchestraLevel = levelFor(energy / ENERGY_MAX);
    const seen = [level];
    while (energy > 0) {
      energy = Math.max(0, energy + ENERGY_DELTA.miss);
      level = levelFor(energy / ENERGY_MAX, level);
      if (seen.at(-1) !== level) seen.push(level);
    }
    expect(seen).toEqual([3, 2, 1, 0]);
  });
});
