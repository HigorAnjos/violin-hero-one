import { LEVELS, type Level } from '../game/notation/song';
import { DEFAULT_MODE, GAME_MODES, type GameMode } from './play';
import { ROUTES } from './routes';

/** Modo, música e nível ficam na URL: recarregar ou voltar não perde a escolha. */
const MODE_SLUG: Record<GameMode, string> = { Arcade: 'arcade', Partitura: 'partitura', Prática: 'pratica', 'Cordas 3D': 'cordas-3d' };
const LEVEL_SLUG: Record<Level, string> = { easy: 'facil', medium: 'medio', hard: 'dificil' };

/** Modos com tela registrada no AppRouter: o teste do AppRouter confere que toda rota daqui existe. */
export const READY_MODES: readonly GameMode[] = ['Arcade', 'Partitura', 'Prática', 'Cordas 3D'];

export const isReadyMode = (mode: GameMode) => READY_MODES.includes(mode);

/** Modo pedido pela URL que ainda não tem tela vira o padrão. */
export const readyMode = (mode: GameMode | null): GameMode => (mode && isReadyMode(mode) ? mode : DEFAULT_MODE);

/** Modo marcado nas telas de escolha: Prática não é cartão e vira o padrão. */
export const menuMode = (mode: GameMode | null): GameMode => (mode === 'Prática' ? DEFAULT_MODE : readyMode(mode));

export function modeFromSlug(slug: string | null): GameMode | null {
  return GAME_MODES.find((mode) => MODE_SLUG[mode] === slug) ?? null;
}

export function levelFromSlug(slug: string | null): Level | null {
  return LEVELS.find((level) => LEVEL_SLUG[level] === slug) ?? null;
}

/** O que o endereço do ranking escolhe; o que faltar, a tela escolhe (a última partida jogada, a semana). */
export interface RankingChoice {
  songId?: string;
  level?: Level;
  period?: 'week' | 'all';
}

const PERIOD_SLUG = { week: 'semana', all: 'geral' } as const;

export function rankingUrl({ songId, level, period }: RankingChoice = {}): string {
  const params = new URLSearchParams();
  if (songId) params.set('musica', songId);
  if (level) params.set('nivel', LEVEL_SLUG[level]);
  if (period) params.set('periodo', PERIOD_SLUG[period]);
  const query = params.toString();
  return query ? `${ROUTES.ranking}?${query}` : ROUTES.ranking;
}

export function parseRankingUrl(search: URLSearchParams): RankingChoice {
  const songId = search.get('musica') || undefined;
  const level = levelFromSlug(search.get('nivel')) ?? undefined;
  const slug = search.get('periodo');
  const period = (Object.keys(PERIOD_SLUG) as (keyof typeof PERIOD_SLUG)[]).find((p) => PERIOD_SLUG[p] === slug);
  return { ...(songId && { songId }), ...(level && { level }), ...(period && { period }) };
}

/** Montar um desafio; `playId` é a partida (que vale ranking) que a tela já deixa escolhida. */
export function newChallengeUrl(playId?: string): string {
  return playId ? `${ROUTES.challenge}?${new URLSearchParams({ partida: playId })}` : ROUTES.challenge;
}

/** O link de um desafio, dentro do app. */
export function challengeUrl(code: string): string {
  return `${ROUTES.challenge}/${encodeURIComponent(code)}`;
}

/** O mesmo link, completo, para mandar para fora (WhatsApp, cartão). */
export function challengeLink(code: string, origin: string = window.location.origin): string {
  return `${origin}${challengeUrl(code)}`;
}

/** Escolha de modo; `songId` vem de quem já escolheu a música (Biblioteca) e segue para a seleção. */
export function modesUrl(mode?: GameMode, songId?: string): string {
  const params = new URLSearchParams();
  if (mode) params.set('modo', MODE_SLUG[mode]);
  if (songId) params.set('musica', songId);
  const query = params.toString();
  return query ? `${ROUTES.modes}?${query}` : ROUTES.modes;
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
