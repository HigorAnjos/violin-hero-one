import { describe, it, expect } from 'vitest';
import { badgeInfo, hardestStretch, measureAccuracy, measuresLabel, nextCombo, stars, stringName, stringReport, tuningAdvice, tuningStat } from './summary';
import { playedResult } from './testing';

describe('resumo do resultado', () => {
  it('estrelas pela precisão', () => {
    expect(stars(98.4)).toBe(4);
    expect(stars(100)).toBe(5);
    expect(stars(3)).toBe(1);
  });

  it('partida limpa: tudo no lugar, sem trecho difícil', () => {
    const result = playedResult();
    expect(measureAccuracy(result)).toEqual([100, 100, 100, 100]);
    expect(hardestStretch(measureAccuracy(result))).toBeNull();
    expect(tuningAdvice(result)).toBe('Afinação em dia nas quatro cordas.');
    expect(tuningStat(result)).toMatch(/^±\d+ ¢$/);
  });

  it('com erros, acha o pior trecho e a corda que mais errou', () => {
    const result = playedResult(5, 3);
    const stretch = hardestStretch(measureAccuracy(result));
    expect(stretch).not.toBeNull();
    expect(stretch!.accuracy).toBeLessThan(90);
    expect(stringName(result.mostMissedString)).toMatch(/^Corda /);
    expect(stringReport(result, result.mostMissedString!)).toMatch(/^Corda \S+: \d+ notas? perdidas?/);
  });

  it('trecho difícil escolhe a sequência de pior média', () => {
    expect(hardestStretch([100, 80, 85, 100, 50, null, 70])).toEqual({ from: 4, to: 4, accuracy: 50 });
    expect(measuresLabel(31, 32)).toBe('compassos 32–33');
    expect(measuresLabel(4, 4)).toBe('compasso 5');
  });

  it('selos: nome e o próximo combo', () => {
    expect(badgeInfo('combo-25').label).toBe('Combo 25');
    expect(nextCombo(30)).toEqual({ target: 50, missing: 20, progress: 0.6 });
    expect(nextCombo(120)).toBeNull();
  });
});
