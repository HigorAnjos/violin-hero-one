import { describe, expect, it } from 'vitest';
import { createEngine } from '../../engine/engine';
import type { GameResult } from '../../engine/types';
import type { Song } from '../../notation/song';
import { findFixedSong } from '../../notation/songs';
import { DEFAULT_A4 } from '../../notation/violin';
import { PitchTracker } from '../pitch/tracker';
import type { PitchReading } from '../types';
import { ODE_SLIP_ISSUES, TAKE_LEAD_IN_SECONDS, e2eTakes, type TakeName } from './e2eTakes';
import { DEFAULT_SAMPLE_RATE } from './synth';

/** O que a partida faz sem calibração: primeiro tempo 2 s depois de abrir, latência padrão de 0,1 s. */
const START_AT = 2;
const LATENCY = 0.1;
const FRAME = 1 / 60;

function song(id: string): Song {
  const found = findFixedSong(id);
  if (!found) throw new Error(`música ${id} não existe`);
  return found.song;
}

/** Uma música inteira passa pelo tracker em ~1 s numa máquina livre; com a máquina carregada leva várias vezes isso. */
const TAKE_TIMEOUT_MS = 60000;

const takes = e2eTakes(song);
const rendered = new Map<TakeName, Float32Array>();
const render = (name: TakeName) => {
  if (!rendered.has(name)) rendered.set(name, takes.find((t) => t.name === name)!.render());
  return rendered.get(name)!;
};

function listen(samples: Float32Array): { time: number; reading: PitchReading | null }[] {
  const tracker = new PitchTracker({ sampleRate: DEFAULT_SAMPLE_RATE, a4: DEFAULT_A4 });
  const stream = tracker.createWindow();
  const out: { time: number; reading: PitchReading | null }[] = [];
  const block = 128;
  for (let start = 0; start < samples.length; start += block) {
    stream.push(samples.subarray(start, start + block), (window, end) => {
      const time = (start + end) / DEFAULT_SAMPLE_RATE;
      const reading = tracker.analyse(window, time);
      if (reading !== undefined) out.push({ time, reading });
    });
  }
  return out;
}

/** A partida inteira pelo Ouvido de verdade (tracker) e pelo Motor, com o áudio do arquivo como microfone. */
function play(id: string, take: TakeName): GameResult {
  const engine = createEngine({ song: song(id), startAt: START_AT, a4: DEFAULT_A4, latencySeconds: LATENCY });
  const samples = render(take);
  let frame = 0;
  for (const { time, reading } of listen(samples)) {
    for (; frame + FRAME <= time; frame += FRAME) engine.advance(frame + FRAME);
    engine.push(reading);
  }
  for (const end = samples.length / DEFAULT_SAMPLE_RATE + 3; engine.status === 'playing' && frame < end; frame += FRAME) engine.advance(frame + FRAME);
  return engine.result();
}

describe('gravações sintéticas tocadas pelo Ouvido e julgadas pelo Motor', { timeout: TAKE_TIMEOUT_MS }, () => {
  it('o lead-in é o começo da partida mais a latência padrão', () => {
    expect(TAKE_LEAD_IN_SECONDS).toBeCloseTo(START_AT + LATENCY, 9);
  });

  it.each([
    ['escala-re-maior', 'escala-re-maior'],
    ['escala-re-maior', 'escala-re-maior-vibrato'],
    ['ode-a-alegria', 'ode-a-alegria'],
  ] as const)('%s limpa (%s): tudo acerta, quase tudo Perfeito', (id, take) => {
    const result = play(id, take);
    expect(result.status).toBe('finished');
    expect(result.counts.miss).toBe(0);
    expect(result.counts.perfect).toBeGreaterThanOrEqual(result.judgments.length - 1);
    expect(Math.abs(result.meanOffsetMs ?? Infinity)).toBeLessThan(40);
  });

  it('Ode com 3 erros: só os 3 ataques combinados erram, cada um com o seu motivo', () => {
    const result = play('ode-a-alegria', 'ode-a-alegria-3-erros');
    const misses = result.judgments.filter((j) => j.judgment === 'miss');
    expect(Object.fromEntries(misses.map((j) => [j.index, j.issue]))).toEqual(ODE_SLIP_ISSUES);
    expect(result.status).toBe('finished');
  });

  it.each(['silencio', 'tv'] as const)('%s: nenhuma leitura fica numa corda solta por 1 s', (take) => {
    const readings = listen(render(take));
    let held = 0;
    let longest = 0;
    let previous: PitchReading | null = null;
    for (const { reading } of readings) {
      const same = reading && previous && reading.midi === previous.midi && [55, 62, 69, 76].includes(reading.midi);
      held = same ? held + (reading.time - previous!.time) : 0;
      longest = Math.max(longest, held);
      previous = reading;
    }
    expect(longest).toBeLessThan(1);
  });
});
