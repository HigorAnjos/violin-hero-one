import type { GameResult } from '../game/engine';
import type { Song } from '../game/notation/song';
import { FIXED_SONGS } from '../game/notation/songs';

/** O que viaja pela navegação da calibração até o resultado. */
export interface PlayState {
  song?: Song;
  /** Modo de jogo, ex.: "Arcade". */
  mode?: string;
  /** Latência descontada, em ms (só para mostrar; o motor lê a do aparelho). */
  latencyMs?: number;
  /** "Tocar sem falha": a música não para. */
  noFail?: boolean;
}

export interface ResultState extends PlayState {
  result: GameResult;
}

export const DEFAULT_MODE = 'Arcade';

/** Estado da navegação com padrões: sem música escolhida, a primeira das fixas. */
export function readPlayState(raw: unknown): Required<Pick<PlayState, 'song' | 'mode'>> & PlayState {
  const state = (raw && typeof raw === 'object' ? raw : {}) as PlayState;
  return { ...state, song: state.song ?? FIXED_SONGS[0].song, mode: state.mode ?? DEFAULT_MODE };
}

export function readResultState(raw: unknown): (ReturnType<typeof readPlayState> & { result: GameResult }) | null {
  const state = raw && typeof raw === 'object' ? (raw as Partial<ResultState>) : null;
  return state?.result ? { ...readPlayState(state), result: state.result } : null;
}
