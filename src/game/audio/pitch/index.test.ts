import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakeNode } from '../testing/web-audio';
import type { PitchReading } from '../types';
import { PROCESSOR_NAME } from './protocol';

vi.mock('./worklet.ts?worker&url', () => ({ default: '/assets/pitch-worklet.js' }));

class FakePort {
  readonly sent: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage(message: unknown): void {
    this.sent.push(message);
  }
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

function withWorklet<T extends object>(context: T, addModule = vi.fn<(url: string) => Promise<void>>(async () => undefined)) {
  Object.assign(context, { audioWorklet: { addModule } });
  return addModule;
}

function nodeOf(context: FakeAudioContext): AudioNode {
  return new FakeNode(context) as unknown as AudioNode;
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

const reading: PitchReading = { time: 1, hz: 442, midi: 69, cents: 0, clarity: 0.99, level: -12 };

let startPitch: typeof import('./index').startPitch;

beforeEach(async () => {
  FakeWorkletNode.created = [];
  vi.unstubAllGlobals();
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  vi.resetModules();
  ({ startPitch } = await import('./index'));
});

describe('startPitch', () => {
  it('liga a fonte ao worklet e o worklet ao destino', async () => {
    const context = new FakeAudioContext();
    const addModule = withWorklet(context);
    const source = new FakeNode(context);

    const handle = await startPitch(source as unknown as AudioNode, () => {});

    expect(addModule).toHaveBeenCalledWith('/assets/pitch-worklet.js');
    const [node] = FakeWorkletNode.created;
    expect(node.name).toBe(PROCESSOR_NAME);
    expect(node.options.processorOptions).toEqual({ a4: 442, minClarity: 0.9 });
    expect(node.options.channelCount).toBe(1);
    expect(source.connections.has(node)).toBe(true);
    expect(node.connections.has(context.destination)).toBe(true);
    expect(handle.context).toBe(context);
    expect(handle.a4).toBe(442);
  });

  it('repassa leituras e null ao ouvinte', async () => {
    const context = new FakeAudioContext();
    withWorklet(context);
    const listener = vi.fn();
    await startPitch(nodeOf(context), listener);
    const port = FakeWorkletNode.created[0].port;
    port.onmessage!({ data: reading });
    port.onmessage!({ data: null });
    expect(listener.mock.calls).toEqual([[reading], [null]]);
  });

  it('carrega o módulo uma vez por contexto', async () => {
    const context = new FakeAudioContext();
    const addModule = withWorklet(context);
    await startPitch(nodeOf(context), () => {});
    await startPitch(nodeOf(context), () => {});
    expect(addModule).toHaveBeenCalledTimes(1);
  });

  it('passa as opções e manda a troca de Lá ao processador sem recriá-lo', async () => {
    const context = new FakeAudioContext();
    withWorklet(context);
    const handle = await startPitch(nodeOf(context), () => {}, { a4: 440, minClarity: 0.8 });
    const node = FakeWorkletNode.created[0];
    expect(node.options.processorOptions).toEqual({ a4: 440, minClarity: 0.8 });
    handle.setA4(443);
    expect(handle.a4).toBe(443);
    expect(node.port.sent).toEqual([{ type: 'a4', a4: 443 }]);
    expect(FakeWorkletNode.created).toHaveLength(1);
    expect(() => handle.setA4(0)).toThrow(RangeError);
    expect(handle.a4).toBe(443);
  });

  it('recusa Lá inválido', async () => {
    const context = new FakeAudioContext();
    withWorklet(context);
    await expect(startPitch(nodeOf(context), () => {}, { a4: Number.NaN })).rejects.toThrow(RangeError);
  });

  it('stop desconecta sem fechar um contexto que não é dele', async () => {
    const context = new FakeAudioContext();
    await context.resume();
    withWorklet(context);
    const source = new FakeNode(context);
    const handle = await startPitch(source as unknown as AudioNode, () => {});
    const node = FakeWorkletNode.created[0];

    await handle.stop();
    await handle.stop();

    expect(source.connections.size).toBe(0);
    expect(node.connections.size).toBe(0);
    expect(node.port.onmessage).toBeNull();
    expect(context.state).toBe('running');
  });

  it('cria e fecha o próprio contexto para um MediaStream', async () => {
    const created = stubOwnedContext();
    const handle = await startPitch({} as MediaStream, () => {});
    expect(created).toHaveLength(1);
    expect(created[0].latencyHint).toBe('interactive');
    expect(handle.context).toBe(created[0]);
    expect(created[0].state).toBe('running');
    await handle.stop();
    expect(created[0].state).toBe('closed');
  });

  it('usa o contexto dado para um MediaStream e o deixa aberto', async () => {
    const context = new FakeAudioContext();
    await context.resume();
    withWorklet(context);
    const handle = await startPitch({} as MediaStream, () => {}, { context: context as unknown as AudioContext });
    expect(handle.context).toBe(context);
    await handle.stop();
    expect(context.state).toBe('running');
  });

  it('fecha o próprio contexto quando o módulo falha', async () => {
    const created = stubOwnedContext((c) => withWorklet(c, vi.fn(async () => Promise.reject(new Error('blocked')))));
    await expect(startPitch({} as MediaStream, () => {})).rejects.toThrow('blocked');
    expect(created[0].state).toBe('closed');
  });

  it('recusa e fecha o próprio contexto quando o navegador o mantém suspenso', async () => {
    const created = stubOwnedContext((c) => {
      withWorklet(c);
      c.resume = async () => undefined;
    });
    await expect(startPitch({} as MediaStream, () => {})).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(created[0].state).toBe('closed');
    expect(FakeWorkletNode.created).toHaveLength(0);
  });

  it('tenta carregar o módulo de novo depois de uma falha', async () => {
    const context = new FakeAudioContext();
    const addModule = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    withWorklet(context, addModule);
    await expect(startPitch(nodeOf(context), () => {})).rejects.toThrow('offline');
    await expect(startPitch(nodeOf(context), () => {})).resolves.toBeDefined();
    expect(addModule).toHaveBeenCalledTimes(2);
  });
});
