import type { GameResult } from '../game/engine';
import type { Song } from '../game/notation/song';
import { FIXED_SONGS } from '../game/notation/songs';
import type { PracticeStart } from './gameSession';
import { ROUTES } from './routes';

export const GAME_MODES = ['Arcade', 'Partitura', 'Prática'] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** O que viaja pela navegação da calibração até o resultado. */
export interface PlayState {
  song?: Song;
  mode?: GameMode;
  /** Latência descontada, em ms (só para mostrar; o motor lê a do aparelho). */
  latencyMs?: number;
  /** "Tocar sem falha": a música não para. */
  noFail?: boolean;
  /** Só no modo Prática; sem ele, do compasso 0, sem laço, a 70%. */
  practice?: PracticeStart;
}

export interface ResultState extends PlayState {
  result: GameResult;
}

export const DEFAULT_MODE: GameMode = 'Arcade';

const MODE_ROUTE: Record<GameMode, string> = { Arcade: ROUTES.game, Partitura: ROUTES.sheet, Prática: ROUTES.practice };

/** Tela da partida de cada modo: para onde a contagem leva. */
export function gameRoute(mode: GameMode | undefined): string {
  return MODE_ROUTE[mode ?? DEFAULT_MODE];
}

const isGameMode = (value: unknown): value is GameMode => GAME_MODES.includes(value as GameMode);

/** Estado da navegação com padrões: sem música escolhida, a primeira das fixas; modo desconhecido vira Arcade. */
export function readPlayState(raw: unknown): Required<Pick<PlayState, 'song' | 'mode'>> & PlayState {
  const state = (raw && typeof raw === 'object' ? raw : {}) as PlayState;
  return { ...state, song: state.song ?? FIXED_SONGS[0].song, mode: isGameMode(state.mode) ? state.mode : DEFAULT_MODE };
}

export function readResultState(raw: unknown): (ReturnType<typeof readPlayState> & { result: GameResult }) | null {
  const state = raw && typeof raw === 'object' ? (raw as Partial<ResultState>) : null;
  return state?.result ? { ...readPlayState(state), result: state.result } : null;
}
