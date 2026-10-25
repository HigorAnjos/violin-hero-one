import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SILENCE_DB, fallOff, meterFraction, peak, rms, startLevelMeter, toDbfs } from './level';
import { FakeNode } from './testing/web-audio';
import { silence, sine, whiteNoise } from './testing/synth';

describe('level', () => {
  it('seno em escala cheia: -3 dBFS de RMS e 0 dBFS de pico', () => {
    const s = sine(442, 0.5);
    s.forEach((v, i) => (s[i] = v / 0.8));
    expect(toDbfs(rms(s))).toBeCloseTo(-3.01, 1);
    expect(toDbfs(peak(s))).toBeCloseTo(0, 3);
  });

  it('silêncio e entrada vazia ficam no piso', () => {
    expect(rms(new Float32Array(0))).toBe(0);
    expect(toDbfs(rms(silence(0.1)))).toBe(SILENCE_DB);
    expect(toDbfs(1e-9)).toBe(SILENCE_DB);
    expect(toDbfs(Number.NaN)).toBe(SILENCE_DB);
  });

  it('separa ruído baixo de uma nota tocada', () => {
    expect(toDbfs(rms(whiteNoise(4800, 0.003)))).toBeLessThan(-50);
    expect(toDbfs(rms(sine(295, 0.1)))).toBeGreaterThan(-6);
  });

  it('converte dB em medidor de 0 a 1', () => {
    expect(meterFraction(-80)).toBe(0);
    expect(meterFraction(-60)).toBe(0);
    expect(meterFraction(-30)).toBeCloseTo(0.5);
    expect(meterFraction(0)).toBe(1);
    expect(meterFraction(6)).toBe(1);
    expect(meterFraction(-20, -40)).toBeCloseTo(0.5);
  });

  it('sobe na hora e desce em velocidade fixa', () => {
    expect(fallOff(-40, -10, 0.016)).toBe(-10);
    expect(fallOff(-10, -60, 0.5)).toBeCloseTo(-30);
    expect(fallOff(-10, -60, 5)).toBe(-60);
  });
});

class FakeAnalyser extends FakeNode {
  fftSize = 0;
  signal = new Float32Array(0);
  getFloatTimeDomainData(target: Float32Array) {
    target.fill(0);
    target.set(this.signal.subarray(0, target.length));
  }
}

describe('startLevelMeter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const analyser = new FakeAnalyser();
    const context = { createAnalyser: () => analyser } as unknown as BaseAudioContext;
    const source = new FakeNode(context);
    const onLevel = vi.fn();
    const handle = startLevelMeter(context, source as unknown as AudioNode, onLevel, { intervalMs: 33, fftSize: 1024 });
    return { analyser, source, onLevel, handle };
  }

  it('liga a fonte ao analisador e mede ~30 vezes por segundo', () => {
    const { analyser, source, onLevel } = setup();
    expect(source.connections.has(analyser)).toBe(true);
    expect(analyser.fftSize).toBe(1024);
    vi.advanceTimersByTime(1000);
    expect(onLevel).toHaveBeenCalledTimes(30);
    expect(onLevel).toHaveBeenLastCalledWith(SILENCE_DB);
  });

  it('mede o nível bruto do que chega, com ou sem nota', () => {
    const { analyser, onLevel } = setup();
    analyser.signal = new Float32Array(1024).fill(0.1);
    vi.advanceTimersByTime(33);
    expect(onLevel.mock.calls[0][0]).toBeCloseTo(-20, 5);
  });

  it('stop desliga a fonte e para de medir; repetir não faz nada', () => {
    const { analyser, source, onLevel, handle } = setup();
    handle.stop();
    handle.stop();
    vi.advanceTimersByTime(500);
    expect(onLevel).not.toHaveBeenCalled();
    expect(source.connections.has(analyser)).toBe(false);
  });
});
