import { describe, expect, it } from 'vitest';
import { HIGHEST_MIDI, LOWEST_MIDI, OPEN_STRING_MIDI, midiToFrequency } from '../../notation/violin';
import { concat, sine, silence, tone, whiteNoise } from '../testing/synth';
import type { PitchReading } from '../types';
import { HIGH_PASS_HZ } from './constants';
import { HighPass, PitchTracker, SlidingWindow, hopSizeFor, median, windowSizeFor, type TrackerOptions } from './tracker';

const SAMPLE_RATE = 48000;
const ALL_MIDI = Array.from({ length: HIGHEST_MIDI - LOWEST_MIDI + 1 }, (_, i) => LOWEST_MIDI + i);
/** Cordas soltas e notas no meio do braço (1ª a 3ª posição) de cada corda. */
const CHECK_MIDI = [...OPEN_STRING_MIDI, 59, 65, 72, 81, 88];
const WARMUP_SEC = 0.1;

function track(signal: Float32Array, options: Partial<TrackerOptions> = {}): (PitchReading | null)[] {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;
  const tracker = new PitchTracker({ sampleRate, ...options });
  const stream = tracker.createWindow();
  const events: (PitchReading | null)[] = [];
  const block = 128;
  for (let start = 0; start < signal.length; start += block) {
    stream.push(signal.subarray(start, start + block), (window, end) => {
      const event = tracker.analyse(window, (start + end) / sampleRate);
      if (event !== undefined) events.push(event);
    });
  }
  return events;
}

function settled(events: (PitchReading | null)[]): PitchReading[] {
  return events.filter((e): e is PitchReading => e !== null && e.time >= WARMUP_SEC);
}

describe('median', () => {
  it('trata tamanho ímpar e par', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('usa só os primeiros `length` valores e ordena no scratch', () => {
    const scratch = new Float64Array(5);
    expect(median(Float64Array.from([5, 1, 3, 9, 9]), 3, scratch)).toBe(3);
    expect([...scratch.subarray(0, 3)]).toEqual([1, 3, 5]);
  });

  it('recusa lista vazia', () => {
    expect(() => median([])).toThrow(RangeError);
  });
});

describe('tamanhos', () => {
  it('janela de 2048 amostras e passo de 10 ms a 48 kHz e 44,1 kHz', () => {
    expect(windowSizeFor(48000)).toBe(2048);
    expect(windowSizeFor(44100)).toBe(2048);
    expect(hopSizeFor(48000)).toBe(480);
    expect(hopSizeFor(44100)).toBe(441);
  });
});

describe('SlidingWindow', () => {
  it('entrega as últimas amostras em ordem a cada passo, depois de cheia', () => {
    const stream = new SlidingWindow(4, 2);
    const seen: number[][] = [];
    const ends: number[] = [];
    stream.push(Float32Array.from([1, 2, 3, 4, 5]), (w, end) => {
      seen.push([...w]);
      ends.push(end);
    });
    stream.push(Float32Array.from([6, 7]), (w) => seen.push([...w]));
    expect(seen).toEqual([
      [1, 2, 3, 4],
      [3, 4, 5, 6],
    ]);
    expect(ends).toEqual([4]);
  });
});

describe('HighPass', () => {
  function gainDb(frequency: number): number {
    const filter = new HighPass(HIGH_PASS_HZ, SAMPLE_RATE);
    const input = sine(frequency, 1);
    let inSum = 0;
    let outSum = 0;
    input.forEach((x, i) => {
      const y = filter.process(x);
      if (i < SAMPLE_RATE / 2) return;
      inSum += x * x;
      outSum += y * y;
    });
    return 10 * Math.log10(outSum / inSum);
  }

  it('é Butterworth de 4ª ordem: −3 dB no corte, ~24 dB por oitava abaixo', () => {
    expect(gainDb(HIGH_PASS_HZ)).toBeCloseTo(-3, 0);
    expect(gainDb(HIGH_PASS_HZ / 2)).toBeLessThan(-23);
  });

  it('quase não toca no violino: menos de 1,5 dB no Sol3, menos de 0,1 dB do Lá4 para cima', () => {
    expect(gainDb(midiToFrequency(LOWEST_MIDI))).toBeGreaterThan(-1.5);
    expect(gainDb(midiToFrequency(69))).toBeGreaterThan(-0.1);
  });

  it('corta o registro do acompanhamento: ≥ 4 dB no Mi♭3, ≥ 20 dB no Mi2', () => {
    expect(gainDb(midiToFrequency(51))).toBeLessThan(-4);
    expect(gainDb(midiToFrequency(40))).toBeLessThan(-20);
  });

  it('está ligado no fluxo de janelas do tracker', () => {
    const tracker = new PitchTracker({ sampleRate: SAMPLE_RATE });
    const stream = tracker.createWindow();
    let last = new Float32Array(0);
    stream.push(new Float32Array(tracker.windowSize).fill(1), (w) => (last = Float32Array.from(w)));
    expect(Math.abs(last.at(-1)!)).toBeLessThan(0.01);
  });
});

describe('PitchTracker', () => {
  it('recusa janela de tamanho errado', () => {
    const tracker = new PitchTracker({ sampleRate: SAMPLE_RATE });
    expect(() => tracker.analyse(new Float32Array(100), 0)).toThrow(RangeError);
  });

  it.each(ALL_MIDI)('acerta o midi %i com harmônicos de violino', (midi) => {
    const readings = settled(track(tone({ frequency: midiToFrequency(midi), durationSec: 0.5 })));
    expect(readings.length).toBeGreaterThan(30);
    for (const r of readings) {
      expect(r.midi).toBe(midi);
      expect(Math.abs(r.cents)).toBeLessThan(3);
      expect(r.clarity).toBeGreaterThanOrEqual(0.9);
    }
  });

  it.each(ALL_MIDI)('acerta o midi %i em senoide pura', (midi) => {
    const readings = settled(track(sine(midiToFrequency(midi), 0.5)));
    expect(readings.length).toBeGreaterThan(30);
    for (const r of readings) {
      expect(r.midi).toBe(midi);
      expect(Math.abs(r.cents)).toBeLessThan(3);
    }
  });

  it.each(CHECK_MIDI.flatMap((midi) => [-35, -20, 12, 30].flatMap((off) => [[midi, off, 'violino'], [midi, off, 'senoide']] as const)))(
    'midi %i desafinado %i cents (%s): nota e cents dentro de ±5',
    (midi, offsetCents, kind) => {
      const frequency = midiToFrequency(midi + offsetCents / 100);
      const signal = kind === 'senoide' ? sine(frequency, 0.4) : tone({ frequency, durationSec: 0.4 });
      const readings = settled(track(signal));
      expect(readings.length).toBeGreaterThan(20);
      for (const r of readings) {
        expect(r.midi).toBe(midi);
        expect(Math.abs(r.cents - offsetCents)).toBeLessThanOrEqual(5);
      }
    },
  );

  it.each(ALL_MIDI)('mantém o midi %i num vibrato de ±30 cents a 5 Hz', (midi) => {
    const signal = tone({ frequency: midiToFrequency(midi), durationSec: 1, vibrato: { depthCents: 30, rateHz: 5 } });
    const readings = settled(track(signal));
    expect(readings.length).toBeGreaterThan(70);
    for (const r of readings) expect(r.midi).toBe(midi);
    expect(Math.max(...readings.map((r) => Math.abs(r.cents)))).toBeGreaterThan(15);
  });

  it.each(ALL_MIDI.flatMap((midi) => [[midi, 40] as const, [midi, -40] as const]))(
    'segura o midi %i num vibrato de ±30 cents centrado em %i cents',
    (midi, offsetCents) => {
      const signal = tone({
        frequency: midiToFrequency(midi + offsetCents / 100),
        durationSec: 1.5,
        vibrato: { depthCents: 30, rateHz: 5 },
      });
      const all = track(signal);
      expect(all).not.toContain(null);
      const readings = all as PitchReading[];
      const changes = readings.slice(1).filter((r, i) => r.midi !== readings[i].midi).length;
      expect(changes).toBeLessThanOrEqual(1);
      const late = readings.filter((r) => r.time >= 0.4);
      expect(late.length).toBeGreaterThan(100);
      for (const r of late) expect(r.midi).toBe(midi);
      expect(Math.max(...late.map((r) => Math.abs(r.cents)))).toBeGreaterThan(55);
    },
  );

  it.each(ALL_MIDI)('acerta o midi %i com ruído de fundo', (midi) => {
    const signal = tone({ frequency: midiToFrequency(midi), durationSec: 0.5, noise: 0.2, seed: midi });
    const readings = settled(track(signal));
    expect(readings.length).toBeGreaterThan(30);
    for (const r of readings) expect(r.midi).toBe(midi);
  });

  it('troca na hora para um semitom afinado e em ~150 ms para um tocado 25 cents baixo', () => {
    const inTune = track(
      concat(tone({ frequency: midiToFrequency(62), durationSec: 0.3 }), tone({ frequency: midiToFrequency(63), durationSec: 0.3 })),
    ).filter((e): e is PitchReading => e !== null);
    const firstInTune = inTune.find((r) => r.midi === 63)!;
    expect(firstInTune.time - 0.3).toBeLessThan(0.06);

    const flat = track(
      concat(tone({ frequency: midiToFrequency(62), durationSec: 0.3 }), tone({ frequency: midiToFrequency(62.75), durationSec: 0.5 })),
    ).filter((e): e is PitchReading => e !== null);
    const firstFlat = flat.find((r) => r.midi === 63)!;
    expect(firstFlat.time - 0.3).toBeLessThan(0.2);
    for (const r of flat.filter((r) => r.time > firstFlat.time)) expect(r.midi).toBe(63);
  });

  it('recomeça na nota mais próxima depois de silêncio', () => {
    const events = track(
      concat(tone({ frequency: midiToFrequency(62.4), durationSec: 0.3 }), silence(0.1), tone({ frequency: midiToFrequency(62.6), durationSec: 0.3 })),
    );
    const afterGap = events.filter((e): e is PitchReading => e !== null && e.time > 0.4);
    expect(afterGap.length).toBeGreaterThan(10);
    for (const r of afterGap) expect(r.midi).toBe(63);
  });

  it('segue uma troca de nota dentro da janela da mediana', () => {
    const events = track(
      concat(tone({ frequency: midiToFrequency(62), durationSec: 0.3 }), tone({ frequency: midiToFrequency(66), durationSec: 0.3 })),
    );
    const late = events.filter((e): e is PitchReading => e !== null && e.time >= 0.45);
    expect(late.length).toBeGreaterThan(10);
    for (const r of late) expect(r.midi).toBe(66);
  });

  it('funciona a 44,1 kHz', () => {
    const readings = settled(track(tone({ frequency: midiToFrequency(62), durationSec: 0.5, sampleRate: 44100 }), { sampleRate: 44100 }));
    expect(readings.length).toBeGreaterThan(30);
    for (const r of readings) expect(r.midi).toBe(62);
  });

  it('silêncio não vira nota', () => {
    expect(track(silence(1))).toEqual([]);
  });

  it.each([1, 2, 3, 4, 5])('ruído branco não vira nota (semente %i)', (seed) => {
    expect(track(whiteNoise(SAMPLE_RATE, 0.3, seed))).toEqual([]);
  });

  it('ignora alturas fora da faixa do violino', () => {
    expect(track(tone({ frequency: 100, durationSec: 0.4 }))).toEqual([]);
  });

  it('emite um único null quando a nota para', () => {
    const events = track(concat(tone({ frequency: midiToFrequency(69), durationSec: 0.3 }), silence(0.3)));
    const firstNull = events.indexOf(null);
    expect(firstNull).toBeGreaterThan(0);
    expect(events.slice(firstNull)).toEqual([null]);
  });

  it('informa o nível do último passo, acompanhando uma queda curta que a janela de 40 ms borraria', () => {
    const loud = tone({ frequency: midiToFrequency(66), durationSec: 0.5, peak: 0.5 });
    for (let i = Math.round(0.3 * SAMPLE_RATE); i < Math.round(0.33 * SAMPLE_RATE); i++) loud[i] *= 10 ** (-9 / 20);
    const readings = track(loud).filter((e): e is PitchReading => e !== null);
    const steady = readings.find((r) => r.time > 0.2 && r.time < 0.25)!;
    const dip = readings.find((r) => r.time > 0.32 && r.time <= 0.33)!;
    expect(steady.level).toBeLessThan(20 * Math.log10(0.5));
    expect(steady.level).toBeGreaterThan(20 * Math.log10(0.5) - 12);
    expect(Math.abs(steady.level - dip.level - 9)).toBeLessThan(1.5);
  });

  it('mede os cents contra o Lá configurado', () => {
    const signal = tone({ frequency: 440, durationSec: 0.4 });
    for (const r of settled(track(signal, { a4: 440 }))) expect(r.cents).toBeCloseTo(0, 0);
    for (const r of settled(track(signal))) {
      expect(r.midi).toBe(69);
      expect(r.cents).toBeCloseTo(-7.85, 0);
    }
  });

  it('setA4 vale para as leituras seguintes, sem reiniciar', () => {
    const tracker = new PitchTracker({ sampleRate: SAMPLE_RATE });
    const window = tone({ frequency: 440, durationSec: 0.1 }).subarray(0, tracker.windowSize);
    expect(tracker.analyse(window, 0)!.cents).toBeCloseTo(-7.85, 0);
    tracker.setA4(440);
    expect(tracker.a4).toBe(440);
    expect(tracker.analyse(window, 0.01)!.cents).toBeCloseTo(0, 0);
    expect(() => tracker.setA4(0)).toThrow(RangeError);
  });
});
