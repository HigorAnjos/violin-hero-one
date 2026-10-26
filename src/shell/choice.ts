import { LEVELS, type Level } from '../game/notation/song';
import { GAME_MODES, type GameMode } from './play';
import { ROUTES } from './routes';

/** Modo, música e nível ficam na URL: recarregar ou voltar não perde a escolha. */
const MODE_SLUG: Record<GameMode, string> = { Arcade: 'arcade', Partitura: 'partitura', Prática: 'pratica' };
const LEVEL_SLUG: Record<Level, string> = { easy: 'facil', medium: 'medio', hard: 'dificil' };

/** Modos com tela registrada no AppRouter: o teste do AppRouter confere que toda rota daqui existe. */
export const READY_MODES: readonly GameMode[] = ['Arcade', 'Partitura', 'Prática'];

export const isReadyMode = (mode: GameMode) => READY_MODES.includes(mode);

/** Modo pedido pela URL que ainda não tem tela vira Arcade. */
export const readyMode = (mode: GameMode | null): GameMode => (mode && isReadyMode(mode) ? mode : 'Arcade');

export function modeFromSlug(slug: string | null): GameMode | null {
  return GAME_MODES.find((mode) => MODE_SLUG[mode] === slug) ?? null;
}

export function levelFromSlug(slug: string | null): Level | null {
  return LEVELS.find((level) => LEVEL_SLUG[level] === slug) ?? null;
}

export function modesUrl(mode?: GameMode): string {
  return mode ? `${ROUTES.modes}?modo=${MODE_SLUG[mode]}` : ROUTES.modes;
}

export function songsUrl(mode: GameMode, songId?: string): string {
  const params = new URLSearchParams({ modo: MODE_SLUG[mode] });
  if (songId) params.set('musica', songId);
  return `${ROUTES.songs}?${params}`;
}

export interface SongChoice {
  mode: GameMode;
  songId: string;
  level: Level;
}

export function loadingUrl({ mode, songId, level }: SongChoice): string {
  return `${ROUTES.loading}?${new URLSearchParams({ modo: MODE_SLUG[mode], musica: songId, nivel: LEVEL_SLUG[level] })}`;
}

/** Escolha completa da URL do carregando; faltando a música, nula. Modo sem tela e nível desconhecido viram Arcade e Fácil. */
export function parseSongChoice(search: URLSearchParams): SongChoice | null {
  const songId = search.get('musica');
  if (!songId) return null;
  return { songId, mode: readyMode(modeFromSlug(search.get('modo'))), level: levelFromSlug(search.get('nivel')) ?? 'easy' };
}
