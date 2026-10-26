import type { LapSummary } from '../../game/engine';
import type { LoopRange } from '../../game/synth';

/** Passada limpa: acima disto (a linha META do design). */
export const CLEAN_LAP = 90;
/** "Acelerar sozinho": tantas passadas limpas seguidas na mesma velocidade sobem a velocidade. */
export const CLEAN_LAPS_TO_SPEED_UP = 2;
export const SPEED_STEP = 0.05;

const counted = (lap: LapSummary) => lap.complete && lap.notes > 0;

/** Passadas limpas seguidas, das últimas para trás, tocadas inteiras na velocidade `speed`. */
export function cleanStreak(laps: readonly LapSummary[], speed: number): number {
  let streak = 0;
  for (let i = laps.length - 1; i >= 0; i--) {
    const lap = laps[i];
    if (!counted(lap)) continue;
    const sameSpeed = lap.factors.length > 0 && lap.factors.every((f) => Math.abs(f - speed) < 0.001);
    if (!sameSpeed || lap.accuracy < CLEAN_LAP) break;
    streak++;
  }
  return streak;
}

/** A velocidade que o "Acelerar sozinho" pede agora, ou null para ficar como está. */
export function autoSpeed(laps: readonly LapSummary[], speed: number): number | null {
  if (speed >= 1 - 0.001) return null;
  if (cleanStreak(laps, speed) < CLEAN_LAPS_TO_SPEED_UP) return null;
  return Math.min(1, Math.round((speed + SPEED_STEP) * 100) / 100);
}

/** A frase embaixo das passadas: quanto falta para a velocidade subir. */
export function lapAdvice(laps: readonly LapSummary[], speed: number, auto: boolean): string {
  if (speed >= 1 - 0.001) return 'Na velocidade da música. Agora é só manter acima de 90%.';
  if (!auto) return 'Ligue “Acelerar sozinho” e a velocidade sobe 5% a cada 2 passadas acima de 90%.';
  const left = CLEAN_LAPS_TO_SPEED_UP - (cleanStreak(laps, speed) % CLEAN_LAPS_TO_SPEED_UP);
  const next = Math.round(Math.min(1, speed + SPEED_STEP) * 100);
  return `Mais ${left} ${left === 1 ? 'passada' : 'passadas'} acima de 90% e a velocidade sobe para ${next}%.`;
}

/** Título da prática: o trecho em laço, ou de onde vai até o fim. */
export function practiceTitle(loop: LoopRange | null, from: number): string {
  if (loop) return loop.startMeasure === loop.endMeasure ? `Compasso ${loop.startMeasure + 1} em loop` : `Compassos ${loop.startMeasure + 1}–${loop.endMeasure + 1} em loop`;
  return from > 0 ? `Do compasso ${from + 1} ao fim` : 'A música inteira';
}

/** A, B dentro da música e A ≤ B; mexer em um empurra o outro. */
export function clampLoop(range: LoopRange, measures: number, moved: 'start' | 'end'): LoopRange {
  const last = Math.max(0, measures - 1);
  const start = Math.max(0, Math.min(last, range.startMeasure));
  const end = Math.max(0, Math.min(last, range.endMeasure));
  if (start <= end) return { startMeasure: start, endMeasure: end };
  return moved === 'start' ? { startMeasure: start, endMeasure: start } : { startMeasure: end, endMeasure: end };
}
