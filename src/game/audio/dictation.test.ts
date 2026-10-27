import { describe, expect, it } from 'vitest';
import { dictate } from '../notation/dictation';
import { timeline, type Song } from '../notation/song';
import { findFixedSong } from '../notation/songs';
import { DEFAULT_A4 } from '../notation/violin';
import { PitchTracker } from './pitch/tracker';
import { TAKE_LEAD_IN_SECONDS, VIBRATO_CENTS } from './testing/e2eTakes';
import { renderSilence, renderSong, renderTv } from './testing/songAudio';
import { DEFAULT_SAMPLE_RATE } from './testing/synth';
import type { PitchReading } from './types';

/** O WAV do e2e: primeiro tempo 2 s depois de abrir o microfone, mais a latência padrão de 0,1 s. */
const START_AT = 2;
const LATENCY = 0.1;

function scale(): Song {
  const found = findFixedSong('escala-re-maior');
  if (!found) throw new Error('escala-re-maior não existe');
  return found.song;
}

/** O áudio pelo tracker de verdade (o mesmo do worklet), em blocos de render de 128 amostras. */
function listen(samples: Float32Array): (PitchReading | null)[] {
  const tracker = new PitchTracker({ sampleRate: DEFAULT_SAMPLE_RATE, a4: DEFAULT_A4 });
  const stream = tracker.createWindow();
  const out: (PitchReading | null)[] = [];
  for (let start = 0; start < samples.length; start += 128) {
    stream.push(samples.subarray(start, start + 128), (window, end) => {
      const reading = tracker.analyse(window, (start + end) / DEFAULT_SAMPLE_RATE);
      if (reading !== undefined) out.push(reading);
    });
  }
  return out;
}

describe('ditado pelo Ouvido de verdade: o áudio do e2e vira as notas da escala', { timeout: 60000 }, () => {
  it.each([
    ['sem vibrato', 0],
    ['com vibrato', VIBRATO_CENTS],
  ])('escala de Ré maior a 60 bpm, %s', (_, vibratoCents) => {
    const song = scale();
    const samples = renderSong(song, { leadInSeconds: TAKE_LEAD_IN_SECONDS, vibratoCents });
    const notes = dictate(listen(samples), { bpm: song.bpm, timeSignature: song.timeSignature, startAt: START_AT, latencySeconds: LATENCY });
    // A escala sobe e desce: 15 semínimas
    expect(notes).toEqual(timeline(song).map((n) => ({ at: n.at, length: n.beats, midi: n.midi })));
    expect(notes).toHaveLength(15);
  });

  it.each([
    ['sala em silêncio', () => renderSilence(10)],
    ['TV ligada', () => renderTv(10)],
  ])('%s não vira nota', (_, render) => {
    expect(dictate(listen(render()), { bpm: 60, timeSignature: { beats: 4, unit: 4 }, startAt: 0, latencySeconds: LATENCY })).toEqual([]);
  });
});
