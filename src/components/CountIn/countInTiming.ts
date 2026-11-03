import { attacks, secondsPerBeat, type Level, type Song } from '../../game/notation/song';
import { STRING_SOLFEGE } from '../../game/notation/violin';

const NOTE_NAMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];
const FINGERS = ['', 'indicador', 'médio', 'anelar', 'mínimo'];

export const LEVEL_NAMES: Record<Level, string> = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };

/** "Ré4": nome em português e oitava científica (Dó4 = dó central). */
export function noteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export interface CountInView {
  /** Tempos do compasso de entrada. */
  total: number;
  /** Tempo atual, de 1 a `total`; `total + 1` quando acabou. */
  beat: number;
  /** Número grande na tela: quantos tempos faltam, contando o atual. */
  remaining: number;
  done: boolean;
}

/** Contagem de um compasso de entrada, no andamento e na fórmula da música. */
export function countInView(song: Pick<Song, 'bpm' | 'timeSignature'>, elapsedSeconds: number): CountInView {
  const total = song.timeSignature.beats;
  const beat = Math.min(total + 1, Math.floor(Math.max(0, elapsedSeconds) / secondsPerBeat(song)) + 1);
  return { total, beat, remaining: Math.max(0, total - beat + 1), done: beat > total };
}

export interface FirstNote {
  name: string;
  /** "corda Ré solta", "corda Lá, dedo médio". */
  where: string;
  string: number;
}

export function firstNote(song: Song): FirstNote | null {
  const note = attacks(song)[0];
  if (!note) return null;
  const string = `corda ${STRING_SOLFEGE[note.string]}`;
  return { name: noteName(note.midi), where: note.finger === 0 ? `${string} solta` : `${string}, dedo ${FINGERS[note.finger]}`, string: note.string };
}
