import type { BadgeId, GameResult } from './types';

export interface Badge {
  id: BadgeId;
  /** Ícone do componente Selo. */
  kind: 'virtuose' | 'combo' | 'afinacao';
  label: string;
  description: string;
}

export const COMBO_BADGES = [25, 50, 100] as const;
/** Afinação de ouro: desvio médio de até 10 ¢ acertando ao menos 90% das notas. */
export const GOLD_TUNING_CENTS = 10;
export const GOLD_TUNING_HIT_RATE = 0.9;

export const BADGES: readonly Badge[] = [
  { id: 'primeira-musica', kind: 'virtuose', label: 'Primeira música', description: 'Tocou uma música até o fim.' },
  { id: 'sem-erros', kind: 'virtuose', label: 'Sem erros', description: 'Tocou uma música inteira sem errar nenhuma nota.' },
  ...COMBO_BADGES.map(
    (n): Badge => ({ id: `combo-${n}`, kind: 'combo', label: `Combo ${n}`, description: `Acertou ${n} notas seguidas.` }),
  ),
  {
    id: 'afinacao-de-ouro',
    kind: 'afinacao',
    label: 'Afinação de ouro',
    description: `Terminou uma música com afinação média de até ${GOLD_TUNING_CENTS} ¢.`,
  },
];

type BadgeInput = Pick<GameResult, 'status' | 'counts' | 'maxCombo' | 'meanAbsCents'> & {
  /** Prática (ou partida que virou prática) não conquista selo. */
  practice?: boolean;
};

/** Duas casas, como o servidor guarda (plays.mean_abs_cents): a régua do ouro é a mesma dos dois lados. */
export const roundCents = (cents: number) => Math.round(cents * 100) / 100;

/**
 * Selos que a partida merece, na ordem de BADGES. É a mesma regra de violinhero.submit_play (0006): os casos de
 * badgeCases.json rodam aqui e no test:db. Com sessão, vale o que o servidor respondeu.
 */
export function badgesFor(result: BadgeInput): BadgeId[] {
  if (result.practice) return [];
  const finished = result.status === 'finished';
  const { perfect, great, good, miss } = result.counts;
  const hits = perfect + great + good;
  const total = hits + miss;
  const earned: BadgeId[] = [];
  if (finished && total > 0) earned.push('primeira-musica');
  if (finished && total > 0 && miss === 0) earned.push('sem-erros');
  for (const n of COMBO_BADGES) if (result.maxCombo >= n) earned.push(`combo-${n}`);
  if (
    finished &&
    result.meanAbsCents !== null &&
    roundCents(result.meanAbsCents) <= GOLD_TUNING_CENTS &&
    hits >= GOLD_TUNING_HIT_RATE * total
  ) {
    earned.push('afinacao-de-ouro');
  }
  return earned;
}

/** Só os selos que ainda não tinham sido conquistados. */
export function newBadges(result: BadgeInput, alreadyEarned: readonly BadgeId[] = []): BadgeId[] {
  const owned = new Set(alreadyEarned);
  return badgesFor(result).filter((id) => !owned.has(id));
}
