import type { PitchReading } from '../audio/types';
import type { Finger } from '../notation/song';
import type { StringIndex } from '../notation/violin';

export type Judgment = 'perfect' | 'great' | 'good' | 'miss';

/**
 * Por que a nota não saiu Perfeito, ou por que errou. `null` num Perfeito.
 * - early / late: tempo (acerto fora do Perfeito, ou nota certa fora da janela);
 * - sharp / flat: afinação (alta / baixa);
 * - wrong-note: outra nota tocada na janela;
 * - not-played: nada ouvido na janela.
 */
export type Issue = 'early' | 'late' | 'sharp' | 'flat' | 'wrong-note' | 'not-played';

/** Meias-larguras das janelas de tempo, em ms. Além de `good` (ou nunca tocada) é Errou. */
export interface TimingWindows {
  perfect: number;
  great: number;
  good: number;
}

/** Nota de ataque posta no relógio do AudioContext. As ligadas já estão somadas na duração. */
export interface EngineNote {
  /** Posição entre os ataques (ordem de julgamento). */
  index: number;
  /** Índice da nota na timeline da música (o que a pista e a partitura usam). */
  noteIndex: number;
  measure: number;
  /** Tempo do AudioContext, em segundos, em que a nota começa. */
  time: number;
  /** Duração do som, em segundos, contando as notas ligadas. */
  duration: number;
  midi: number;
  string: StringIndex;
  finger: Finger;
  /** Frequência alvo no Lá da partida. */
  frequency: number;
}

export interface NoteJudgment {
  index: number;
  noteIndex: number;
  measure: number;
  string: StringIndex;
  midi: number;
  judgment: Judgment;
  issue: Issue | null;
  /** Ataque compensado − hora da nota, em ms (negativo = adiantado); null se nada foi ouvido. */
  offsetMs: number | null;
  /** Desvio do alvo em cents no ataque (positivo = alto); null se nada foi ouvido. */
  cents: number | null;
  /** Nota tocada no lugar, quando `issue` é wrong-note. */
  playedMidi: number | null;
  /** Pontos que esta nota somou (já multiplicados). */
  points: number;
}

export interface EngineState {
  score: number;
  combo: number;
  maxCombo: number;
  /** Multiplicador do próximo acerto. */
  multiplier: number;
  /** Energia da orquestra, 0 a 1: volume da orquestra sintética. Zero é game over. */
  energy: number;
  /** Precisão até aqui, em %. */
  accuracy: number;
  judged: number;
  total: number;
}

export type EngineStatus = 'playing' | 'finished' | 'failed';

export interface StringStats {
  string: StringIndex;
  notes: number;
  hits: number;
  misses: number;
  /** Notas desta corda com motivo alto / baixo, acertadas ou não. */
  sharp: number;
  flat: number;
  /** Afinação média dos acertos nesta corda, em cents (positivo = alto); null sem acertos. */
  meanCents: number | null;
  /** Atraso médio dos acertos nesta corda, em ms (negativo = adiantado); null sem acertos. */
  meanOffsetMs: number | null;
}

export type BadgeId = 'primeira-musica' | 'sem-erros' | 'combo-25' | 'combo-50' | 'combo-100' | 'afinacao-de-ouro';

export interface GameResult {
  /** finished: chegou ao fim; failed: a orquestra parou. */
  status: Exclude<EngineStatus, 'playing'>;
  judgments: NoteJudgment[];
  counts: Record<Judgment, number>;
  score: number;
  maxCombo: number;
  accuracy: number;
  energy: number;
  /** Atraso médio dos acertos em ms (negativo = adiantado); null sem acertos. */
  meanOffsetMs: number | null;
  /** Desvio médio absoluto de afinação dos acertos, em cents; null sem acertos. */
  meanAbsCents: number | null;
  /** Sempre as 4 cordas, Sol a Mi. */
  strings: StringStats[];
  /** Corda com mais erros; null sem erros. */
  mostMissedString: StringIndex | null;
  /** Último compasso julgado (a partir de 0); -1 se nada foi julgado. */
  reachedMeasure: number;
  totalMeasures: number;
  /** Selos novos desta partida (sem os já conquistados). */
  badges: BadgeId[];
}

export type EngineEvent =
  | ({ type: 'judgment' } & NoteJudgment & { state: EngineState })
  | { type: 'gameover'; result: GameResult }
  | { type: 'done'; result: GameResult };

export type EngineListener = (event: EngineEvent) => void;

export interface Engine {
  readonly notes: readonly EngineNote[];
  readonly state: EngineState;
  readonly status: EngineStatus;
  /** Cada leitura do Ouvido, ou null quando o som deixa de ser claro. */
  push(reading: PitchReading | null): void;
  /** Hora atual do AudioContext; chame a cada quadro, com ou sem leitura, para expirar notas. */
  advance(now: number): void;
  /** Resultado final; lança enquanto status for playing. */
  result(): GameResult;
}
