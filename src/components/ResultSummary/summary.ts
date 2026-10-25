import { BADGES, COMBO_BADGES, type Badge, type BadgeId, type GameResult } from '../../game/engine';
import { STRING_SOLFEGE, type StringIndex } from '../../game/notation/violin';
import { formatCents } from '../OpenStringCard/openStringCheck';

/** Uma estrela a cada 20% de precisão, de 1 a 5 (98% dá 4, como no design; só 100% dá 5). */
export function stars(accuracy: number): number {
  return Math.max(1, Math.min(5, Math.floor(accuracy / 20)));
}

export function badgeInfo(id: BadgeId): Badge {
  return BADGES.find((b) => b.id === id) ?? BADGES[0];
}

export function hits(result: GameResult): number {
  return result.counts.perfect + result.counts.great + result.counts.good;
}

/** "Corda Mi", ou null sem erros. */
export function stringName(string: StringIndex | null): string | null {
  return string === null ? null : `Corda ${STRING_SOLFEGE[string]}`;
}

/** Precisão (acertos/notas) de cada compasso julgado, em %; null nos compassos sem nota. */
export function measureAccuracy(result: GameResult): (number | null)[] {
  const total = new Array<number>(result.totalMeasures).fill(0);
  const ok = new Array<number>(result.totalMeasures).fill(0);
  for (const j of result.judgments) {
    total[j.measure]++;
    if (j.judgment !== 'miss') ok[j.measure]++;
  }
  return total.map((n, i) => (n ? (ok[i] / n) * 100 : null));
}

/** Abaixo disto o compasso é trecho difícil. */
export const HARD_BELOW = 90;

/** A sequência de compassos abaixo de 90% com a pior média; null quando tudo passou. Compassos a partir de 0. */
export function hardestStretch(accuracy: readonly (number | null)[]): { from: number; to: number; accuracy: number } | null {
  let best: { from: number; to: number; accuracy: number } | null = null;
  let i = 0;
  while (i < accuracy.length) {
    const a = accuracy[i];
    if (a === null || a >= HARD_BELOW) {
      i++;
      continue;
    }
    const from = i;
    const values: number[] = [];
    while (i < accuracy.length && accuracy[i] !== null && (accuracy[i] as number) < HARD_BELOW) values.push(accuracy[i++] as number);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    if (!best || mean < best.accuracy) best = { from, to: i - 1, accuracy: mean };
  }
  return best;
}

/** "compassos 32–33" ou "compasso 5" (contando de 1). */
export function measuresLabel(from: number, to: number): string {
  return from === to ? `compasso ${from + 1}` : `compassos ${from + 1}–${to + 1}`;
}

/** Desvio médio que pede conselho. */
const ADVICE_CENTS = 5;

/** "Na corda Mi você tende a tocar baixo. Confira a posição dos dedos." para a corda mais desafinada. */
export function tuningAdvice(result: GameResult): string {
  const worst = result.strings
    .filter((s) => s.meanCents !== null)
    .sort((a, b) => Math.abs(b.meanCents ?? 0) - Math.abs(a.meanCents ?? 0))[0];
  if (!worst || Math.abs(worst.meanCents ?? 0) <= ADVICE_CENTS) return 'Afinação em dia nas quatro cordas.';
  const side = (worst.meanCents ?? 0) > 0 ? 'alto' : 'baixo';
  return `Na corda ${STRING_SOLFEGE[worst.string]} você tende a tocar ${side}. Confira a posição dos dedos.`;
}

/** "Corda Mi: 2 notas perdidas e 3 baixas · tempo médio 6 ms adiantado". */
export function stringReport(result: GameResult, string: StringIndex): string {
  const s = result.strings[string];
  const parts = [`${s.misses} ${s.misses === 1 ? 'nota perdida' : 'notas perdidas'}`];
  if (s.flat) parts.push(`${s.flat} ${s.flat === 1 ? 'baixa' : 'baixas'}`);
  if (s.sharp) parts.push(`${s.sharp} ${s.sharp === 1 ? 'alta' : 'altas'}`);
  const timing =
    s.meanOffsetMs === null ? '' : ` · tempo médio ${Math.abs(Math.round(s.meanOffsetMs))} ms ${s.meanOffsetMs < 0 ? 'adiantado' : 'atrasado'}`;
  return `Corda ${STRING_SOLFEGE[string]}: ${parts.join(' e ')}${timing}`;
}

/** "±7 ¢", ou "—" sem acertos. */
export function tuningStat(result: GameResult): string {
  return result.meanAbsCents === null ? '—' : `±${Math.round(result.meanAbsCents)} ¢`;
}

export const centsText = (cents: number | null) => (cents === null ? '—' : formatCents(cents));

/** O próximo selo de combo, quanto falta e o progresso (0 a 1); null quando já tem todos. */
export function nextCombo(maxCombo: number): { target: number; missing: number; progress: number } | null {
  const target = COMBO_BADGES.find((n) => n > maxCombo);
  return target ? { target, missing: target - maxCombo, progress: maxCombo / target } : null;
}
