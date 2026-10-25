import type { StringIndex } from '../notation/violin';
import { newBadges } from './badges';
import { accuracyPercent, emptyCounts } from './score';
import type { BadgeId, GameResult, NoteJudgment, StringStats } from './types';

const STRINGS: readonly StringIndex[] = [0, 1, 2, 3];

export interface ResultInput {
  status: GameResult['status'];
  judgments: readonly NoteJudgment[];
  score: number;
  maxCombo: number;
  energy: number;
  totalMeasures: number;
  /** Afinação de cada acerto ao longo do som sustentado, por índice de ataque; sem valor, vale o cents do ataque. */
  heldCents?: (index: number) => number | null;
  alreadyEarned?: readonly BadgeId[];
}

const mean = (values: readonly number[]): number | null =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

export function buildResult(input: ResultInput): GameResult {
  const judgments = [...input.judgments];
  const counts = emptyCounts();
  for (const j of judgments) counts[j.judgment]++;
  const hits = judgments.filter((j) => j.judgment !== 'miss');
  const tuningOf = (j: NoteJudgment): number => input.heldCents?.(j.index) ?? j.cents ?? 0;

  const strings: StringStats[] = STRINGS.map((string) => {
    const own = judgments.filter((j) => j.string === string);
    const ownHits = own.filter((j) => j.judgment !== 'miss');
    return {
      string,
      notes: own.length,
      hits: ownHits.length,
      misses: own.length - ownHits.length,
      meanCents: mean(ownHits.map(tuningOf)),
    };
  });

  let mostMissedString: StringIndex | null = null;
  for (const s of strings) {
    if (s.misses > 0 && (mostMissedString === null || s.misses > strings[mostMissedString].misses)) {
      mostMissedString = s.string;
    }
  }

  const meanAbsCents = mean(hits.map((j) => Math.abs(tuningOf(j))));
  const partial = {
    status: input.status,
    counts,
    maxCombo: input.maxCombo,
    meanAbsCents,
  };
  return {
    ...partial,
    judgments,
    score: input.score,
    accuracy: accuracyPercent(counts),
    energy: input.energy,
    meanOffsetMs: mean(hits.map((j) => j.offsetMs ?? 0)),
    strings,
    mostMissedString,
    reachedMeasure: judgments.length ? judgments[judgments.length - 1].measure : -1,
    totalMeasures: input.totalMeasures,
    badges: newBadges(partial, input.alreadyEarned),
  };
}
