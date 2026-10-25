import { describe, expect, it } from 'vitest';
import { calibrationTake, detectAttacks, type PlayerOptions } from '../testing/calibration-signal';
import { estimate } from './estimator';
import { clickSchedule } from './schedule';

const schedule = clickSchedule(0.5);
const allClicks = [...schedule.countIn, ...schedule.beats];
const COUNT_IN = schedule.countIn.length;

function session(options: Partial<PlayerOptions> & { delayMs: number }) {
  const { signal } = calibrationTake({
    clickTimes: allClicks,
    jitterMs: 8,
    noise: 0.05,
    leak: 0.5,
    leakLatencyMs: 5,
    ...options,
  });
  return estimate(schedule.beats, detectAttacks(signal));
}

describe('calibração em tomadas geradas', () => {
  for (const delayMs of [40, 120, 250]) {
    it(`estima ${delayMs} ms de latência a ±10 ms, com ruído e vazamento do clique`, () => {
      for (const seed of [11, 22, 33]) {
        const result = session({ delayMs, seed });
        expect(result.reliable).toBe(true);
        expect(result.samples.every((s) => s.status === 'hit')).toBe(true);
        expect(Math.abs(result.latencySeconds * 1000 - delayMs)).toBeLessThanOrEqual(10);
      }
    }, 30000);
  }

  it('sobrevive a cliques perdidos, notas extras e a tocar na contagem', () => {
    const beats = schedule.beats;
    const extra = [beats[1] + 0.5, beats[4] + 0.45, schedule.countIn[2] + 0.05, beats[6] + 0.15];
    const result = session({ delayMs: 80, seed: 7, missed: [COUNT_IN + 2, COUNT_IN + 5], extra });
    expect(result.samples[2].status).not.toBe('hit');
    expect(result.samples[5].status).not.toBe('hit');
    expect(result.samples.filter((s) => s.status === 'hit')).toHaveLength(6);
    expect(result.reliable).toBe(true);
    expect(Math.abs(result.latencySeconds * 1000 - 80)).toBeLessThanOrEqual(10);
  }, 30000);

  it('descarta duas rearcadas atrasadas do mesmo lado', () => {
    const beats = schedule.beats;
    const result = session({
      delayMs: 80,
      seed: 9,
      missed: [COUNT_IN + 6, COUNT_IN + 7],
      extra: [beats[6] + 0.2, beats[7] + 0.2],
    });
    expect(result.samples[6].status).toBe('outlier');
    expect(result.samples[7].status).toBe('outlier');
    expect(Math.abs(result.latencySeconds * 1000 - 80)).toBeLessThanOrEqual(10);
  }, 30000);

  it('suporta ruído forte sem perder a estimativa', () => {
    const result = session({ delayMs: 120, seed: 4, noise: 0.12 });
    expect(result.reliable).toBe(true);
    expect(Math.abs(result.latencySeconds * 1000 - 120)).toBeLessThanOrEqual(10);
  }, 30000);

  it('com ruído que mascara tempos, não inventa número: estima o que ouviu e marca baixa confiança', () => {
    const result = session({ delayMs: 120, seed: 4, noise: 0.15 });
    expect(result.samples.some((s) => s.status === 'missed')).toBe(true);
    expect(result.reliable).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
    expect(Math.abs(result.latencySeconds * 1000 - 120)).toBeLessThanOrEqual(10);
  }, 30000);

  it('marca como baixa confiança uma sessão com poucos tempos tocados', () => {
    const missed = [0, 1, 2, 3, 4].map((i) => COUNT_IN + i);
    const result = session({ delayMs: 60, seed: 3, missed });
    expect(result.samples.filter((s) => s.status === 'hit')).toHaveLength(3);
    expect(result.reliable).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
  }, 30000);

  it('marca como baixa confiança um jogador muito irregular', () => {
    const result = session({ delayMs: 120, seed: 6, jitterMs: 70 });
    expect(result.reliable).toBe(false);
  }, 30000);

  it('ignora uma tomada só de vazamento e ruído', () => {
    const result = session({ delayMs: 0, seed: 5, missed: allClicks.map((_, i) => i), leak: 1 });
    expect(result.samples.every((s) => s.status === 'missed')).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.reliable).toBe(false);
  }, 30000);
});
