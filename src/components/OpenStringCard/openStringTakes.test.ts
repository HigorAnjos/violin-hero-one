import { describe, expect, it } from 'vitest';
import { PitchTracker } from '../../game/audio/pitch/tracker';
import { renderOpenStrings, renderSilence, renderTv } from '../../game/audio/testing/songAudio';
import { DEFAULT_SAMPLE_RATE } from '../../game/audio/testing/synth';
import { advanceCheck, initialCheck, type OpenStringCheck } from './openStringCheck';

function check(samples: Float32Array): OpenStringCheck {
  const tracker = new PitchTracker({ sampleRate: DEFAULT_SAMPLE_RATE });
  const stream = tracker.createWindow();
  let state = initialCheck();
  for (let start = 0; start < samples.length; start += 128) {
    stream.push(samples.subarray(start, start + 128), (window, end) => {
      const reading = tracker.analyse(window, (start + end) / DEFAULT_SAMPLE_RATE);
      if (reading !== undefined) state = advanceCheck(state, reading);
    });
  }
  return state;
}

describe('cordas soltas pelas gravações sintéticas do e2e', { timeout: 30000 }, () => {
  it('o WAV de cordas soltas passa as quatro, afinadas', () => {
    const state = check(renderOpenStrings());
    expect(state.current).toBe(4);
    state.results.forEach((cents) => expect(Math.abs(cents ?? Infinity)).toBeLessThanOrEqual(2));
  });

  it.each([
    ['silêncio', renderSilence(10)],
    ['TV', renderTv(10)],
  ])('%s não passa corda nenhuma', (_, samples) => {
    expect(check(samples).current).toBe(0);
  });
});
