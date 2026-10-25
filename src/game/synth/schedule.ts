import type { OrchestraSection } from '../../assets/styles/themes/types';
import type { Song } from '../notation/song';
import { DEFAULT_A4, midiToFrequency } from '../notation/violin';
import { PARTS, PART_SECTION, arrange, type Part } from './arrange';

export interface TimedNote {
  part: Part;
  /** Tempo do AudioContext, em segundos. */
  time: number;
  duration: number;
  frequency: number;
  velocity: number;
}

/**
 * A mesma conta do scheduleNotes do Motor (startAt + tempo × segundos por tempo), multiplicada e nunca somada nota a
 * nota: sem erro acumulado, a última nota de uma música de 3 min cai no mesmo instante que o Motor julga.
 */
export function beatTime(startAt: number, beat: number, secondsPerBeat: number): number {
  return startAt + beat * secondsPerBeat;
}

export interface ScheduleOptions {
  startAt: number;
  /** Andamento da partida; padrão: o da música (o mesmo `bpm` passado ao Motor). */
  bpm?: number;
  a4?: number;
  /** Só estes naipes; padrão: todos. */
  sections?: readonly OrchestraSection[];
}

/** Todas as notas da orquestra no relógio do AudioContext, em ordem de tempo. */
export function scheduleOrchestra(song: Song, options: ScheduleOptions): TimedNote[] {
  const { startAt, bpm = song.bpm, a4 = DEFAULT_A4, sections } = options;
  const spb = 60 / bpm;
  const { parts } = arrange(song);
  const notes: TimedNote[] = [];
  for (const part of PARTS) {
    if (sections && !sections.includes(PART_SECTION[part])) continue;
    for (const note of parts[part]) {
      notes.push({
        part,
        time: beatTime(startAt, note.beat, spb),
        duration: note.beats * spb,
        frequency: midiToFrequency(note.midi, a4),
        velocity: note.velocity,
      });
    }
  }
  return notes.sort((a, b) => a.time - b.time);
}
