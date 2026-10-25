// Modelo Song: o formato que o conversor grava em song_charts (jsonb) e que o motor, a pista e a
// partitura leem. Só muda com registro na nota Decisões e com SONG_FORMAT_VERSION novo.
import { HIGHEST_MIDI, LOWEST_MIDI, OPEN_STRING_MIDI, stringFits, type StringIndex } from './violin';

export const SONG_FORMAT_VERSION = 1;

export type Level = 'easy' | 'medium' | 'hard';
export const LEVELS: readonly Level[] = ['easy', 'medium', 'hard'];

/** 0 = corda solta; 1 a 4 = indicador a mínimo. */
export type Finger = 0 | 1 | 2 | 3 | 4;

/** Fórmula de compasso. `unit` é a figura que vale um tempo (4 = semínima). */
export interface TimeSignature {
  beats: number;
  unit: 2 | 4 | 8;
}

/** Uma nota dentro do compasso. Silêncio é o intervalo entre notas. */
export interface SongNote {
  /** Início, em tempos desde o começo do compasso. */
  beat: number;
  /** Duração, em tempos. */
  beats: number;
  midi: number;
  string: StringIndex;
  finger: Finger;
  /** Ligada à nota anterior: continua o som, sem novo ataque (não é julgada de novo). */
  tie?: boolean;
}

export interface Measure {
  /** Tempos deste compasso: a fórmula do compasso, ou menos na anacruse e no último. */
  beats: number;
  notes: SongNote[];
}

export interface Song {
  formatVersion: typeof SONG_FORMAT_VERSION;
  id: string;
  title: string;
  composer: string;
  /** Tonalidade, ex.: "D major". */
  key: string;
  /** Tempos (da unidade do compasso) por minuto. */
  bpm: number;
  timeSignature: TimeSignature;
  level: Level;
  measures: Measure[];
}

/** Nota com o tempo absoluto, desde o primeiro tempo da música: o que o motor e a pista consomem. */
export interface TimelineNote extends SongNote {
  /** Índice do compasso, a partir de 0. */
  measure: number;
  /** Índice da nota na música inteira. */
  index: number;
  /** Início, em tempos desde o começo da música. */
  at: number;
}

const EPSILON = 1e-9;

export function secondsPerBeat(song: Pick<Song, 'bpm'>): number {
  return 60 / song.bpm;
}

export function songDurationBeats(song: Song): number {
  return song.measures.reduce((total, m) => total + m.beats, 0);
}

export function songDurationSeconds(song: Song): number {
  return songDurationBeats(song) * secondsPerBeat(song);
}

/** Todas as notas em ordem, com o tempo absoluto. */
export function timeline(song: Song): TimelineNote[] {
  const notes: TimelineNote[] = [];
  let start = 0;
  song.measures.forEach((m, measure) => {
    for (const note of m.notes) notes.push({ ...note, measure, index: notes.length, at: start + note.beat });
    start += m.beats;
  });
  return notes;
}

/** Notas que pedem ataque (as ligadas continuam a anterior e não contam para o julgamento). */
export function attacks(song: Song): TimelineNote[] {
  return timeline(song).filter((n) => !n.tie);
}

/** Todo problema encontrado na música; vazio quando ela é jogável. */
export function songProblems(song: Song): string[] {
  const problems: string[] = [];
  if (song.formatVersion !== SONG_FORMAT_VERSION) problems.push(`formato ${song.formatVersion} desconhecido`);
  if (!song.id) problems.push('id vazio');
  if (!song.title) problems.push('título vazio');
  if (!(song.bpm > 0) || !Number.isFinite(song.bpm)) problems.push(`bpm inválido: ${song.bpm}`);
  if (!LEVELS.includes(song.level)) problems.push(`nível inválido: ${song.level}`);
  const ts = song.timeSignature;
  if (!ts || !Number.isInteger(ts.beats) || ts.beats <= 0 || ![2, 4, 8].includes(ts.unit)) {
    problems.push(`compasso inválido: ${JSON.stringify(ts)}`);
  }
  if (song.measures.length === 0) problems.push('música sem compassos');

  let previous: TimelineNote | null = null;
  let start = 0;
  song.measures.forEach((m, mi) => {
    const where = `compasso ${mi + 1}`;
    if (!(m.beats > 0) || (ts && m.beats > ts.beats + EPSILON)) problems.push(`${where}: duração inválida ${m.beats}`);
    m.notes.forEach((note, ni) => {
      const at = `${where}, nota ${ni + 1}`;
      if (!Number.isFinite(note.beat) || note.beat < 0) problems.push(`${at}: início inválido ${note.beat}`);
      if (!(note.beats > 0)) problems.push(`${at}: duração inválida ${note.beats}`);
      if (note.beat + note.beats > m.beats + EPSILON) problems.push(`${at}: passa do fim do compasso`);
      if (previous && start + note.beat < previous.at + previous.beats - EPSILON) {
        problems.push(`${at}: começa antes da anterior terminar`);
      }
      if (!Number.isInteger(note.midi) || note.midi < LOWEST_MIDI || note.midi > HIGHEST_MIDI) {
        problems.push(`${at}: midi ${note.midi} fora do violino até a 3ª posição`);
      }
      if (![0, 1, 2, 3].includes(note.string)) problems.push(`${at}: corda inválida ${note.string}`);
      else if (!stringFits(note.midi, note.string)) problems.push(`${at}: midi ${note.midi} não cabe na corda ${note.string}`);
      else if ((note.finger === 0) !== (note.midi === OPEN_STRING_MIDI[note.string])) {
        problems.push(`${at}: dedo ${note.finger} não combina com a corda solta`);
      }
      if (![0, 1, 2, 3, 4].includes(note.finger)) problems.push(`${at}: dedo inválido ${note.finger}`);
      if (note.tie) {
        const continues =
          previous &&
          previous.midi === note.midi &&
          previous.string === note.string &&
          Math.abs(previous.at + previous.beats - (start + note.beat)) < EPSILON;
        if (!continues) problems.push(`${at}: ligadura sem nota igual colada antes`);
      }
      previous = { ...note, measure: mi, index: 0, at: start + note.beat };
    });
    start += m.beats;
  });
  if (song.measures.every((m) => m.notes.length === 0)) problems.push('música sem notas');
  return problems;
}

function parseNote(raw: unknown): SongNote {
  const n = (raw ?? {}) as Partial<SongNote>;
  const note: SongNote = {
    beat: Number(n.beat),
    beats: Number(n.beats),
    midi: Number(n.midi),
    string: Number(n.string) as StringIndex,
    finger: Number(n.finger) as Finger,
  };
  if (n.tie === true) note.tie = true;
  return note;
}

/** Valida JSON de fora (banco, IndexedDB, arquivo) e devolve a Song, ou lança com todos os problemas. */
export function parseSong(json: unknown): Song {
  const v = json as Partial<Song> | null;
  if (!v || typeof v !== 'object' || !Array.isArray(v.measures)) {
    throw new TypeError('a música precisa ser um objeto com a lista de compassos');
  }
  const ts = (v.timeSignature ?? {}) as Partial<TimeSignature>;
  const song: Song = {
    formatVersion: Number(v.formatVersion) as typeof SONG_FORMAT_VERSION,
    id: String(v.id ?? ''),
    title: String(v.title ?? ''),
    composer: String(v.composer ?? ''),
    key: String(v.key ?? ''),
    bpm: Number(v.bpm),
    timeSignature: { beats: Number(ts.beats), unit: Number(ts.unit) as TimeSignature['unit'] },
    level: String(v.level ?? '') as Level,
    measures: v.measures.map((m: Partial<Measure>) => ({
      beats: Number(m?.beats),
      notes: Array.isArray(m?.notes) ? m.notes.map(parseNote) : [],
    })),
  };
  const problems = songProblems(song);
  if (problems.length) throw new RangeError(`música "${song.id}" inválida: ${problems.join('; ')}`);
  return song;
}
