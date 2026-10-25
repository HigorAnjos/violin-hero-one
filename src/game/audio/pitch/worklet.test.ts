import { beforeEach, describe, expect, it, vi } from 'vitest';
import { midiToFrequency } from '../../notation/violin';
import { concat, silence, tone } from '../testing/synth';
import { PROCESSOR_NAME, type FromProcessor, type ProcessorOptions } from './protocol';

const SAMPLE_RATE = 48000;
const QUANTUM = 128;

interface Processor {
  port: FakePort;
  process(inputs: Float32Array[][]): boolean;
}

class FakePort {
  readonly sent: FromProcessor[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage(message: FromProcessor): void {
    this.sent.push(message);
  }
}

let registered: { name: string; ctor: new (options: AudioWorkletNodeOptions) => Processor } | undefined;

beforeEach(async () => {
  registered = undefined;
  vi.resetModules();
  vi.stubGlobal('sampleRate', SAMPLE_RATE);
  vi.stubGlobal('currentTime', 0);
  vi.stubGlobal(
    'AudioWorkletProcessor',
    class {
      readonly port = new FakePort();
    },
  );
  vi.stubGlobal('registerProcessor', (name: string, ctor: never) => {
    registered = { name, ctor };
  });
  await import('./worklet');
});

function create(options: ProcessorOptions = { a4: 442, minClarity: 0.9 }): Processor {
  return new registered!.ctor({ processorOptions: options });
}

function feed(processor: Processor, signal: Float32Array, startSec = 0): void {
  for (let start = 0; start < signal.length; start += QUANTUM) {
    vi.stubGlobal('currentTime', startSec + start / SAMPLE_RATE);
    expect(processor.process([[signal.subarray(start, start + QUANTUM)]])).toBe(true);
  }
}

describe('worklet de afinação', () => {
  it('registra o processador', () => {
    expect(registered?.name).toBe(PROCESSOR_NAME);
  });

  it('posta uma leitura a cada 10 ms com o tempo do AudioContext', () => {
    const processor = create();
    feed(processor, tone({ frequency: midiToFrequency(62), durationSec: 1 }));
    const readings = processor.port.sent.filter((m) => m !== null);
    expect(readings.length).toBeGreaterThanOrEqual(94);
    expect(readings.every((r) => r.midi === 62)).toBe(true);
    const gaps = readings.slice(1).map((r, i) => r.time - readings[i].time);
    for (const gap of gaps) expect(gap).toBeCloseTo(0.01, 6);
    expect(readings.at(-1)!.time).toBeCloseTo(1, 1);
  });

  it('posta um único null quando o sinal some', () => {
    const processor = create();
    feed(processor, concat(tone({ frequency: 440, durationSec: 0.2 }), silence(0.2)));
    expect(processor.port.sent.filter((m) => m === null)).toHaveLength(1);
    expect(processor.port.sent.at(-1)).toBeNull();
  });

  it('continua rodando sem entrada', () => {
    const processor = create();
    expect(processor.process([[]])).toBe(true);
    expect(processor.process([])).toBe(true);
    expect(processor.port.sent).toEqual([]);
  });

  it('aplica a troca de Lá vinda do thread principal no meio do som', () => {
    const processor = create();
    const signal = tone({ frequency: 440, durationSec: 0.6 });
    const half = signal.length / 2;
    feed(processor, signal.subarray(0, half));
    expect((processor.port.sent.at(-1) as Exclude<FromProcessor, null>).cents).toBeCloseTo(-7.85, 0);
    processor.port.onmessage!({ data: { type: 'a4', a4: 440 } });
    feed(processor, signal.subarray(half), 0.3);
    expect((processor.port.sent.at(-1) as Exclude<FromProcessor, null>).cents).toBeCloseTo(0, 0);
    expect(processor.port.sent).not.toContain(null);
  });
});
