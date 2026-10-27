// Ditado: as leituras do Ouvido (altura, nível e clareza a cada ~10 ms) viram a melodia do editor. Puro, sem áudio e
// sem tela: agrupa as leituras em notas, descarta ruído e notas curtas demais, desconta a latência do aparelho e põe
// início e duração na grade (colcheia ou semicolcheia) do andamento e do compasso escolhidos.
import { barQuarters, insertNote, type EditorState } from './editor';
import type { TimeSignature } from './song';

/** Intervalo entre leituras do Ouvido (HOP_SECONDS do tracker). */
const HOP_SECONDS = 0.01;
/** Leituras seguidas na mesma nota para o ataque contar como estável. */
const STABLE_READINGS = 3;
/** Abaixo desta clareza a leitura é ruído e conta como silêncio (o mesmo gate do tracker). */
const MIN_CLARITY = 0.9;
/** Nota mais curta que esta fração da semicolcheia (no andamento do ditado) é descartada. */
const MIN_NOTE_SIXTEENTHS = 0.7;
/** Queda de nível (dB abaixo do pico da nota) que separa duas notas iguais seguidas: a troca de arco. */
const DIP_DB = 9;
/** Volta do nível depois da queda, em dB acima do fundo dela, para a queda virar nota nova. */
const RISE_DB = 6;
/** Fim da nota: o que passa desta fração da última célula da grade conta como a célula inteira. */
const END_ROUNDING = 0.4;

/** Grade do ditado, em semínimas: colcheia (padrão) ou semicolcheia. */
export type DictationGrid = 0.5 | 0.25;
export const DEFAULT_DICTATION_GRID: DictationGrid = 0.5;

/** O que o ditado usa de cada PitchReading do Ouvido. `null` é o fim do som claro. */
export interface DictationReading {
  /** Hora do AudioContext, sem compensação de latência. */
  time: number;
  /** Nota temperada mais próxima (o tracker já arredonda a desafinação). */
  midi: number;
  /** Nível do último trecho, em dBFS. */
  level: number;
  clarity: number;
}

export interface DictationOptions {
  /** Tempos (da unidade do compasso) por minuto, como Song.bpm. */
  bpm: number;
  timeSignature: TimeSignature;
  /** Hora do AudioContext do primeiro tempo do ditado (o fim da contagem). */
  startAt: number;
  /** Latência medida do aparelho, descontada da hora das leituras. */
  latencySeconds: number;
  grid?: DictationGrid;
}

/** Nota ditada, em semínimas desde o primeiro tempo do ditado. */
export interface DictatedNote {
  at: number;
  length: number;
  midi: number;
}

export interface Dictation {
  /** Uma leitura (ou o fim do som); devolve as notas que acabaram de fechar, já na grade. */
  push(reading: DictationReading | null): DictatedNote[];
  /** Fecha a nota que ainda soa (a pessoa parou); `time` é a hora do AudioContext da parada. */
  finish(time?: number): DictatedNote[];
  /** Todas as notas até agora, cada uma já cortada pela seguinte. */
  readonly notes: readonly DictatedNote[];
}

interface Sounding {
  start: number;
  midi: number;
  /** Maior nível desde o começo (ou desde a última queda). */
  peak: number;
}

interface Dip {
  time: number;
  floor: number;
  floorTime: number;
}

const tidy = (value: number) => Math.round(value * 1e9) / 1e9;

/** Semínimas por segundo no andamento escolhido: o bpm conta a unidade do compasso. */
export function secondsPerQuarter(bpm: number, ts: TimeSignature): number {
  return (60 / bpm) * (ts.unit / 4);
}

export function createDictation(options: DictationOptions): Dictation {
  const { bpm, timeSignature, startAt, latencySeconds } = options;
  if (!(bpm > 0) || !Number.isFinite(bpm)) throw new RangeError(`bpm inválido: ${bpm}`);
  const grid = options.grid ?? DEFAULT_DICTATION_GRID;
  const spq = secondsPerQuarter(bpm, timeSignature);
  const sixteenth = spq / 4;
  const minNote = MIN_NOTE_SIXTEENTHS * sixteenth;
  /** Altura nova que dura menos que isto é vibrato ou glissando, não nota nova. */
  const changeSeconds = Math.min(0.1, Math.max(0.05, sixteenth / 2));

  const notes: DictatedNote[] = [];
  let last = -Infinity;
  /** Ataque ainda instável: começo do som e a altura que vem se repetindo. */
  let attack: { start: number; midi: number; count: number } | null = null;
  let sounding: Sounding | null = null;
  let change: { since: number; midi: number } | null = null;
  let dip: Dip | null = null;

  const quantize = (start: number, end: number, midi: number): DictatedNote | null => {
    if (end - start < minNote) return null;
    const from = (start - latencySeconds - startAt) / spq;
    const to = (end - latencySeconds - startAt) / spq;
    const previous = notes[notes.length - 1];
    let at = Math.max(0, Math.round(from / grid) * grid);
    if (previous) at = Math.max(at, previous.at + grid);
    const endAt = Math.floor(to / grid + (1 - END_ROUNDING)) * grid;
    // Tocada inteira na contagem
    if (endAt <= 0 && from < 0) return null;
    if (previous && previous.at + previous.length > at) previous.length = tidy(at - previous.at);
    const note = { at: tidy(at), length: tidy(Math.max(grid, endAt - at)), midi };
    notes.push(note);
    return note;
  };

  const close = (end: number): DictatedNote[] => {
    const note = sounding ? quantize(sounding.start, end, sounding.midi) : null;
    sounding = null;
    change = null;
    dip = null;
    return note ? [note] : [];
  };

  const begin = (start: number, midi: number, level: number) => {
    sounding = { start, midi, peak: level };
    change = null;
    dip = null;
    attack = null;
  };

  const silence = (): DictatedNote[] => {
    attack = null;
    return close(last + HOP_SECONDS);
  };

  return {
    push(reading) {
      if (!reading || !(reading.clarity >= MIN_CLARITY)) {
        if (reading) last = reading.time;
        return silence();
      }
      const { time, midi, level } = reading;
      last = time;

      if (!sounding) {
        if (!attack) attack = { start: time, midi, count: 0 };
        if (attack.midi !== midi) attack = { ...attack, midi, count: 0 };
        if (++attack.count >= STABLE_READINGS) begin(attack.start, midi, level);
        return [];
      }

      const out: DictatedNote[] = [];
      const current: Sounding = sounding;
      // Troca de arco na mesma nota: o nível cai e volta
      if (level <= current.peak - DIP_DB) {
        if (!dip) dip = { time, floor: level, floorTime: time };
        else if (level < dip.floor) dip = { ...dip, floor: level, floorTime: time };
      } else {
        if (dip && level >= dip.floor + RISE_DB) {
          const restart = dip.floorTime;
          out.push(...close(dip.time));
          begin(restart, midi, level);
          return out;
        }
        // Oscilação rasa (o arco tremeu): não é troca de arco
        dip = null;
        current.peak = Math.max(current.peak, level);
      }

      if (midi === current.midi) {
        change = null;
        return out;
      }
      if (!change || change.midi !== midi) change = { since: time, midi };
      if (time - change.since + HOP_SECONDS >= changeSeconds) {
        const since = change.since;
        out.push(...close(since));
        begin(since, midi, level);
      }
      return out;
    },
    finish(time) {
      if (time !== undefined && Number.isFinite(time)) last = Math.max(last, time - HOP_SECONDS);
      attack = null;
      return sounding ? close(Math.min(last + HOP_SECONDS, time ?? Infinity)) : [];
    },
    get notes() {
      return notes;
    },
  };
}

/** O ditado inteiro de uma vez: as leituras na ordem em que o Ouvido entregou. */
export function dictate(readings: Iterable<DictationReading | null>, options: DictationOptions): DictatedNote[] {
  const dictation = createDictation(options);
  for (const reading of readings) dictation.push(reading);
  dictation.finish();
  return dictation.notes.map((n) => ({ ...n }));
}

/** Onde o ditado começa no editor: no compasso seguinte à última nota escrita (o começo, numa partitura vazia). */
export function dictationOrigin(state: Pick<EditorState, 'doc'>): number {
  const bar = barQuarters(state.doc.meta.timeSignature);
  const end = state.doc.notes.reduce((max, n) => Math.max(max, n.at + n.length), 0);
  return Math.max(0, Math.ceil(end / bar - 1e-6)) * bar;
}

/**
 * Escreve a nota ditada no editor, `origin` semínimas depois do começo da música: o mesmo insertNote do teclado (por
 * cima do que houver, e a nota de antes encurta). Nota fora do violino é recusada e o cursor fica onde estava.
 */
export function writeDictated(state: EditorState, origin: number, note: DictatedNote): EditorState {
  const next = insertNote({ ...state, cursor: tidy(origin + note.at) }, note.midi, note.length);
  return next.refusal ? { ...next, cursor: state.cursor } : next;
}
