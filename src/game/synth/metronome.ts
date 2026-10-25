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

/**
 * Os tempos do compasso de entrada antes de startAt, no mesmo relógio e na mesma conta do Motor. O som é o clique da
 * calibração (scheduleClicks do Ouvido), tocado por quem liga synth e audio: o engine.
 */
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
