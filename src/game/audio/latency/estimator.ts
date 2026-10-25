import {
  MAX_DELAY_MS,
  MAX_RELIABLE_SPREAD_MS,
  MIN_BEATS,
  type Attack,
  type CalibrationResult,
  type LatencySample,
} from './types';

export const TRIM_FRACTION = 0.2;
export const OUTLIER_SIGMAS = 3;
/** Converte o desvio absoluto mediano em desvio-padrão para dados normais. */
const MAD_TO_SIGMA = 1.4826;
/** Piso da faixa de outlier: ±15 ms de variação humana somam 30 ms, e um tempo numa ponta sobrevive à mediana na outra. */
export const MIN_OUTLIER_MS = 40;
/** Dispersão com que a confiança chega a zero. */
export const ZERO_CONFIDENCE_SPREAD_MS = 2 * MAX_RELIABLE_SPREAD_MS;

export interface EstimatorOptions {
  maxDelayMs?: number;
  minBeats?: number;
}

/**
 * Cada ataque vai para o clique mais próximo, e o clique fica com o ataque mais perto dele. Clique sem ataque é perdido;
 * ataque além de ±maxDelayMs é outlier; ataques além do dobro disso (contagem, notas soltas) são ignorados.
 */
export function assignSamples(
  clickTimes: readonly number[],
  attacks: readonly Attack[],
  maxDelayMs: number = MAX_DELAY_MS,
): LatencySample[] {
  const best: (number | null)[] = clickTimes.map(() => null);
  for (const attack of attacks) {
    const index = nearest(clickTimes, attack.time);
    if (index < 0) continue;
    const current = best[index];
    const click = clickTimes[index];
    if (Math.abs(attack.time - click) * 1000 > 2 * maxDelayMs) continue;
    if (current === null || Math.abs(attack.time - click) < Math.abs(current - click)) best[index] = attack.time;
  }
  return clickTimes.map((clickTime, index) => {
    const attackTime = best[index];
    if (attackTime === null) return { index, clickTime, attackTime: null, delaySeconds: null, status: 'missed' };
    const delaySeconds = attackTime - clickTime;
    const status = Math.abs(delaySeconds) * 1000 <= maxDelayMs ? 'hit' : 'outlier';
    return { index, clickTime, attackTime, delaySeconds, status };
  });
}

/**
 * Acertos a mais de max(3 σ robusto, MIN_OUTLIER_MS) da mediana viram outlier; o resto entra numa média aparada de 20%.
 * Só a aparagem tira um tempo de cada ponta em 8, então duas rearcadas atrasadas do mesmo lado puxariam ~20 ms.
 */
export function summarize(samples: readonly LatencySample[], minBeats: number = MIN_BEATS): CalibrationResult {
  const hits = samples.filter((s) => s.status === 'hit').map((s) => (s.delaySeconds as number) * 1000);
  const center = hits.length ? median(hits) : 0;
  const mad = hits.length ? median(hits.map((d) => Math.abs(d - center))) : 0;
  const limit = Math.max(OUTLIER_SIGMAS * MAD_TO_SIGMA * mad, MIN_OUTLIER_MS);
  const judged = samples.map((s): LatencySample =>
    s.status === 'hit' && Math.abs((s.delaySeconds as number) * 1000 - center) > limit ? { ...s, status: 'outlier' } : s,
  );
  const delays = judged.filter((s) => s.status === 'hit').map((s) => (s.delaySeconds as number) * 1000);
  const trimmed = trim(delays, TRIM_FRACTION);
  const delayMs = mean(trimmed);
  const spreadMs =
    trimmed.length > 1 ? Math.sqrt(trimmed.reduce((s, d) => s + (d - delayMs) ** 2, 0) / (trimmed.length - 1)) : 0;
  const used = samples.length ? delays.length / samples.length : 0;
  const confidence = delays.length ? used * Math.max(0, 1 - spreadMs / ZERO_CONFIDENCE_SPREAD_MS) : 0;
  return {
    latencySeconds: delays.length ? delayMs / 1000 : null,
    confidence,
    reliable: delays.length >= minBeats && spreadMs <= MAX_RELIABLE_SPREAD_MS && delayMs >= 0,
    spreadSeconds: spreadMs / 1000,
    samples: judged,
  };
}

export function estimate(
  clickTimes: readonly number[],
  attacks: readonly Attack[],
  options: EstimatorOptions = {},
): CalibrationResult {
  return summarize(assignSamples(clickTimes, attacks, options.maxDelayMs), options.minBeats);
}

/** Tira floor(n·fraction) valores de cada ponta da lista ordenada. */
export function trim(values: readonly number[], fraction: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * fraction);
  return sorted.slice(cut, sorted.length - cut);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : Number.NaN;
}

function nearest(times: readonly number[], time: number): number {
  let index = -1;
  let distance = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(times[i] - time);
    if (d < distance) {
      distance = d;
      index = i;
    }
  }
  return index;
}
