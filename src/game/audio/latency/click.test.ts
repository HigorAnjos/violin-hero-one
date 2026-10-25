import { describe, expect, it } from 'vitest';
import { FakeAudioContext } from '../testing/web-audio';
import { CLICK_HZ, CLICK_PEAK_SECONDS, renderClick, scheduleClicks } from './click';

function bandAmplitude(samples: Float32Array, hz: number, sampleRate: number): number {
  let re = 0;
  let im = 0;
  for (let i = 0; i < samples.length; i++) {
    re += samples[i] * Math.cos((2 * Math.PI * hz * i) / sampleRate);
    im += samples[i] * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  }
  return Math.hypot(re, im);
}

describe('renderClick', () => {
  it('é um pulso curto com pico CLICK_PEAK_SECONDS depois do início', () => {
    const click = renderClick(48000, 0.7);
    expect(click.length).toBe(Math.round(2 * CLICK_PEAK_SECONDS * 48000));
    let peakIndex = 0;
    for (let i = 1; i < click.length; i++) if (Math.abs(click[i]) > Math.abs(click[peakIndex])) peakIndex = i;
    expect(Math.abs(peakIndex / 48000 - CLICK_PEAK_SECONDS)).toBeLessThan(0.0003);
    expect(Math.abs(click[peakIndex])).toBeGreaterThan(0.65);
    expect(Math.abs(click[0])).toBeLessThan(0.001);
  });

  it('quase não tem energia perto do Lá solto', () => {
    const click = renderClick(48000);
    const atClick = bandAmplitude(click, CLICK_HZ, 48000);
    const atA = bandAmplitude(click, 442, 48000);
    expect(20 * Math.log10(atA / atClick)).toBeLessThan(-80);
  });
});

describe('scheduleClicks', () => {
  it('agenda um buffer por clique com o pico no instante, e silencia todos no stop', () => {
    const context = new FakeAudioContext();
    const stop = scheduleClicks(context as unknown as BaseAudioContext, [1, 2]);
    expect(context.sources.map((s) => s.startTime)).toEqual([1 - CLICK_PEAK_SECONDS, 2 - CLICK_PEAK_SECONDS]);
    expect(context.sources.every((s) => s.connections.has(context.destination))).toBe(true);
    stop();
    expect(context.sources.every((s) => s.connections.size === 0)).toBe(true);
  });
});
