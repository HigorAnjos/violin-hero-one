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
