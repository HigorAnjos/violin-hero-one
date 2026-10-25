import { describe, expect, it } from 'vitest';
import { AudioClock, MAX_STAMP_AGE_MS, fallbackStamp, isUsableStamp } from './clock';

describe('AudioClock', () => {
  it('extrapola o relógio de saída a partir do último carimbo', () => {
    const clock = new AudioClock();
    clock.sync({ contextTime: 3, performanceTime: 1000 });
    expect(clock.now(1500)).toBeCloseTo(3.5);
  });

  it('nunca anda para trás quando a ressincronia cai um pouco antes', () => {
    const clock = new AudioClock();
    clock.sync({ contextTime: 3, performanceTime: 1000 });
    expect(clock.now(1500)).toBeCloseTo(3.5);
    clock.sync({ contextTime: 3.49, performanceTime: 1500 });
    expect(clock.now(1500)).toBeCloseTo(3.5);
    expect(clock.now(1520)).toBeCloseTo(3.51);
  });

  it('aceita uma hora anterior depois de reset', () => {
    const clock = new AudioClock();
    clock.sync({ contextTime: 3, performanceTime: 1000 });
    clock.now(2000);
    clock.reset();
    expect(clock.isSynced).toBe(false);
    clock.sync({ contextTime: 3.2, performanceTime: 9000 });
    expect(clock.now(9000)).toBeCloseTo(3.2);
  });
});

describe('fallbackStamp', () => {
  it('desconta as latências de saída e base', () => {
    const stamp = fallbackStamp(10, 0.04, 0.01, 777);
    expect(stamp.contextTime).toBeCloseTo(9.95);
    expect(stamp.performanceTime).toBe(777);
  });

  it('latência ausente vale zero', () => {
    expect(fallbackStamp(10, undefined, undefined, 1).contextTime).toBe(10);
  });
});

describe('isUsableStamp', () => {
  it('rejeita o carimbo zerado de antes do áudio fluir', () => {
    expect(isUsableStamp({ contextTime: 0, performanceTime: 0 }, 100)).toBe(false);
    expect(isUsableStamp(undefined, 100)).toBe(false);
    expect(isUsableStamp({ contextTime: 0.2, performanceTime: 123 }, 140)).toBe(true);
  });

  it('rejeita carimbo mais velho que MAX_STAMP_AGE_MS', () => {
    expect(isUsableStamp({ contextTime: 5, performanceTime: 1000 }, 1000 + MAX_STAMP_AGE_MS)).toBe(true);
    expect(isUsableStamp({ contextTime: 5, performanceTime: 1000 }, 1000 + MAX_STAMP_AGE_MS + 1)).toBe(false);
  });
});
