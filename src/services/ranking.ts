import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LEVELS, type Level } from '../game/notation/song';
import { progressKeys, ProgressError, type ProgressClient, type ProgressErrorKind } from './progress';
import { ensureSession, type SessionState } from './session';
import { supabase } from './supabase';

/** Mesmos valores que violinhero.get_ranking aceita: a semana (de segunda, em Brasília) ou desde sempre. */
export type RankingPeriod = 'week' | 'all';

/** Uma linha do ranking: só o que o servidor deixa sair (nada de id, e-mail nem apelido digitado). */
export interface RankingRow {
  rank: number;
  /** Bicho + número (ranking_name); nunca o apelido livre. */
  name: string;
  points: number;
  accuracy: number;
  me: boolean;
}

export interface Ranking {
  rows: RankingRow[];
  /** Jogador sem conta: vê a lista, mas não entra nela até criar a conta. */
  anonymous: boolean;
}

export interface RankingQuery {
  songId: string;
  level: Level;
  period: RankingPeriod;
}

/** Quantas linhas a tela pede; a do jogador vem a mais quando ele está fora delas. */
export const RANKING_LIMIT = 20;

/** Códigos do get_ranking (0007_ranking.sql); sem código, a requisição nem chegou ao banco. */
function errorKind(error: { code?: string }): ProgressErrorKind {
  if (error.code === 'P0002') return 'not-found';
  if (error.code === '42501' || !error.code) return 'offline';
  return 'server';
}

function requireSession(client: ProgressClient | null, session: SessionState): ProgressClient {
  if (!client || session.status !== 'signed-in') throw new ProgressError('offline');
  return client;
}

interface RankingDbRow {
  rank: number;
  ranking_name: string;
  points: number;
  accuracy: number | string;
  is_me: boolean;
}

export async function getRanking(client: ProgressClient | null, session: SessionState, { songId, level, period }: RankingQuery): Promise<Ranking> {
  const db = requireSession(client, session);
  const { data, error } = await db.rpc('get_ranking', { p_song_id: songId, p_level: level, p_period: period, p_limit: RANKING_LIMIT });
  if (error) throw new ProgressError(errorKind(error), error);
  const rows = ((data ?? []) as RankingDbRow[]).map((r) => ({
    rank: r.rank,
    name: r.ranking_name,
    points: r.points,
    accuracy: Number(r.accuracy),
    me: r.is_me,
  }));
  return { rows, anonymous: session.status === 'signed-in' && session.anonymous };
}

/** A última partida que vale ranking (a RLS só devolve as do jogador): a música e o nível que a tela abre. */
export async function lastRankedPlay(client: ProgressClient | null, session: SessionState): Promise<{ songId: string; level: Level } | null> {
  const db = requireSession(client, session);
  const { data, error } = await db
    .from('plays')
    .select('song_id, level')
    .eq('counts_for_record', true)
    .order('played_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ProgressError(errorKind(error), error);
  const row = data as { song_id: string; level: string } | null;
  const level = LEVELS.find((l) => l === row?.level);
  return row && level ? { songId: row.song_id, level } : null;
}

/** Debaixo de progressKeys.all: partida enviada (useSubmitPlay) e troca de conta refazem o ranking junto. */
export const rankingKeys = {
  all: [...progressKeys.all, 'ranking'] as const,
  list: (q: RankingQuery) => [...progressKeys.all, 'ranking', q.songId, q.level, q.period] as const,
  last: [...progressKeys.all, 'ranking', 'last'] as const,
};

const retryServer = (count: number, error: Error) => count < 2 && error instanceof ProgressError && error.kind === 'server';

function useSessionFetch(client: ProgressClient | null) {
  const queryClient = useQueryClient();
  return () => queryClient.fetchQuery({ queryKey: ['session'], queryFn: () => ensureSession(client), staleTime: Infinity });
}

/** O ranking pedido; `query` nulo enquanto a tela não sabe a música (espera a última partida). */
export function useRanking(query: RankingQuery | null, client: ProgressClient | null = supabase) {
  const session = useSessionFetch(client);
  return useQuery({
    queryKey: query ? rankingKeys.list(query) : rankingKeys.all,
    queryFn: async () => getRanking(client, await session(), query!),
    enabled: query !== null,
    retry: retryServer,
    // Sem rede a sessão cai para Offline e o erro sai na hora: pausar a query deixaria a tela carregando para sempre
    networkMode: 'always',
  });
}

export function useLastRankedPlay(client: ProgressClient | null = supabase) {
  const session = useSessionFetch(client);
  return useQuery({
    queryKey: rankingKeys.last,
    queryFn: async () => lastRankedPlay(client, await session()),
    retry: false,
    networkMode: 'always',
  });
}
