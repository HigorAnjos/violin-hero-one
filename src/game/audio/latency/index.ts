import workletUrl from './worklet.ts?worker&url';
import { DEFAULT_A4 } from '../../notation/violin';
import { assertA4 } from '../tuning';
import { CONFIRM_SECONDS } from './attack';
import { scheduleClicks } from './click';
import { assignSamples, summarize } from './estimator';
import { ATTACK_PROCESSOR_NAME, type AttackProcessorOptions, type FromAttackProcessor } from './protocol';
import { clickSchedule } from './schedule';
import { audioDeviceKey, latencyToMs, saveLatency } from './storage';
import {
  DEFAULT_BPM,
  MAX_DELAY_MS,
  type Attack,
  type CalibrationEvent,
  type CalibrationHandle,
  type CalibrationOptions,
  type CalibrationResult,
  type LatencySample,
} from './types';

export const LEAD_IN_SECONDS = 0.5;
const TICK_MS = 20;
/** Folga de postMessage e de timer depois da janela de confirmação do próprio detector de ataque. */
const CLOSE_MARGIN_SECONDS = 0.05;

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

/**
 * Toca cliques no relógio do AudioContext e mede, no microfone, o ataque da corda Lá solta que o jogador toca junto com
 * cada um. O resultado é a latência de ida e volta (saída + entrada) a descontar de PitchReading.time. Um resultado
 * confiável é gravado no aparelho para o par de dispositivos.
 */
export async function startCalibration(
  source: MediaStream | AudioNode,
  options: CalibrationOptions = {},
): Promise<CalibrationHandle> {
  const a4 = options.a4 ?? DEFAULT_A4;
  assertA4(a4);
  const bpm = options.bpm ?? DEFAULT_BPM;
  const emit = (event: CalibrationEvent) => options.onEvent?.(event);

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
  const deviceKey = options.deviceKey ?? audioDeviceKey(isAudioNode(source) ? undefined : source, context);

  let node: AudioWorkletNode;
  try {
    if (ownedContext) await resumed;
    if (ownedInput && (context as AudioContext).state !== 'running') {
      throw new DOMException(`audio context is ${(context as AudioContext).state}`, 'InvalidStateError');
    }
    await loadProcessor(context);
    const processorOptions: AttackProcessorOptions = { a4 };
    node = new AudioWorkletNode(context, ATTACK_PROCESSOR_NAME, {
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

  // Lê o relógio só depois do addModule: no celular ele demora o bastante para deixar uma contagem pré-calculada no passado.
  const startAt = options.startAt ?? context.currentTime + LEAD_IN_SECONDS;
  const schedule = clickSchedule(startAt, { bpm, beats: options.beats, countIn: options.countIn });
  const clicks = [
    ...schedule.countIn.map((time, index) => ({ time, index, countIn: true })),
    ...schedule.beats.map((time, index) => ({ time, index, countIn: false })),
  ];
  const closeAfter = Math.min(30 / bpm, (2 * MAX_DELAY_MS) / 1000) + CONFIRM_SECONDS + CLOSE_MARGIN_SECONDS;

  const attacks: Attack[] = [];
  const samples: LatencySample[] = [];
  let nextClick = 0;
  let settled = false;
  let resolve!: (result: CalibrationResult) => void;
  let reject!: (error: unknown) => void;
  const result = new Promise<CalibrationResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  result.catch(() => undefined);

  node.port.onmessage = (event: MessageEvent<FromAttackProcessor>) => {
    attacks.push(event.data);
    emit({ type: 'attack', attack: event.data });
  };
  input.connect(node);
  // O processador escreve silêncio; ligar ao destino mantém o grafo puxando uma fonte que ninguém mais escuta.
  node.connect(context.destination);
  const stopClicks = scheduleClicks(context, clicks.map((c) => c.time));

  let tornDown: Promise<void> | undefined;
  const teardown = (): Promise<void> => {
    tornDown ??= (async () => {
      clearInterval(timer);
      stopClicks();
      node.port.onmessage = null;
      input.disconnect(node);
      node.disconnect();
      ownedInput?.disconnect();
      await ownedContext?.close().catch(() => undefined);
    })();
    return tornDown;
  };

  const tick = () => {
    if (settled) return;
    const now = context.currentTime;
    while (nextClick < clicks.length && clicks[nextClick].time <= now) {
      const { index, time, countIn } = clicks[nextClick++];
      emit({ type: 'click', index, time, countIn });
    }
    while (samples.length < schedule.beats.length && schedule.beats[samples.length] + closeAfter <= now) {
      const sample = assignSamples(schedule.beats, attacks)[samples.length];
      samples.push(sample);
      emit({ type: 'sample', sample });
    }
    if (samples.length < schedule.beats.length) return;
    settled = true;
    const final = summarize(samples);
    if (final.reliable && options.save !== false) {
      saveLatency(
        {
          latencySeconds: latencyToMs(final.latencySeconds) / 1000,
          confidence: final.confidence,
          measuredAt: new Date().toISOString(),
        },
        deviceKey,
      );
    }
    void teardown();
    emit({ type: 'done', result: final });
    resolve(final);
  };

  emit({ type: 'scheduled', schedule });
  const timer = setInterval(tick, TICK_MS);

  return {
    context,
    schedule,
    deviceKey,
    result,
    async cancel() {
      if (!settled) {
        settled = true;
        reject(new DOMException('calibration cancelled', 'AbortError'));
      }
      await teardown();
    },
  };
}
