import { describe, expect, it } from 'vitest';
import { BADGES, badgesFor, newBadges } from './badges';

const base = { status: 'finished' as const, counts: { perfect: 10, great: 0, good: 0, miss: 0 }, maxCombo: 10, meanAbsCents: 4 };

describe('selos do ciclo 1', () => {
  it('cada selo tem rótulo e descrição em pt-BR', () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      'primeira-musica',
      'sem-erros',
      'combo-25',
      'combo-50',
      'combo-100',
      'afinacao-de-ouro',
    ]);
    for (const b of BADGES) expect(b.label.length && b.description.length).toBeGreaterThan(0);
  });

  it('música inteira sem erro e afinada: primeira música, sem erros e afinação de ouro', () => {
    expect(badgesFor(base)).toEqual(['primeira-musica', 'sem-erros', 'afinacao-de-ouro']);
  });

  it('combo de N conta mesmo quando a orquestra para', () => {
    expect(badgesFor({ ...base, status: 'failed', maxCombo: 60 })).toEqual(['combo-25', 'combo-50']);
    expect(badgesFor({ ...base, maxCombo: 100 })).toContain('combo-100');
  });

  it('game over não ganha os selos de música terminada', () => {
    expect(badgesFor({ ...base, status: 'failed' })).toEqual([]);
  });

  it('um erro tira o sem erros; afinação de ouro aceita até 10% de erros e 10 ¢', () => {
    const oneMiss = { ...base, counts: { perfect: 9, great: 0, good: 0, miss: 1 } };
    expect(badgesFor(oneMiss)).toEqual(['primeira-musica', 'afinacao-de-ouro']);
    expect(badgesFor({ ...oneMiss, meanAbsCents: 10.5 })).toEqual(['primeira-musica']);
    expect(badgesFor({ ...base, counts: { perfect: 8, great: 0, good: 0, miss: 2 } })).toEqual(['primeira-musica']);
  });

  it('música sem nenhuma nota julgada não dá selo', () => {
    expect(badgesFor({ ...base, counts: { perfect: 0, great: 0, good: 0, miss: 0 }, maxCombo: 0, meanAbsCents: null })).toEqual([]);
  });

  it('newBadges deixa de fora os já conquistados', () => {
    expect(newBadges(base, ['primeira-musica'])).toEqual(['sem-erros', 'afinacao-de-ouro']);
  });
});
