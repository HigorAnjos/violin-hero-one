import { describe, expect, it } from 'vitest';
import type { Explanation } from '../components/JudgmentHint/explain';
import { nextExplained } from './useGame';

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
