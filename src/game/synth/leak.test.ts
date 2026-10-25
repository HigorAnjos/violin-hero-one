import { describe, expect, it } from 'vitest';
import { PitchTracker } from '../audio/pitch/tracker';
import { tone } from '../audio/testing/synth';
import type { PitchReading } from '../audio/types';
import { createEngine, scheduleNotes } from '../engine/engine';
import type { GameResult } from '../engine/types';
import type { Song } from '../notation/song';
import { findFixedSong } from '../notation/songs';
import { renderOrchestra } from './render';

const A4 = 442;
const SAMPLE_RATE = 48_000;
const BLOCK = 128;
const LEAD = 0.5;
const TAIL = 1;
const GAP = 0.06;

function track(signal: Float32Array): PitchReading[] {
  const tracker = new PitchTracker({ sampleRate: SAMPLE_RATE, a4: A4 });
  const stream = tracker.createWindow();
  const readings: PitchReading[] = [];
  for (let start = 0; start < signal.length; start += BLOCK) {
    stream.push(signal.subarray(start, start + BLOCK), (window, end) => {
      const reading = tracker.analyse(window, (start + end) / SAMPLE_RATE);
      if (reading) readings.push(reading);
    });
  }
  return readings;
}

function judge(signal: Float32Array, song: Song): GameResult {
  const engine = createEngine({ song, startAt: LEAD, a4: A4 });
  const tracker = new PitchTracker({ sampleRate: SAMPLE_RATE, a4: A4 });
  const stream = tracker.createWindow();
  for (let start = 0; start < signal.length && engine.status === 'playing'; start += BLOCK) {
    stream.push(signal.subarray(start, start + BLOCK), (window, end) => {
      const reading = tracker.analyse(window, (start + end) / SAMPLE_RATE);
      if (reading !== undefined) engine.push(reading);
    });
    engine.advance((start + BLOCK) / SAMPLE_RATE);
  }
  return engine.result();
}

function length(song: Song): number {
  const notes = scheduleNotes(song, LEAD);
  const last = notes[notes.length - 1];
  return Math.ceil((last.time + last.duration + TAIL) * SAMPLE_RATE);
}

function violin(song: Song): Float32Array {
  const out = new Float32Array(length(song));
  for (const note of scheduleNotes(song, LEAD, song.bpm, A4)) {
    const sound = tone({ frequency: note.frequency, durationSec: note.duration - GAP, sampleRate: SAMPLE_RATE, peak: 0.5 });
    out.set(sound, Math.round(note.time * SAMPLE_RATE));
  }
  return out;
}

function orchestra(song: Song): Float32Array {
  return renderOrchestra(song, { sampleRate: SAMPLE_RATE, length: length(song), startSeconds: LEAD, a4: A4 });
}

/** Alto-falante pequeno: a orquestra com o 2º e o 3º harmônico de cada nota a `harmonicDb` (RMS) da fundamental. */
function withHarmonics(song: Song, harmonicDb: number): Float32Array {
  const base = orchestra(song);
  const render = (multiple: number) =>
    renderOrchestra(song, { sampleRate: SAMPLE_RATE, length: length(song), startSeconds: LEAD, a4: A4 * multiple });
  const scale = (signal: Float32Array) => (rms(base) / rms(signal)) * 10 ** (harmonicDb / 20);
  const second = render(2);
  const third = render(3);
  const s2 = scale(second);
  const s3 = scale(third);
  return base.map((v, i) => v + second[i] * s2 + third[i] * s3);
}

function rms(signal: Float32Array): number {
  let sum = 0;
  for (const v of signal) sum += v * v;
  return Math.sqrt(sum / signal.length);
}

function peakTo(signal: Float32Array, peak: number): Float32Array {
  const max = signal.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return signal.map((v) => (v / max) * peak);
}

/** Alto-falante de celular no talo: tanh mais um termo quadrático põem harmônicos (2×, 3×…) em cima da melodia. */
function speaker(signal: Float32Array, drive: number, quadratic: number): Float32Array {
  const max = signal.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const norm = Math.tanh(drive);
  return signal.map((v) => {
    const x = v / max;
    return (Math.tanh(drive * x) / norm + quadratic * x * x) * 0.5;
  });
}

function mix(lead: Float32Array, backing: Float32Array, leakDb: number): Float32Array {
  const scale = (rms(lead) / rms(backing)) * 10 ** (leakDb / 20);
  return lead.map((v, i) => v + backing[i] * scale);
}

const hits = (result: GameResult) => result.counts.perfect + result.counts.great + result.counts.good;
const verdicts = (result: GameResult) => result.judgments.map((j) => [j.judgment, j.issue]);

describe('a orquestra vazando no microfone não atrapalha o Ouvido', { timeout: 120_000 }, () => {
  it.each(['escala-re-maior', 'brilha-brilha-estrelinha', 'ode-a-alegria'])(
    '%s: a orquestra cheia sozinha, no volume máximo, não gera uma leitura de altura',
    (id) => {
      const song = findFixedSong(id)!.song;
      expect(track(peakTo(orchestra(song), 0.95))).toEqual([]);
    },
  );

  it.each([
    [2, 0.3],
    [4, 0.3],
    [8, 0.5],
  ])('pelo alto-falante distorcendo (drive %s, quadrático %s), sozinha: nenhuma nota pontua', (drive, quadratic) => {
    const song = findFixedSong('escala-re-maior')!.song;
    expect(hits(judge(speaker(orchestra(song), drive, quadratic), song))).toBe(0);
  });

  it.each([-6, -12])('debaixo do violino a %s dB: o julgamento é o mesmo de sem orquestra', (leakDb) => {
    const song = findFixedSong('escala-re-maior')!.song;
    const lead = violin(song);
    const clean = judge(lead, song);
    expect(hits(clean)).toBe(clean.judgments.length);
    expect(verdicts(judge(mix(lead, orchestra(song), leakDb), song))).toEqual(verdicts(clean));
  });

  it('tão alta quanto o violino (0 dB): todas as notas ainda acertam, algumas um pouco atrasadas', () => {
    const song = findFixedSong('escala-re-maior')!.song;
    const result = judge(mix(violin(song), orchestra(song), 0), song);
    expect(hits(result)).toBe(result.judgments.length);
  });

  it.each(['escala-re-maior', 'ode-a-alegria'])('%s com 2º e 3º harmônicos a -20 dB, sozinha: nenhuma nota pontua', (id) => {
    const song = findFixedSong(id)!.song;
    expect(hits(judge(peakTo(withHarmonics(song, -20), 0.95), song))).toBe(0);
  });

  it('com 2º e 3º harmônicos a -20 dB debaixo do violino a -6 dB: o julgamento é o mesmo de sem orquestra', () => {
    const song = findFixedSong('escala-re-maior')!.song;
    const lead = violin(song);
    expect(verdicts(judge(mix(lead, withHarmonics(song, -20), -6), song))).toEqual(verdicts(judge(lead, song)));
  });

  it('distorcida debaixo do violino a -6 dB: todas as notas ainda acertam', () => {
    const song = findFixedSong('escala-re-maior')!.song;
    const result = judge(mix(violin(song), speaker(orchestra(song), 4, 0.3), -6), song);
    expect(hits(result)).toBe(result.judgments.length);
  });
});
