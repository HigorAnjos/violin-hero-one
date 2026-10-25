export const DEFAULT_BPM = 60;
export const DEFAULT_BEATS = 8;
export const DEFAULT_COUNT_IN = 4;
/** Ataque mais longe que isto do seu clique é descartado: 250 ms de latência mais a variação humana cabem. */
export const MAX_DELAY_MS = 300;
/** Menos tempos aproveitados que isto e a sessão não é confiável. */
export const MIN_BEATS = 5;
/** Desvio-padrão acima disto (tempos aproveitados) e a sessão não é confiável. */
export const MAX_RELIABLE_SPREAD_MS = 25;
/** Latência de ida e volta assumida antes de calibrar: meio da faixa típica de navegador (50–150 ms). */
export const DEFAULT_LATENCY_SECONDS = 0.1;
/** Faixa de profiles.latency_ms no banco. */
export const MAX_LATENCY_MS = 1000;
export const DEFAULT_DEVICE_KEY = 'default';

export interface ClickSchedule {
  /** Tempos (AudioContext) da contagem, que não são medidos. */
  countIn: number[];
  /** Tempos (AudioContext) dos cliques medidos, um por tempo. */
  beats: number[];
}

export type SampleStatus = 'hit' | 'missed' | 'outlier';

export interface LatencySample {
  index: number;
  clickTime: number;
  /** Tempo (AudioContext) do ataque atribuído a este clique; null quando perdido. */
  attackTime: number | null;
  /** attackTime − clickTime em segundos; null quando perdido. Preenchido também em outlier, que fica fora da média. */
  delaySeconds: number | null;
  status: SampleStatus;
}

export interface CalibrationResult {
  /** Média aparada (20%) dos tempos aproveitados, em segundos; NaN quando nenhum foi aproveitado. */
  latencySeconds: number;
  /** De 0 a 1: fração de tempos aproveitados, descontada pela dispersão. */
  confidence: number;
  /** Só um resultado confiável é gravado e deve ser usado no jogo. */
  reliable: boolean;
  /** Desvio-padrão dos tempos aparados, em segundos. */
  spreadSeconds: number;
  /** Um por clique medido; o status final pode virar 'outlier' depois de comparar todos. */
  samples: LatencySample[];
}

/** Um ataque da corda Lá solta confirmado pelo detector de altura. */
export interface Attack {
  time: number;
  hz: number;
}

export type CalibrationEvent =
  | { type: 'scheduled'; schedule: ClickSchedule }
  | { type: 'click'; index: number; time: number; countIn: boolean }
  | { type: 'attack'; attack: Attack }
  | { type: 'sample'; sample: LatencySample }
  | { type: 'done'; result: CalibrationResult };

export type CalibrationListener = (event: CalibrationEvent) => void;

export interface CalibrationOptions {
  bpm?: number;
  beats?: number;
  countIn?: number;
  /** Lá de referência em Hz; o ataque precisa estar a ±50 cents dele. Padrão 442. */
  a4?: number;
  /** Contexto usado quando a fonte é um MediaStream; sem ele, um novo é criado (e fechado no fim). */
  context?: AudioContext;
  /** Tempo (AudioContext) do primeiro clique da contagem. Padrão: agora + 0,5 s. */
  startAt?: number;
  /** Grava o resultado confiável no aparelho. Padrão true. */
  save?: boolean;
  /** Par de dispositivos sob o qual gravar; padrão: deduzido do MediaStream e do contexto. */
  deviceKey?: string;
  onEvent?: CalibrationListener;
}

export interface CalibrationHandle {
  readonly context: BaseAudioContext;
  readonly schedule: ClickSchedule;
  readonly deviceKey: string;
  /** Resolve depois que a janela do último tempo fecha; rejeita com AbortError no cancel. */
  readonly result: Promise<CalibrationResult>;
  cancel(): Promise<void>;
}

export interface StoredLatency {
  latencySeconds: number;
  confidence: number;
  /** ISO 8601. */
  measuredAt: string;
}
