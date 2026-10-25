import { describe, expect, it } from 'vitest';
import { HighPass, PitchTracker } from '../audio/pitch/tracker';
import { tone } from '../audio/testing/synth';
import type { Song } from '../notation/song';
import { findFixedSong } from '../notation/songs';
import { renderOrchestra } from '../synth/render';
import { notesSoundingAt, scheduleOrchestra } from '../synth/schedule';
import { createEngine, scheduleNotes } from './engine';
import type { GameResult } from './types';

const A4 = 442;
const SAMPLE_RATE = 48_000;
const BLOCK = 128;
const LEAD = 0.5;
const TAIL = 1;
const GAP = 0.06;
const SONGS = ['escala-re-maior', 'brilha-brilha-estrelinha', 'ode-a-alegria'] as const;
/**
 * Meta do Higor (Decisões): com a orquestra vazando a −12 dB do violino, no máximo 2 pontos de precisão abaixo da sem
 * orquestra. O vazamento é o volume do alto-falante, medido sem a queda nos ataques; a queda é o que a orquestra faz
 * por cima dele.
 */
const GATE_DB = -12;

type Sounding = (time: number) => readonly number[];

function judge(signal: Float32Array, song: Song, sounding?: Sounding): GameResult {
  const engine = createEngine({ song, startAt: LEAD, a4: A4, sounding });
  const tracker = new PitchTracker({ sampleRate: SAMPLE_RATE, a4: A4 });
  const stream = tracker.createWindow();
  for (let start = 0; start < signal.length && engine.status === 'playing'; start += BLOCK) {
    stream.push(signal.subarray(start, start + BLOCK), (window, end) => {
      const reading = tracker.analyse(window, (start + end) / SAMPLE_RATE);
      if (reading === undefined) return;
      engine.push(reading);
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

function violin(song: Song, wrong: readonly number[] = []): Float32Array {
  const out = new Float32Array(length(song));
  for (const note of scheduleNotes(song, LEAD, song.bpm, A4)) {
    const frequency = wrong.includes(note.index) ? note.frequency * 2 ** (2 / 12) : note.frequency;
    const sound = tone({ frequency, durationSec: note.duration - GAP, sampleRate: SAMPLE_RATE, peak: 0.5 });
    out.set(sound, Math.round(note.time * SAMPLE_RATE));
  }
  return out;
}

function orchestra(song: Song, ducking = true): Float32Array {
  return renderOrchestra(song, { sampleRate: SAMPLE_RATE, length: length(song), startSeconds: LEAD, a4: A4, ducking });
}

interface Leak {
  /** O que o alto-falante toca, com a queda nos ataques. */
  played: Float32Array;
  /** A mesma orquestra sem a queda: o volume do alto-falante que o vazamento em dB mede. */
  reference: Float32Array;
}

function leak(song: Song, through: (signal: Float32Array, peak: number) => Float32Array = (s) => s): Leak {
  const reference = orchestra(song, false);
  const peak = reference.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return { played: through(orchestra(song), peak), reference: through(reference, peak) };
}

/** O Orchestra.soundingAt da partida, com todos os naipes, sem precisar de AudioContext. */
function soundingFor(song: Song): Sounding {
  const notes = scheduleOrchestra(song, { startAt: LEAD, a4: A4 });
  return (time) => notesSoundingAt(notes, time).map((note) => note.midi);
}

function rms(signal: Float32Array): number {
  let sum = 0;
  for (const v of signal) sum += v * v;
  return Math.sqrt(sum / signal.length);
}

/** Alto-falante de celular: corta abaixo de ~250 Hz (Butterworth de 4ª ordem) e distorce de leve (tanh e termo quadrático). */
function phoneSpeaker(signal: Float32Array, peak: number, drive = 1.5, quadratic = 0.1): Float32Array {
  const filter = new HighPass(250, SAMPLE_RATE);
  const norm = Math.tanh(drive);
  return signal.map((v) => {
    const x = v / peak;
    return filter.process(Math.tanh(drive * x) / norm + quadratic * x * x);
  });
}

function mix(lead: Float32Array, backing: Leak, leakDb: number): Float32Array {
  const scale = (rms(lead) / rms(backing.reference)) * 10 ** (leakDb / 20);
  return lead.map((v, i) => v + backing.played[i] * scale);
}

const hits = (result: GameResult) => result.counts.perfect + result.counts.great + result.counts.good;
const verdicts = (result: GameResult) => result.judgments.map((j) => [j.judgment, j.issue]);

describe('violino e orquestra por um alto-falante de celular simulado', { timeout: 300_000 }, () => {
  describe.each(SONGS)('%s', (id) => {
    const song = findFixedSong(id)!.song;
    const sounding = soundingFor(song);
    const speaker = leak(song, (signal, peak) => phoneSpeaker(signal, peak));

    it(`orquestra a ${GATE_DB} dB do violino: precisão no máximo 2 pontos abaixo da precisão sem orquestra`, () => {
      const lead = violin(song);
      const without = judge(lead, song).accuracy;
      expect(judge(mix(lead, speaker, GATE_DB), song, sounding).accuracy).toBeGreaterThanOrEqual(without - 2);
    });

    it(`com 2 notas erradas a ${GATE_DB} dB: a orquestra não as transforma em acerto, e a precisão segue a de sem orquestra`, () => {
      const wrong = [1, 4];
      const lead = violin(song, wrong);
      const without = judge(lead, song);
      const withOrchestra = judge(mix(lead, speaker, GATE_DB), song, sounding);
      for (const index of wrong) expect(withOrchestra.judgments[index].judgment).toBe('miss');
      expect(withOrchestra.accuracy).toBeGreaterThanOrEqual(without.accuracy - 2);
    });

    it('a orquestra sozinha, pelo alto-falante no máximo: nenhuma nota pontua', () => {
      expect(hits(judge(speaker.played, song, sounding))).toBe(0);
    });
  });
});

describe('a orquestra vazando limpa (fone mal encaixado, caixa de som boa)', { timeout: 120_000 }, () => {
  const song = findFixedSong('escala-re-maior')!.song;

  it.each([-6, -12])('debaixo do violino a %s dB, sem descarte nenhum: o julgamento é o mesmo de sem orquestra', (leakDb) => {
    const lead = violin(song);
    expect(verdicts(judge(mix(lead, leak(song), leakDb), song))).toEqual(verdicts(judge(lead, song)));
  });

  it('sozinha, sem descarte nenhum: nenhuma nota pontua, porque nunca toca a nota esperada nem a oitava dela', () => {
    expect(hits(judge(orchestra(song), song))).toBe(0);
  });
});
