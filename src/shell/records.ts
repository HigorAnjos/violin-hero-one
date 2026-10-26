import type { GameResult, PracticeResult } from '../game/engine';
import type { Level, Song } from '../game/notation/song';

export const RECORDS_STORAGE_KEY = 'vh:recordes';

/** O recorde antes desta partida e se ela o bateu. */
export interface RecordCheck {
  previous: number | null;
  improved: boolean;
}

const keyOf = (songId: string, level: Level) => `${songId}:${level}`;

function load(): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(RECORDS_STORAGE_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])));
  } catch {
    return {};
  }
}

/** Recorde local por música e nível do chart; o servidor assume no ciclo 3. */
export function loadRecord(songId: string, level: Level): number | null {
  return load()[keyOf(songId, level)] ?? null;
}

export interface RecordEntry {
  songId: string;
  level: Level;
  score: number;
}

const LEVELS: readonly Level[] = ['easy', 'medium', 'hard'];

/** Todos os recordes do aparelho, do maior para o menor; chave com nível desconhecido fica de fora. */
export function loadRecords(): RecordEntry[] {
  return Object.entries(load())
    .map(([key, score]) => {
      const cut = key.lastIndexOf(':');
      return { songId: key.slice(0, cut), level: key.slice(cut + 1) as Level, score };
    })
    .filter((r) => r.songId && LEVELS.includes(r.level))
    .sort((a, b) => b.score - a.score);
}

/** Só partida inteira a 100%, sem laço e que chegou ao fim conta para recorde (a prática, não). */
export function countsForRecord(result: GameResult | PracticeResult): boolean {
  return result.status === 'finished' && !('laps' in result);
}

/** Confere e, se bateu, guarda. Devolve null quando a partida não vale recorde. */
export function checkRecord(song: Pick<Song, 'id' | 'level'>, result: GameResult): RecordCheck | null {
  if (!countsForRecord(result)) return null;
  const previous = loadRecord(song.id, song.level);
  const improved = previous === null || result.score > previous;
  if (improved) {
    try {
      window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ ...load(), [keyOf(song.id, song.level)]: result.score }));
    } catch {
      // sem armazenamento: o recorde vale só para esta tela
    }
  }
  return { previous, improved };
}
