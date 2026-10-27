import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LEVELS, type Level } from '../game/notation/song';
import { progressKeys, type ProgressClient } from './progress';
import { ensureSession, type SessionState } from './session';
import { supabase } from './supabase';

/** Prazos que a tela oferece; o servidor aceita de 1 a 7 dias (create_challenge). */
export const DEADLINE_DAYS = [1, 2, 3, 7] as const;
export type DeadlineDays = (typeof DEADLINE_DAYS)[number];

/** Quem está vendo o desafio: quem criou, quem aceitou ou quem só abriu o link. */
export type ChallengeRole = 'creator' | 'entrant' | 'visitor';

/** Do lado de quem aceitou: 'won' assim que passa os pontos; 'tie' e 'lost' só no fim do prazo. */
export type ChallengeResult = 'won' | 'tie' | 'lost';

export interface ChallengeEntry {
  /** Nome gerado (bicho + número); nunca o apelido digitado nem o e-mail. */
  name: string;
  me: boolean;
  acceptedAt: string;
  /** Melhor pontuação que conta (música e nível do desafio, dentro do prazo); null sem partida. */
  bestScore: number | null;
  /** null enquanto pode mudar. */
  result: ChallengeResult | null;
}

/** O que get_challenge devolve: o público (música, nível, pontos, prazo, nome) e, para as partes, quem aceitou. */
export interface Challenge {
  code: string;
  songId: string;
  songTitle: string;
  level: Level;
  targetScore: number;
  expiresAt: string;
  closed: boolean;
  challengerName: string;
  role: ChallengeRole;
  /** Só para as partes: o desafiante vê todos que aceitaram; quem aceitou, só a própria linha. */
  entries: ChallengeEntry[] | null;
}

/** Uma partida do jogador que pode virar desafio: o recorde dele numa música e nível. */
export interface ChallengeablePlay {
  playId: string;
  songId: string;
  level: Level;
  score: number;
}

export type ChallengeErrorKind = 'offline' | 'needs-account' | 'not-found' | 'refused' | 'server';

const MESSAGES: Record<ChallengeErrorKind, string> = {
  offline: 'Sem conexão. Desafios precisam de internet.',
  'needs-account': 'Desafios precisam de uma conta.',
  'not-found': 'Não encontramos esse desafio.',
  refused: 'Esse desafio não pode ser feito agora.',
  server: 'Não foi possível falar com o servidor agora. Tente de novo em instantes.',
};

export class ChallengeError extends Error {
  readonly kind: ChallengeErrorKind;

  constructor(kind: ChallengeErrorKind, cause?: unknown) {
    super(MESSAGES[kind], { cause });
    this.name = 'ChallengeError';
    this.kind = kind;
  }
}

/** Códigos de 0008_challenges.sql; sem código, a requisição nem chegou ao banco. */
function errorKind(error: { code?: string }): ChallengeErrorKind {
  if (error.code === '28000') return 'needs-account';
  if (error.code === 'P0002') return 'not-found';
  if (error.code === '22023') return 'refused';
  if (error.code === '42501' || !error.code) return 'offline';
  return 'server';
}

function requireSession(client: ProgressClient | null, session: SessionState): ProgressClient {
  if (!client || session.status !== 'signed-in') throw new ChallengeError('offline');
  return client;
}

/** Desafio pede conta: o anônimo nem chama o servidor (que recusaria igual). */
function requireAccount(client: ProgressClient | null, session: SessionState): ProgressClient {
  const db = requireSession(client, session);
  if (session.status === 'signed-in' && session.anonymous) throw new ChallengeError('needs-account');
  return db;
}

interface ChallengeRow {
  code: string;
  song_id: string;
  song_title: string;
  level: string;
  target_score: number;
  expires_at: string;
  closed: boolean;
  challenger_name: string;
  role: ChallengeRole;
  entries: { name: string; is_me: boolean; accepted_at: string; best_score: number | null; result: ChallengeResult | null }[] | null;
}

const levelOf = (raw: string): Level => LEVELS.find((l) => l === raw) ?? 'easy';

export function toChallenge(row: ChallengeRow): Challenge {
  return {
    code: row.code,
    songId: row.song_id,
    songTitle: row.song_title,
    level: levelOf(row.level),
    targetScore: row.target_score,
    expiresAt: row.expires_at,
    closed: row.closed,
    challengerName: row.challenger_name,
    role: row.role,
    entries:
      row.entries?.map((e) => ({ name: e.name, me: e.is_me, acceptedAt: e.accepted_at, bestScore: e.best_score, result: e.result })) ?? null,
  };
}

async function call<T>(db: ProgressClient, fn: string, args: Record<string, unknown> | undefined, map: (data: unknown) => T): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new ChallengeError(errorKind(error), error);
  return map(data);
}

export async function createChallenge(client: ProgressClient | null, session: SessionState, playId: string, days: DeadlineDays): Promise<Challenge> {
  return call(requireAccount(client, session), 'create_challenge', { p_play_id: playId, p_days: days }, (d) => toChallenge(d as ChallengeRow));
}

/** Qualquer sessão lê pelo código (anônima inclusive). */
export async function getChallenge(client: ProgressClient | null, session: SessionState, code: string): Promise<Challenge> {
  return call(requireSession(client, session), 'get_challenge', { p_code: code }, (d) => toChallenge(d as ChallengeRow));
}

export async function acceptChallenge(client: ProgressClient | null, session: SessionState, code: string): Promise<Challenge> {
  return call(requireAccount(client, session), 'accept_challenge', { p_code: code }, (d) => toChallenge(d as ChallengeRow));
}

export async function listMyChallenges(client: ProgressClient | null, session: SessionState): Promise<Challenge[]> {
  return call(requireSession(client, session), 'list_my_challenges', undefined, (d) => ((d ?? []) as ChallengeRow[]).map(toChallenge));
}

/** Os recordes do jogador (a RLS só devolve os dele), do mais novo ao mais antigo: cada um aponta a partida dele. */
export async function listChallengeablePlays(client: ProgressClient | null, session: SessionState): Promise<ChallengeablePlay[]> {
  const db = requireSession(client, session);
  const { data, error } = await db.from('records').select('song_id, level, score, play_id').order('updated_at', { ascending: false });
  if (error) throw new ChallengeError(errorKind(error), error);
  return ((data ?? []) as { song_id: string; level: string; score: number; play_id: string }[]).map((r) => ({
    playId: r.play_id,
    songId: r.song_id,
    level: levelOf(r.level),
    score: r.score,
  }));
}

/** Debaixo de progressKeys.all: partida enviada e troca de conta refazem os desafios junto. */
export const challengeKeys = {
  all: [...progressKeys.all, 'challenges'] as const,
  one: (code: string) => [...progressKeys.all, 'challenges', 'code', code] as const,
  mine: [...progressKeys.all, 'challenges', 'mine'] as const,
  plays: [...progressKeys.all, 'challenges', 'plays'] as const,
};

const retryServer = (count: number, error: Error) => count < 2 && error instanceof ChallengeError && error.kind === 'server';

function useSessionFetch(client: ProgressClient | null) {
  const queryClient = useQueryClient();
  return () => queryClient.fetchQuery({ queryKey: ['session'], queryFn: () => ensureSession(client), staleTime: Infinity });
}

// Sem rede a sessão cai para Offline e o erro sai na hora: pausar a query deixaria a tela carregando para sempre
const ALWAYS = { networkMode: 'always' } as const;

export function useChallenge(code: string, client: ProgressClient | null = supabase) {
  const session = useSessionFetch(client);
  return useQuery({ queryKey: challengeKeys.one(code), queryFn: async () => getChallenge(client, await session(), code), retry: retryServer, ...ALWAYS });
}

export function useMyChallenges(client: ProgressClient | null = supabase) {
  const session = useSessionFetch(client);
  return useQuery({ queryKey: challengeKeys.mine, queryFn: async () => listMyChallenges(client, await session()), retry: retryServer, ...ALWAYS });
}

export function useChallengeablePlays(client: ProgressClient | null = supabase) {
  const session = useSessionFetch(client);
  return useQuery({ queryKey: challengeKeys.plays, queryFn: async () => listChallengeablePlays(client, await session()), retry: retryServer, ...ALWAYS });
}

export function useCreateChallenge(client: ProgressClient | null = supabase) {
  const session = useSessionFetch(client);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ playId, days }: { playId: string; days: DeadlineDays }) => createChallenge(client, await session(), playId, days),
    onSuccess: (challenge) => {
      queryClient.setQueryData(challengeKeys.one(challenge.code), challenge);
      void queryClient.invalidateQueries({ queryKey: challengeKeys.mine });
    },
  });
}

export function useAcceptChallenge(client: ProgressClient | null = supabase) {
  const session = useSessionFetch(client);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => acceptChallenge(client, await session(), code),
    onSuccess: (challenge) => {
      queryClient.setQueryData(challengeKeys.one(challenge.code), challenge);
      void queryClient.invalidateQueries({ queryKey: challengeKeys.mine });
    },
  });
}
