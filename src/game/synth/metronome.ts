import { scheduleClicks } from '../audio/latency/click';
import type { Song } from '../notation/song';
import { beatTime } from './schedule';

export interface CountInBeat {
  /** Tempo do AudioContext do clique. */
  time: number;
  /** Número que a tela Contagem mostra: N … 1. */
  count: number;
  /** Primeiro tempo do compasso de entrada. */
  downbeat: boolean;
}

export interface CountInOptions {
  startAt: number;
  /** Andamento da partida; padrão: o da música. */
  bpm?: number;
  /** Compassos de entrada; padrão 1, como na tela Contagem. */
  bars?: number;
}

/** Os tempos do compasso de entrada antes de startAt, no mesmo relógio e na mesma conta do Motor. */
export function countIn(song: Pick<Song, 'bpm' | 'timeSignature'>, options: CountInOptions): CountInBeat[] {
  const { startAt, bpm = song.bpm, bars = 1 } = options;
  if (!(bpm > 0) || !Number.isFinite(bpm)) throw new RangeError(`bpm inválido: ${bpm}`);
  if (!Number.isInteger(bars) || bars < 0) throw new RangeError(`compassos de entrada inválidos: ${bars}`);
  const perBar = song.timeSignature.beats;
  const total = perBar * bars;
  const spb = 60 / bpm;
  return Array.from({ length: total }, (_, i) => ({
    time: beatTime(startAt, i - total, spb),
    count: total - i,
    downbeat: i % perBar === 0,
  }));
}

/**
 * Toca a contagem com o clique da calibração (Lá7 de 3520 Hz com envelope gaussiano, que não põe energia na banda do
 * violino). Devolve quem silencia os cliques pendentes, ex.: em "Pular contagem".
 */
export function playCountIn(
  context: BaseAudioContext,
  beats: readonly CountInBeat[],
  destination: AudioNode = context.destination,
): () => void {
  return scheduleClicks(
    context,
    beats.map((beat) => beat.time),
    destination,
  );
}
