import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakeNode } from '../testing/web-audio';
import { CLICK_PEAK_SECONDS } from './click';
import { ATTACK_PROCESSOR_NAME } from './protocol';
import { LATENCY_STORAGE_KEY } from './storage';
import type { CalibrationEvent } from './types';

vi.mock('./worklet.ts?worker&url', () => ({ default: '/assets/attack-worklet.js' }));

class FakePort {
  onmessage: ((event: { data: unknown }) => void) | null = null;
}

class FakeWorkletNode extends FakeNode {
  static created: FakeWorkletNode[] = [];
  readonly port = new FakePort();
  constructor(
    context: BaseAudioContext,
    readonly name: string,
    readonly options: AudioWorkletNodeOptions,
  ) {
    super(context);
    FakeWorkletNode.created.push(this);
  }
}

class MemoryStorage {
  readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

function withWorklet<T extends object>(context: T, addModule = vi.fn<(url: string) => Promise<void>>(async () => undefined)) {
  Object.assign(context, { audioWorklet: { addModule } });
  return addModule;
}

function stubOwnedContext(setup: (context: FakeAudioContext) => void = (c) => withWorklet(c)): FakeAudioContext[] {
  const created: FakeAudioContext[] = [];
  vi.stubGlobal(
    'AudioContext',
    class extends FakeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        setup(this);
        created.push(this);
      }
    },
  );
  return created;
}

let startCalibration: typeof import('./index').startCalibration;
let storage: MemoryStorage;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.unstubAllGlobals();
  FakeWorkletNode.created = [];
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  vi.resetModules();
  ({ startCalibration } = await import('./index'));
});

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const context = new FakeAudioContext();
  context.state = 'running';
  const addModule = withWorklet(context);
  const source = new FakeNode(context);
  return { context, addModule, source, input: source as unknown as AudioNode };
}

async function advanceTo(context: FakeAudioContext, time: number) {
  context.currentTime = time;
  await vi.advanceTimersByTimeAsync(40);
}

function postAttack(time: number) {
  FakeWorkletNode.created.at(-1)!.port.onmessage!({ data: { time, hz: 442 } });
}

function stored(): Record<string, { latencySeconds: number; confidence: number; measuredAt: string }> {
  return JSON.parse(storage.getItem(LATENCY_STORAGE_KEY) ?? '{}');
}

describe('startCalibration', () => {
  it('liga a fonte ao worklet de ataque e agenda contagem mais tempos', async () => {
    const { context, addModule, source, input } = setup();
    const handle = await startCalibration(input, { bpm: 120, beats: 3, countIn: 2, startAt: 1 });

    expect(addModule).toHaveBeenCalledWith('/assets/attack-worklet.js');
    const [node] = FakeWorkletNode.created;
    expect(node.name).toBe(ATTACK_PROCESSOR_NAME);
    expect(node.options.processorOptions).toEqual({ a4: 442 });
    expect(source.connections.has(node)).toBe(true);
    expect(node.connections.has(context.destination)).toBe(true);
    expect(handle.schedule).toEqual({ countIn: [1, 1.5], beats: [2, 2.5, 3] });
    expect(handle.deviceKey).toBe('default');
    expect(context.sources.map((s) => s.startTime)).toEqual([1, 1.5, 2, 2.5, 3].map((t) => t - CLICK_PEAK_SECONDS));
    await handle.cancel();
  });

  it('lê o relógio para o início padrão só depois de carregar o worklet', async () => {
    const { context, input } = setup();
    withWorklet(
      context,
      vi.fn(async () => {
        context.currentTime = 3;
      }),
    );
    const handle = await startCalibration(input);
    expect(handle.schedule.countIn[0]).toBeCloseTo(3.5);
    await handle.cancel();
  });

  it('emite cliques, ataques, amostras e o resultado, grava a latência e desmonta', async () => {
    const { context, source, input } = setup();
    const events: CalibrationEvent[] = [];
    const handle = await startCalibration(input, {
      bpm: 60,
      beats: 6,
      countIn: 1,
      startAt: 1,
      deviceKey: 'mic>fone',
      onEvent: (e) => events.push(e),
    });
    expect(events[0]).toEqual({ type: 'scheduled', schedule: handle.schedule });

    const delays = [0.1, 0.11, 0.09, 0.1, 0.12, 0.08];
    for (let i = 0; i < 6; i++) {
      await advanceTo(context, 2 + i);
      postAttack(2 + i + delays[i]);
    }
    await advanceTo(context, 7.4);
    expect(events.filter((e) => e.type === 'sample')).toHaveLength(5);
    await advanceTo(context, 8);

    const result = await handle.result;
    expect(result.reliable).toBe(true);
    expect(result.samples).toHaveLength(6);
    expect(result.latencySeconds).toBeCloseTo(0.1, 9);
    expect(result.confidence).toBeGreaterThan(0.5);

    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === 'click')).toHaveLength(7);
    expect(types.filter((t) => t === 'attack')).toHaveLength(6);
    expect(types.at(-1)).toBe('done');
    const clicks = events.filter((e) => e.type === 'click');
    expect(clicks[0]).toEqual({ type: 'click', index: 0, time: 1, countIn: true });
    expect(clicks[1]).toEqual({ type: 'click', index: 0, time: 2, countIn: false });

    const saved = stored()['mic>fone'];
    expect(saved.latencySeconds).toBeCloseTo(0.1, 9);
    expect(saved.confidence).toBeCloseTo(result.confidence, 9);
    expect(typeof saved.measuredAt).toBe('string');
    expect(source.connections.size).toBe(0);
    expect(FakeWorkletNode.created[0].port.onmessage).toBeNull();
  });

  it('só informa um tempo depois que a janela dele fecha, então um ataque atrasado ainda conta', async () => {
    const { context, input } = setup();
    const events: CalibrationEvent[] = [];
    await startCalibration(input, { beats: 2, countIn: 0, startAt: 1, onEvent: (e) => events.push(e) });
    await advanceTo(context, 1.29);
    postAttack(1.28);
    await advanceTo(context, 1.5);
    expect(events.some((e) => e.type === 'sample')).toBe(false);
    await advanceTo(context, 1.76);
    expect(events.find((e) => e.type === 'sample')).toMatchObject({ sample: { index: 0, status: 'hit' } });
  });

  it('não grava sessão de baixa confiança, nem quando pedem para não gravar', async () => {
    for (const save of [true, false]) {
      const { context, input } = setup();
      const handle = await startCalibration(input, { beats: 8, countIn: 0, startAt: 1, save });
      const hits = save ? 3 : 8;
      for (let i = 0; i < hits; i++) postAttack(1 + i + 0.05);
      await advanceTo(context, 10);
      const result = await handle.result;
      expect(result.reliable).toBe(!save);
      expect(storage.getItem(LATENCY_STORAGE_KEY)).toBeNull();
    }
  });

  it('cancel rejeita o resultado com AbortError e silencia os cliques pendentes', async () => {
    const { context, source, input } = setup();
    const onEvent = vi.fn();
    const handle = await startCalibration(input, { startAt: 1, onEvent });
    await handle.cancel();
    await handle.cancel();
    await expect(handle.result).rejects.toMatchObject({ name: 'AbortError' });
    expect(context.sources.every((s) => s.connections.size === 0)).toBe(true);
    expect(source.connections.size).toBe(0);
    onEvent.mockClear();
    await advanceTo(context, 20);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('cria e fecha o próprio contexto para um MediaStream, com a chave do microfone', async () => {
    const created = stubOwnedContext();
    const stream = { getAudioTracks: () => [{ getSettings: () => ({ deviceId: 'mic-7' }) }] } as unknown as MediaStream;
    const handle = await startCalibration(stream, { startAt: 1 });
    expect(handle.context).toBe(created[0]);
    expect(handle.deviceKey).toBe('mic-7>default');
    await handle.cancel();
    expect(created[0].state).toBe('closed');
  });

  it('rejeita e fecha o próprio contexto quando o navegador o mantém suspenso', async () => {
    const created = stubOwnedContext((c) => {
      withWorklet(c);
      c.resume = async () => undefined;
    });
    await expect(startCalibration({} as MediaStream)).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(created[0].state).toBe('closed');
    expect(FakeWorkletNode.created).toHaveLength(0);
  });

  it('rejeita um contexto suspenso recebido para um MediaStream', async () => {
    const context = new FakeAudioContext();
    withWorklet(context);
    await expect(
      startCalibration({} as MediaStream, { context: context as unknown as AudioContext }),
    ).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(context.state).toBe('suspended');
  });

  it('recusa Lá fora da faixa', async () => {
    const { input } = setup();
    await expect(startCalibration(input, { a4: 0 })).rejects.toThrow(RangeError);
  });
});
