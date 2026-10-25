import { describe, expect, it } from 'vitest';
import { assignSamples, estimate, summarize, trim } from './estimator';
import type { Attack } from './types';

const clicks = [1, 2, 3, 4, 5, 6, 7, 8];
const at = (...times: number[]): Attack[] => times.map((time) => ({ time, hz: 442 }));
const withDelays = (delaysMs: number[]) => at(...clicks.map((c, i) => c + delaysMs[i] / 1000));

describe('assignSamples', () => {
  it('dá a cada clique o ataque mais próximo', () => {
    const samples = assignSamples([1, 2], at(1.05, 1.2, 2.08));
    expect(samples.map((s) => s.attackTime)).toEqual([1.05, 2.08]);
    expect(samples[0].delaySeconds).toBeCloseTo(0.05);
    expect(samples[1].status).toBe('hit');
  });

  it('marca clique sem ataque como perdido', () => {
    const samples = assignSamples([1, 2, 3], at(1.05, 3.05));
    expect(samples.map((s) => s.status)).toEqual(['hit', 'missed', 'hit']);
    expect(samples[1]).toMatchObject({ attackTime: null, delaySeconds: null });
  });

  it('marca ataque além do máximo como outlier e ignora os além do dobro', () => {
    const samples = assignSamples([1, 3], at(1.35, 2), 300);
    expect(samples[0].status).toBe('outlier');
    expect(samples[0].delaySeconds).toBeCloseTo(0.35);
    expect(samples[1].status).toBe('missed');
  });

  it('ignora ataques da contagem antes do primeiro tempo', () => {
    const samples = assignSamples([4, 5], at(3.05, 4.04, 5.06));
    expect(samples.map((s) => ((s.delaySeconds as number) * 1000).toFixed(0))).toEqual(['40', '60']);
  });

  it('aceita ataque adiantado', () => {
    expect(assignSamples([1], at(0.97))[0].delaySeconds).toBeCloseTo(-0.03);
  });
});

describe('trim', () => {
  it('tira 20% de cada ponta', () => {
    expect(trim([5, 1, 9, 3, 7, 2, 8, 4], 0.2)).toEqual([2, 3, 4, 5, 7, 8]);
    expect(trim([2, 1], 0.2)).toEqual([1, 2]);
  });
});

describe('summarize / estimate', () => {
  it('devolve a média aparada em segundos e a dispersão', () => {
    const result = estimate(clicks, withDelays([100, 104, 96, 102, 98, 300, 101, 99]), { maxDelayMs: 400 });
    const kept = [98, 99, 100, 101, 102];
    const mean = kept.reduce((s, d) => s + d, 0) / kept.length;
    expect(result.latencySeconds).toBeCloseTo(mean / 1000, 9);
    expect(result.spreadSeconds * 1000).toBeCloseTo(Math.sqrt(kept.reduce((s, d) => s + (d - mean) ** 2, 0) / 4), 6);
    expect(result.samples[5].status).toBe('outlier');
    expect(result.samples.filter((s) => s.status === 'hit')).toHaveLength(7);
    expect(result.reliable).toBe(true);
  });

  it('descarta duas rearcadas atrasadas do mesmo lado em vez de deixar puxarem a média', () => {
    const result = estimate(clicks, withDelays([78, 79, 80, 80, 81, 82, 200, 200]));
    expect(result.samples.map((s) => s.status)).toEqual(['hit', 'hit', 'hit', 'hit', 'hit', 'hit', 'outlier', 'outlier']);
    expect(Math.abs(result.latencySeconds! - 0.08)).toBeLessThan(0.001);
  });

  it('mantém a variação humana comum de ±15 ms', () => {
    const result = estimate(clicks, withDelays([100, 101, 100, 99, 100, 115, 85, 100]));
    expect(result.samples.every((s) => s.status === 'hit')).toBe(true);
    expect(result.reliable).toBe(true);
  });

  it('confiança alta com todos os tempos e jogador firme, menor quando perde tempos', () => {
    const steady = estimate(clicks, withDelays([100, 101, 99, 100, 100, 101, 99, 100]));
    expect(steady.confidence).toBeGreaterThan(0.9);
    const partial = estimate(clicks.slice(0, 8), at(1.1, 2.1, 3.1, 4.1, 5.1, 6.1));
    expect(partial.confidence).toBeLessThan(steady.confidence);
    expect(partial.confidence).toBeCloseTo(0.75, 1);
  });

  it('marca como não confiável quando acerta menos que o mínimo', () => {
    const result = estimate(clicks, at(1.1, 2.1, 3.1, 4.1));
    expect(result.reliable).toBe(false);
    expect(result.latencySeconds).toBeCloseTo(0.1, 9);
    expect(result.confidence).toBeLessThanOrEqual(0.5);
  });

  it('marca como não confiável um jogador muito irregular', () => {
    const result = estimate(clicks, withDelays([60, 140, 70, 130, 80, 120, 65, 135]));
    expect(result.samples.every((s) => s.status === 'hit')).toBe(true);
    expect(result.spreadSeconds * 1000).toBeGreaterThan(25);
    expect(result.reliable).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('marca como não confiável um jogador adiantado de forma consistente', () => {
    const result = estimate(clicks, withDelays([-20, -22, -18, -21, -19, -20, -23, -17]));
    expect(result.samples.every((s) => s.status === 'hit')).toBe(true);
    expect(result.latencySeconds).toBeCloseTo(-0.02, 3);
    expect(result.reliable).toBe(false);
  });

  it('dá latência null, confiança zero e não confiável quando nada foi acertado', () => {
    const result = summarize(assignSamples(clicks, []));
    expect(result.latencySeconds).toBeNull();
    expect(result.spreadSeconds).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.reliable).toBe(false);
    expect(result.samples.every((s) => s.status === 'missed')).toBe(true);
  });
});
