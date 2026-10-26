import { describe, expect, it } from 'vitest';
import type { LapSummary } from '../game/engine';
import { FIXED_SONGS } from '../game/notation/songs';
import { bestLapOf, measureStarts } from './useGame';

const lap = (accuracy: number, complete = true, notes = 8): LapSummary =>
  ({ lap: 0, from: 0, to: 2, notes, counts: { perfect: 0, great: 0, good: 0, miss: 0 }, accuracy, score: 0, factors: [1], complete }) as LapSummary;

describe('bestLapOf', () => {
  it('a volta fechada de maior precisão; empate fica com a primeira', () => {
    expect(bestLapOf([lap(80), lap(95), lap(95)])).toBe(1);
  });

  it('volta incompleta ou sem notas não conta', () => {
    expect(bestLapOf([lap(70), lap(100, false), lap(100, true, 0)])).toBe(0);
    expect(bestLapOf([])).toBeNull();
  });
});

describe('measureStarts', () => {
  it('cada compasso começa onde o anterior acaba, com a anacruse curta', () => {
    const song = { ...FIXED_SONGS[0].song, measures: [{ beats: 1, notes: [] }, { beats: 4, notes: [] }, { beats: 4, notes: [] }] };
    expect(measureStarts(song)).toEqual([0, 1, 5]);
  });
});
