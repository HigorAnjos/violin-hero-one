// `?worker&url` faz o Vite empacotar o worklet (com o pitchy) num arquivo próprio e devolver a URL dele.
import workletUrl from './worklet.ts?worker&url';
import { DEFAULT_A4 } from '../../notation/violin';
import { assertA4 } from '../tuning';
import type { PitchListener } from '../types';
import { DEFAULT_MIN_CLARITY } from './constants';
import { PROCESSOR_NAME, type FromProcessor, type ProcessorOptions, type ToProcessor } from './protocol';

export interface PitchOptions {
  /** Lá de referência em Hz. Padrão 442. */
  a4?: number;
  /** Detecções abaixo desta clareza são ignoradas. Padrão 0,9. */
  minClarity?: number;
  /** Contexto usado quando a fonte é um MediaStream; sem ele, um novo é criado (e fechado no stop). */
  context?: AudioContext;
}

export interface PitchHandle {
  readonly context: BaseAudioContext;
  readonly a4: number;
  /** Troca o Lá de referência na hora, sem reiniciar a detecção. */
  setA4(a4: number): void;
  /** Desconecta o analisador e fecha o AudioContext só se foi o startPitch que o criou. */
  stop(): Promise<void>;
}

const modules = new WeakMap<BaseAudioContext, Promise<void>>();

function loadProcessor(context: BaseAudioContext): Promise<void> {
  let loading = modules.get(context);
  if (!loading) {
    loading = context.audioWorklet.addModule(workletUrl);
    loading.catch(() => modules.delete(context));
    modules.set(context, loading);
  }
  return loading;
}

function isAudioNode(source: MediaStream | AudioNode): source is AudioNode {
  return typeof (source as AudioNode).connect === 'function';
}

/** Liga o detector de afinação à fonte e chama `onReading` a cada ~10 ms, ou com null ao perder o som. */
export async function startPitch(
  source: MediaStream | AudioNode,
  onReading: PitchListener,
  options: PitchOptions = {},
): Promise<PitchHandle> {
  let a4 = options.a4 ?? DEFAULT_A4;
  assertA4(a4);
  const minClarity = options.minClarity ?? DEFAULT_MIN_CLARITY;

  let context: BaseAudioContext;
  let input: AudioNode;
  let ownedContext: AudioContext | undefined;
  let ownedInput: AudioNode | undefined;
  let resumed: Promise<void> | undefined;
  if (isAudioNode(source)) {
    context = source.context;
    input = source;
  } else {
    if (options.context) {
      context = options.context;
    } else {
      // Criado e retomado antes do primeiro await: o Safari do iOS só libera áudio dentro do gesto do usuário.
      ownedContext = new AudioContext({ latencyHint: 'interactive' });
      resumed = ownedContext.resume();
      context = ownedContext;
    }
    input = ownedInput = (context as AudioContext).createMediaStreamSource(source);
  }

  let node: AudioWorkletNode;
  try {
    if (ownedContext) await resumed;
    if (ownedInput && (context as AudioContext).state !== 'running') {
      throw new DOMException(`audio context is ${(context as AudioContext).state}`, 'InvalidStateError');
    }
    await loadProcessor(context);
    const processorOptions: ProcessorOptions = { a4, minClarity };
    node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      processorOptions,
    });
  } catch (error) {
    ownedInput?.disconnect();
    await ownedContext?.close().catch(() => undefined);
    throw error;
  }

  node.port.onmessage = (event: MessageEvent<FromProcessor>) => onReading(event.data);
  input.connect(node);
  // O processador escreve silêncio; ligar ao destino mantém o grafo puxando uma fonte que ninguém mais escuta.
  node.connect(context.destination);

  let stopped = false;
  return {
    context,
    get a4() {
      return a4;
    },
    setA4(next: number) {
      assertA4(next);
      a4 = next;
      const message: ToProcessor = { type: 'a4', a4: next };
      node.port.postMessage(message);
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      node.port.onmessage = null;
      input.disconnect(node);
      node.disconnect();
      ownedInput?.disconnect();
      await ownedContext?.close();
    },
  };
}
