import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LEVELS, parseSong, type Level, type Song, type TimeSignature } from '../game/notation/song';
import { ensureSession, type AuthClient, type SessionState } from './session';
import { songCache, type SavedSong, type SongCache } from './songCache';
import { supabase } from './supabase';

export type SongOrigin = 'catalog' | 'imported' | 'editor';

/** Ficha da música (violinhero.songs), sem as notas. */
export interface SongSheet {
  id: string;
  title: string;
  composer: string;
  bpm: number;
  timeSignature: TimeSignature;
  key: string;
  durationSeconds: number;
  origin: SongOrigin;
}

export interface CatalogEntry extends SongSheet {
  /** Níveis com chart gravado, na ordem fácil → difícil. */
  levels: Level[];
}

export interface LoadedSong {
  sheet: SongSheet;
  song: Song;
  /** Hash do chart no servidor: chave do cache offline. */
  hash: string;
}

export type SongErrorKind = 'offline' | 'not-found' | 'invalid' | 'server';

const MESSAGES: Record<SongErrorKind, string> = {
  offline: 'Sem conexão com o servidor. Confira a internet e tente de novo.',
  'not-found': 'Não encontramos essa música nesse nível.',
  invalid: 'A partitura dessa música chegou com problema e não dá para tocar.',
  server: 'Não foi possível carregar as músicas agora. Tente de novo em instantes.',
};

/** Erro com mensagem pronta para a tela; a causa original fica em `cause`. */
export class SongError extends Error {
  readonly kind: SongErrorKind;

  constructor(kind: SongErrorKind, cause?: unknown) {
    super(MESSAGES[kind], { cause });
    this.name = 'SongError';
    this.kind = kind;
  }
}

export type SongsClient = { auth: AuthClient; from: SupabaseClient['from']; rpc: SupabaseClient['rpc'] };

interface SheetRow {
  id: string;
  title: string;
  composer: string;
  bpm: number | string;
  time_beats: number;
  time_unit: number;
  key: string;
  duration_seconds: number | string;
  origin: SongOrigin;
}

interface CatalogRow extends SheetRow {
  song_charts: { level: Level }[] | null;
}

interface GetSongRow extends SheetRow {
  level: Level;
  format_version: number;
  chart: unknown;
  hash: string;
}

const SHEET_COLUMNS = 'id, title, composer, bpm, time_beats, time_unit, key, duration_seconds, origin';

// numeric chega como string pelo PostgREST
function toSheet(row: SheetRow): SongSheet {
  return {
    id: row.id,
    title: row.title,
    composer: row.composer,
    bpm: Number(row.bpm),
    timeSignature: { beats: row.time_beats, unit: row.time_unit as TimeSignature['unit'] },
    key: row.key,
    durationSeconds: Number(row.duration_seconds),
    origin: row.origin,
  };
}

/** Leitura no banco pede sessão (anônima basta): sem ela, o jogador está offline. */
function requireSession(client: SongsClient | null, session: SessionState): SongsClient {
  if (!client || session.status !== 'signed-in') throw new SongError('offline');
  return client;
}

/**
 * O catálogo na ordem da estante, com os níveis que cada música tem. Música do catálogo sem posição
 * saiu da estante: a linha fica para as partidas antigas, mas não é listada.
 */
export async function listCatalog(client: SongsClient | null, session: SessionState): Promise<CatalogEntry[]> {
  const db = requireSession(client, session);
  const { data, error } = await db
    .from('songs')
    .select(`${SHEET_COLUMNS}, song_charts(level)`)
    .eq('origin', 'catalog')
    .not('catalog_position', 'is', null)
    .order('catalog_position', { ascending: true });
  if (error) throw new SongError('server', error);
  return ((data ?? []) as CatalogRow[]).map((row) => {
    const levels = new Set((row.song_charts ?? []).map((c) => c.level));
    return { ...toSheet(row), levels: LEVELS.filter((l) => levels.has(l)) };
  });
}

/**
 * As músicas do jogador (importadas e do editor), da mais nova para a mais antiga. A RLS só devolve as dele: fora do
 * catálogo, toda música é privada do dono.
 */
export async function listOwnSongs(client: SongsClient | null, session: SessionState): Promise<CatalogEntry[]> {
  const db = requireSession(client, session);
  const { data, error } = await db
    .from('songs')
    .select(`${SHEET_COLUMNS}, song_charts(level)`)
    .neq('origin', 'catalog')
    .order('created_at', { ascending: false });
  if (error) throw new SongError('server', error);
  return ((data ?? []) as CatalogRow[]).map((row) => {
    const levels = new Set((row.song_charts ?? []).map((c) => c.level));
    return { ...toSheet(row), levels: LEVELS.filter((l) => levels.has(l)) };
  });
}

/** Ficha + chart de um nível por get_song, que aplica no servidor quem pode ler a música. */
export async function getSong(client: SongsClient | null, session: SessionState, id: string, level: Level): Promise<LoadedSong> {
  const db = requireSession(client, session);
  const { data, error } = await db.rpc('get_song', { p_song_id: id, p_level: level });
  if (error) throw new SongError('server', error);
  const row = (data as GetSongRow[] | null)?.[0];
  if (!row) throw new SongError('not-found');
  let song: Song;
  try {
    song = parseSong(row.chart);
  } catch (e) {
    throw new SongError('invalid', e);
  }
  return { sheet: toSheet(row), song, hash: row.hash };
}

/** O servidor não respondeu (sem internet, sem sessão, fora do ar): só nesses casos vale a cópia do aparelho. */
const unreachable = (error: unknown) => !(error instanceof SongError) || error.kind === 'offline' || error.kind === 'server';

/**
 * get_song com o cache do aparelho: com rede, guarda o que veio (o cache só regrava se o hash mudou); sem rede,
 * devolve a guardada. "Não existe" e "partitura com problema" vêm do servidor e valem: a guardada não os esconde.
 */
export async function loadSong(
  client: SongsClient | null,
  session: () => Promise<SessionState>,
  id: string,
  level: Level,
  cache: SongCache | null
): Promise<LoadedSong & { saved: 'saved' | 'unchanged' | 'device' | null }> {
  let loaded: LoadedSong;
  try {
    loaded = await getSong(client, await session(), id, level);
  } catch (error) {
    const kept = unreachable(error) ? await cache?.find(id, level).catch(() => undefined) : undefined;
    if (kept) return { ...kept, saved: 'device' };
    throw error;
  }
  // Sem espaço ou sem IndexedDB: toca do mesmo jeito, só não fica para depois
  const saved = (await cache?.remember(loaded, level).catch(() => null)) ?? null;
  return { ...loaded, saved };
}

export const songKeys = {
  catalog: ['songs', 'catalog'] as const,
  mine: ['songs', 'mine'] as const,
  song: (id: string, level: Level) => ['songs', 'song', id, level] as const,
  saved: ['songs', 'saved'] as const,
};

/** A sessão é a mesma do SessionStatus (query ['session']): dois logins anônimos ao mesmo tempo criariam dois usuários. */
function useSession(client: SongsClient | null) {
  const queryClient = useQueryClient();
  return () => queryClient.fetchQuery({ queryKey: ['session'], queryFn: () => ensureSession(client), staleTime: Infinity });
}

// Só erro de servidor merece nova tentativa; offline vem da sessão em cache e não muda sozinho
const retryUnlessFinal = (count: number, error: Error) => count < 2 && !(error instanceof SongError && error.kind !== 'server');

export function useCatalog(client: SongsClient | null = supabase) {
  const session = useSession(client);
  return useQuery({
    queryKey: songKeys.catalog,
    queryFn: async () => listCatalog(client, await session()),
    staleTime: 5 * 60_000,
    retry: retryUnlessFinal,
  });
}

/** A estante do dono (importadas e do editor); quem grava (songImport.ts) invalida songKeys.mine. */
export function useOwnSongs(client: SongsClient | null = supabase) {
  const session = useSession(client);
  return useQuery({
    queryKey: songKeys.mine,
    queryFn: async () => listOwnSongs(client, await session()),
    staleTime: 5 * 60_000,
    retry: retryUnlessFinal,
  });
}

export function useSong(id: string, level: Level, client: SongsClient | null = supabase, cache: SongCache | null = songCache) {
  const session = useSession(client);
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: songKeys.song(id, level),
    queryFn: async () => {
      const loaded = await loadSong(client, session, id, level, cache);
      if (loaded.saved === 'saved') void queryClient.invalidateQueries({ queryKey: songKeys.saved });
      return loaded;
    },
    staleTime: Infinity,
    retry: retryUnlessFinal,
  });
}

/** As músicas guardadas no aparelho (tocam sem internet); sem cache ou com erro de leitura, nenhuma. */
export function useSavedSongs(cache: SongCache | null = songCache) {
  return useQuery({
    queryKey: songKeys.saved,
    queryFn: async (): Promise<SavedSong[]> => (cache ? cache.list().catch(() => []) : []),
    staleTime: Infinity,
  });
}
