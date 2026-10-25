import { describe, expect, it } from 'vitest';
import type { Explanation } from '../components/JudgmentHint/explain';
import type { LapSummary } from '../game/engine';
import { bestLapOf, nextExplained } from './useGame';

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

const hint = (judgment: Explanation['judgment']): Explanation =>
  ({ judgment, chip: judgment, hint: [], note: null, ruler: null, string: 0, playedString: null }) as unknown as Explanation;

describe('nextExplained', () => {
  it('acerto limpo (sem dica) não apaga a dica anterior', () => {
    const miss = { at: 10, explanation: hint('miss') };
    expect(nextExplained(miss, null, 10)).toBe(miss);
  });

  it('erro na tela não cede a um tropeço menor no mesmo instante', () => {
    const miss = { at: 10, explanation: hint('miss') };
    expect(nextExplained(miss, hint('good'), 10.2)).toBe(miss);
  });

  it('erro novo troca o anterior', () => {
    const miss = { at: 10, explanation: hint('miss') };
    const next = hint('miss');
    expect(nextExplained(miss, next, 10.5)?.explanation).toBe(next);
  });

  it('depois que a dica do erro venceu, um tropeço menor aparece', () => {
    const miss = { at: 10, explanation: hint('miss') };
    const good = hint('good');
    expect(nextExplained(miss, good, 13)).toEqual({ at: 13, explanation: good });
  });
});
