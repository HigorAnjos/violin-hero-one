import { RAW_AUDIO } from './microphone';
import { noteName } from './tuning';
import type { PitchReading } from './types';

/**
 * Diagnóstico do áudio no aparelho de verdade (WebView do Android, WKWebView do iOS): o que o navegador aplicou do
 * pedido de microfone cru, a taxa, as latências que ele informa e, ao vivo, quanto a detecção atrasa e quanto a nota
 * oscila. Com esses números se decide se o celular precisa de áudio nativo (Oboe, no Android).
 */

/** O processamento de voz que o RAW_AUDIO pede desligado. */
export const PROCESSING = ['echoCancellation', 'noiseSuppression', 'autoGainControl'] as const;
export type Processing = (typeof PROCESSING)[number];

/** 'on': pedimos desligado e o navegador diz que segue ligado; 'unknown': ele não informa (getSettings sem o campo). */
export type ProcessingState = 'off' | 'on' | 'unknown';

/** O tipo do microfone, nunca o rótulo: no celular e no Bluetooth ele costuma trazer o nome da pessoa (LGPD). */
export type MicKind = 'embutido' | 'fone com fio' | 'bluetooth' | 'usb' | 'desconhecido';

const KINDS: [MicKind, RegExp][] = [
  ['bluetooth', /bluetooth|airpods|buds|beats|hands-?free|\bbt\b/i],
  ['usb', /\busb\b/i],
  ['fone com fio', /headset|headphone|earphone|earpod|fone|wired|com fio|jack|lightning/i],
  ['embutido', /built-?in|intern|default|padr[aã]o|iphone|ipad|speakerphone|bottom|front|back|microphone|microfone/i],
];

/** Só o tipo sai do rótulo; o rótulo em si não é guardado nem copiado. */
export function micKind(label: string): MicKind {
  return KINDS.find(([, pattern]) => pattern.test(label))?.[0] ?? 'desconhecido';
}

export interface InputReport {
  kind: MicKind;
  /** getSupportedConstraints: o navegador reconhece o pedido. */
  supported: Record<Processing, boolean>;
  applied: Record<Processing, ProcessingState>;
  /** Ligados apesar do pedido: distorcem nível e altura de nota sustentada. */
  ignored: Processing[];
  trackSampleRate: number | null;
  channelCount: number | null;
  /** MediaTrackSettings.latency (Chrome), em ms. */
  trackLatencyMs: number | null;
  contextSampleRate: number;
  baseLatencyMs: number | null;
  outputLatencyMs: number | null;
  contextState: string;
}

/** O pedaço do áudio aberto que o diagnóstico lê (MicAudio serve). */
export interface DiagnosedAudio {
  context: Pick<AudioContext, 'sampleRate' | 'state'> & Partial<Pick<AudioContext, 'baseLatency' | 'outputLatency'>>;
  stream: Pick<MediaStream, 'getAudioTracks'>;
}

const ms = (seconds: unknown): number | null => (typeof seconds === 'number' && Number.isFinite(seconds) ? seconds * 1000 : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function readInput(audio: DiagnosedAudio, supported: MediaTrackSupportedConstraints = {}): InputReport {
  const track = audio.stream.getAudioTracks()[0];
  const settings: MediaTrackSettings & { latency?: number } = track?.getSettings?.() ?? {};
  const applied = {} as Record<Processing, ProcessingState>;
  const known = {} as Record<Processing, boolean>;
  for (const key of PROCESSING) {
    known[key] = supported[key] === true;
    const value = settings[key];
    applied[key] = typeof value === 'boolean' ? (value === RAW_AUDIO[key] ? 'off' : 'on') : 'unknown';
  }
  return {
    kind: micKind(track?.label ?? ''),
    supported: known,
    applied,
    ignored: PROCESSING.filter((key) => applied[key] === 'on'),
    trackSampleRate: num(settings.sampleRate),
    channelCount: num(settings.channelCount),
    trackLatencyMs: ms(settings.latency),
    contextSampleRate: audio.context.sampleRate,
    baseLatencyMs: ms(audio.context.baseLatency),
    outputLatencyMs: ms(audio.context.outputLatency),
    contextState: audio.context.state,
  };
}

/** Janela das estatísticas ao vivo: as leituras dos últimos segundos. */
export const LIVE_WINDOW_SECONDS = 2;
/** Menos leituras que isto na mesma nota e a estabilidade não é informada (nota curta, troca de corda). */
export const MIN_STEADY_READINGS = 20;
const MAX_LAGS = 300;

export interface LiveSnapshot {
  level: number | null;
  reading: PitchReading | null;
  /** Da amostra analisada até a leitura chegar na página (context.currentTime − reading.time), em ms. */
  lag: { meanMs: number; p95Ms: number; count: number } | null;
  /** Desvio-padrão dos cents na nota que soa agora, nos últimos LIVE_WINDOW_SECONDS. */
  steadiness: { midi: number; spreadCents: number; count: number } | null;
}

export interface LiveStats {
  /** `now`: o currentTime do AudioContext quando a leitura chegou. */
  push(reading: PitchReading | null, now: number): void;
  level(dbfs: number): void;
  snapshot(): LiveSnapshot;
  reset(): void;
}

function spread(values: readonly number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

export function createLiveStats(windowSeconds = LIVE_WINDOW_SECONDS): LiveStats {
  let lags: number[] = [];
  let held: PitchReading[] = [];
  let last: PitchReading | null = null;
  let level: number | null = null;
  return {
    push(reading, now) {
      last = reading;
      if (!reading) {
        held = [];
        return;
      }
      lags.push((now - reading.time) * 1000);
      if (lags.length > MAX_LAGS) lags = lags.slice(-MAX_LAGS);
      if (held.length && held[held.length - 1].midi !== reading.midi) held = [];
      held.push(reading);
      held = held.filter((r) => reading.time - r.time <= windowSeconds);
    },
    level(dbfs) {
      level = dbfs;
    },
    snapshot() {
      const sorted = [...lags].sort((a, b) => a - b);
      return {
        level,
        reading: last,
        lag: sorted.length
          ? { meanMs: sorted.reduce((a, b) => a + b, 0) / sorted.length, p95Ms: percentile(sorted, 0.95), count: sorted.length }
          : null,
        steadiness:
          held.length >= MIN_STEADY_READINGS ? { midi: held[0].midi, spreadCents: spread(held.map((r) => r.cents)), count: held.length } : null,
      };
    },
    reset() {
      lags = [];
      held = [];
      last = null;
      level = null;
    },
  };
}

/**
 * Até onde o áudio do WebView basta. Passou de algum destes, com fone com fio ou alto-falante, o Android pede o áudio
 * nativo (Oboe/AAudio, que costuma ficar em 20–40 ms de ida e volta e não aplica processamento de voz).
 */
export const OBOE_LIMITS = {
  /** Ida e volta calibrada (alto-falante → microfone): navegador de computador fica em 50–150 ms. */
  roundTripMs: 150,
  /** A meta do jogo: do som ao julgamento, já calibrado. */
  soundToJudgmentMs: 50,
  /** Atraso da detecção (p95): a análise e a mensagem do worklet até a página. */
  lagP95Ms: 30,
  /**
   * Oscilação da nota numa corda solta sustentada. Acima disto o ponteiro de afinação treme dentro da faixa
   * "afinado" (IN_TUNE_CENTS = 5); compare com a mesma corda no computador antes de culpar o WebView.
   */
  spreadCents: 3,
} as const;

export interface Calibrated {
  latencyMs: number;
  confidence: number;
  measuredAt: string;
}

/** Entrada estimada: a ida e volta calibrada menos a saída que o contexto informa. Sem outputLatency, não dá. */
export function soundToJudgmentMs(input: InputReport, live: LiveSnapshot, calibrated: Calibrated | null): number | null {
  if (!calibrated || input.outputLatencyMs === null || !live.lag) return null;
  return Math.max(0, calibrated.latencyMs - input.outputLatencyMs) + live.lag.p95Ms;
}

/** Os sinais medidos que indicam o Oboe; vazio quando o WebView está dentro dos limites. */
export function oboeSignals(input: InputReport, live: LiveSnapshot, calibrated: Calibrated | null): string[] {
  const signals: string[] = [];
  if (input.ignored.length) signals.push(`o WebView não desliga ${input.ignored.join(', ')} (distorce nível e afinação)`);
  if (calibrated && calibrated.latencyMs > OBOE_LIMITS.roundTripMs) {
    signals.push(`ida e volta calibrada de ${Math.round(calibrated.latencyMs)} ms (limite ${OBOE_LIMITS.roundTripMs} ms)`);
  }
  const judgment = soundToJudgmentMs(input, live, calibrated);
  if (judgment !== null && judgment > OBOE_LIMITS.soundToJudgmentMs) {
    signals.push(`som→julgamento estimado em ${Math.round(judgment)} ms (meta ${OBOE_LIMITS.soundToJudgmentMs} ms)`);
  }
  if (live.lag && live.lag.p95Ms > OBOE_LIMITS.lagP95Ms) {
    signals.push(`atraso da detecção p95 de ${live.lag.p95Ms.toFixed(1)} ms (limite ${OBOE_LIMITS.lagP95Ms} ms)`);
  }
  if (live.steadiness && live.steadiness.spreadCents > OBOE_LIMITS.spreadCents) {
    signals.push(`nota oscila ±${live.steadiness.spreadCents.toFixed(1)} cents parada (limite ±${OBOE_LIMITS.spreadCents})`);
  }
  return signals;
}

export interface ReportContext {
  when: Date;
  app: string;
  device: string;
  input: InputReport | null;
  live: LiveSnapshot;
  calibrated: Calibrated | null;
  a4: number;
}

const STATE_TEXT: Record<ProcessingState, string> = { off: 'desligado', on: 'LIGADO', unknown: 'não informado' };
const yes = (v: boolean) => (v ? 'sim' : 'não');
const fmt = (v: number | null, unit: string, digits = 1) => (v === null ? 'não informado' : `${v.toFixed(digits)} ${unit}`);

/** O texto que o botão copia: uma linha por medida, para colar numa conversa. */
export function formatReport({ when, app, device, input, live, calibrated, a4 }: ReportContext): string {
  const lines = ['Violin Hero · diagnóstico de áudio', `quando: ${when.toISOString()}`, `app: ${app}`, `aparelho: ${device}`, `lá: ${a4} Hz`];
  if (!input) {
    lines.push('microfone: fechado');
  } else {
    lines.push(
      `microfone: ${input.kind}`,
      `pedido: ${PROCESSING.map((k) => `${k}=${RAW_AUDIO[k]}`).join(' ')}`,
      `suportado: ${PROCESSING.map((k) => `${k}=${yes(input.supported[k])}`).join(' ')}`,
      `aplicado: ${PROCESSING.map((k) => `${k}=${STATE_TEXT[input.applied[k]]}`).join(' ')}`,
      `ignorado pelo WebView: ${input.ignored.length ? input.ignored.join(', ') : 'nenhum'}`,
      `taxa: contexto ${input.contextSampleRate} Hz · microfone ${input.trackSampleRate === null ? 'não informado' : `${input.trackSampleRate} Hz`} · ${input.channelCount ?? '?'} canal(is)`,
      `latência: base ${fmt(input.baseLatencyMs, 'ms')} · saída ${fmt(input.outputLatencyMs, 'ms')} · entrada (faixa) ${fmt(input.trackLatencyMs, 'ms')}`,
      `contexto: ${input.contextState}`
    );
  }
  lines.push(
    `calibração guardada: ${calibrated ? `${Math.round(calibrated.latencyMs)} ms (confiança ${calibrated.confidence.toFixed(2)}, ${calibrated.measuredAt})` : 'nenhuma'}`,
    `nível: ${fmt(live.level, 'dBFS')}`,
    `nota: ${live.reading ? `${noteName(live.reading.midi)} ${live.reading.hz.toFixed(1)} Hz ${live.reading.cents >= 0 ? '+' : ''}${live.reading.cents.toFixed(1)} cents · clareza ${live.reading.clarity.toFixed(2)}` : 'nenhuma'}`,
    `atraso da detecção: ${live.lag ? `média ${live.lag.meanMs.toFixed(1)} ms · p95 ${live.lag.p95Ms.toFixed(1)} ms (n=${live.lag.count})` : 'sem leituras'}`,
    `estabilidade: ${live.steadiness ? `±${live.steadiness.spreadCents.toFixed(1)} cents em ${noteName(live.steadiness.midi)} (n=${live.steadiness.count})` : 'segure uma corda solta'}`
  );
  if (input) {
    const judgment = soundToJudgmentMs(input, live, calibrated);
    lines.push(`som→julgamento estimado: ${judgment === null ? 'precisa de calibração, de uma nota tocada e da latência de saída do contexto' : `${Math.round(judgment)} ms`}`);
    const signals = oboeSignals(input, live, calibrated);
    lines.push(`sinais de Oboe: ${signals.length ? '' : 'nenhum'}`, ...signals.map((s) => `- ${s}`));
  }
  return lines.join('\n');
}
