import type { OrchestraSection } from '../../assets/styles/themes/types';
import { attacks, type Song } from '../notation/song';
import { DEFAULT_A4, midiToFrequency } from '../notation/violin';
import { PARTS, PART_SECTION, arrange, type Part } from './arrange';
import { VOICES } from './voices';

export interface TimedNote {
  part: Part;
  section: OrchestraSection;
  /** Tempo do AudioContext, em segundos. */
  time: number;
  /** Até o fim do sustain; o som ainda dura o release da voz depois disso. */
  duration: number;
  /** Até onde o som da nota vai, release incluído. */
  end: number;
  midi: number;
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
  /** Com fone: orquestra completa, sem desviar da melodia. */
  headphones?: boolean;
}

/** Todas as notas da orquestra no relógio do AudioContext, em ordem de tempo. */
export function scheduleOrchestra(song: Song, options: ScheduleOptions): TimedNote[] {
  const { startAt, bpm = song.bpm, a4 = DEFAULT_A4, sections, headphones = false } = options;
  const spb = 60 / bpm;
  const { parts } = arrange(song, { avoidMelody: !headphones });
  const notes: TimedNote[] = [];
  for (const part of PARTS) {
    const section = PART_SECTION[part];
    if (sections && !sections.includes(section)) continue;
    for (const note of parts[part]) {
      const time = beatTime(startAt, note.beat, spb);
      const duration = note.beats * spb;
      notes.push({
        part,
        section,
        time,
        duration,
        end: time + duration + VOICES[part].release,
        midi: note.midi,
        frequency: midiToFrequency(note.midi, a4),
        velocity: note.velocity,
      });
    }
  }
  return notes.sort((a, b) => a.time - b.time);
}

/** Nenhuma nota dura mais que isto (um compasso inteiro de 12 tempos a 30 bpm mais o release): limite da busca para trás. */
const MAX_NOTE_SPAN = 30;
const ALL_SECTIONS: ReadonlySet<OrchestraSection> = new Set(PARTS.map((part) => PART_SECTION[part]));

/**
 * As notas que soam no instante `time` (início ≤ time < end, release incluído), entre as dos naipes dados, em ordem de
 * início. Busca binária pelo início: chamar a cada leitura do Ouvido (~100 por segundo) custa O(log n + notas soando).
 */
export function notesSoundingAt(
  notes: readonly TimedNote[],
  time: number,
  sections: ReadonlySet<OrchestraSection> | readonly OrchestraSection[] = ALL_SECTIONS,
): TimedNote[] {
  const allowed = sections instanceof Set ? sections : new Set(sections);
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  const out: TimedNote[] = [];
  for (let i = lo - 1; i >= 0 && time - notes[i].time < MAX_NOTE_SPAN; i--) {
    const note = notes[i];
    if (time < note.end && allowed.has(note.section)) out.push(note);
  }
  return out.reverse();
}

/** Queda da orquestra em volta de cada ataque esperado do violino. */
export const DUCK_DB = -6;
/** Meia janela: ~100 ms no total, centrados no ataque. */
export const DUCK_HALF_SECONDS = 0.05;
/** Rampa de entrada e saída da queda, para não estalar. */
export const DUCK_RAMP_SECONDS = 0.01;

export interface DuckWindow {
  /** Já em −6 dB a partir daqui (a rampa começa DUCK_RAMP_SECONDS antes). */
  from: number;
  /** Ainda em −6 dB até aqui (a rampa de volta termina DUCK_RAMP_SECONDS depois). */
  to: number;
}

/** Uma janela por ataque esperado (as notas ligadas não atacam), juntando as que se encostam com rampa. */
export function duckWindows(song: Song, startAt: number, bpm: number = song.bpm): DuckWindow[] {
  const spb = 60 / bpm;
  const windows: DuckWindow[] = [];
  for (const note of attacks(song)) {
    const at = beatTime(startAt, note.at, spb);
    const from = at - DUCK_HALF_SECONDS;
    const to = at + DUCK_HALF_SECONDS;
    const last = windows[windows.length - 1];
    if (last && from - last.to <= 2 * DUCK_RAMP_SECONDS) last.to = to;
    else windows.push({ from, to });
  }
  return windows;
}
