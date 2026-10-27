import type { SupabaseClient } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BADGES, type BadgeId, type GameResult, type Judgment, type PracticeResult } from '../game/engine';
import type { Level, Song } from '../game/notation/song';
import { addEarnedBadges } from './badges';
import { ensureSession, type AuthClient, type SessionState } from './session';
import { supabase } from './supabase';
import { currentUserId } from './user';

/** Mesmos valores do enum violinhero.play_mode. */
export type PlayMode = 'arcade' | 'sheet' | 'practice' | 'strings3d';

/** O enum do banco para cada GameMode da shell (GAME_MODES em shell/play.ts). */
export const PLAY_MODE_OF = {
  Arcade: 'arcade',
  Partitura: 'sheet',
  Prática: 'practice',
  'Cordas 3D': 'strings3d',
} as const satisfies Record<string, PlayMode>;

/** O que violinhero.submit_play recebe (p_play); o servidor confere tudo contra o chart do banco. */
export interface PlayPayload {
  /** Gerado no aparelho: reenviar a mesma partida (fila offline) não conta duas vezes. */
  client_id: string;
  song_id: string;
  level: Level;
  mode: PlayMode;
  finished: boolean;
  no_fail: boolean;
  looped: boolean;
  speed: number;
  score: number;
  accuracy: number;
  counts: Record<Judgment, number>;
  max_combo: number;
  mean_abs_cents: number | null;
  /** Sol, Ré, Lá, Mi. */
  string_cents: (number | null)[];
  duration_ms: number;
  played_at: string;
}

export interface PlayInput {
  song: Pick<Song, 'id' | 'level'>;
  mode: PlayMode;
  result: GameResult | PracticeResult;
  noFail?: boolean;
  /** Laço A–B ligado em algum momento da prática. */
  looped?: boolean;
  durationMs: number;
  clientId?: string;
  playedAt?: Date;
}

/** Duas casas, dentro dos ±100 ¢ que o servidor aceita (a média do som sustentado pode escapar um pouco). */
const cents = (value: number | null) => (value === null ? null : Math.round(Math.max(-100, Math.min(100, value)) * 100) / 100);

/**
 * A partida no formato do servidor. A partida comum que virou prática (resultado com voltas) vai como prática: sem
 * recorde, selo nem ranking. Na prática, a velocidade é o menor fator das voltas.
 */
export function playPayload({ song, mode, result, noFail = false, looped = false, durationMs, clientId, playedAt }: PlayInput): PlayPayload {
  const factors = 'laps' in result ? result.laps.flatMap((lap) => lap.factors) : [];
  const practice = mode === 'practice' || 'laps' in result;
  return {
    client_id: clientId ?? crypto.randomUUID(),
    song_id: song.id,
    level: song.level,
    mode: practice ? 'practice' : mode,
    finished: result.status === 'finished',
    no_fail: noFail,
    looped: practice && (looped || ('laps' in result && result.laps.length > 1)),
    speed: practice && factors.length ? Math.min(...factors) : 1,
    score: result.score,
    accuracy: result.accuracy,
    counts: { ...result.counts },
    max_combo: result.maxCombo,
    mean_abs_cents: cents(result.meanAbsCents),
    string_cents: result.strings.map((s) => cents(s.meanCents)),
    duration_ms: Math.max(0, Math.round(durationMs)),
    played_at: (playedAt ?? new Date()).toISOString(),
  };
}

export interface StreakInfo {
  currentDays: number;
  bestDays: number;
  /** Dia (aaaa-mm-dd, horário de Brasília) da última partida. */
  lastDay: string;
}

export interface PlayOutcome {
  playId: string;
  accuracy: number;
  /** null quando a partida não vale recorde (prática ou interrompida). */
  record: { previous: number | null; improved: boolean } | null;
  /** Selos novos desta partida, na ordem de BADGES. */
  badges: BadgeId[];
  streak: StreakInfo | null;
  /** O servidor já tinha esta partida (mesmo client_id). */
  duplicate: boolean;
}

export type ProgressErrorKind = 'offline' | 'rejected' | 'not-found' | 'server';

const MESSAGES: Record<ProgressErrorKind, string> = {
  offline: 'Sem conexão com o servidor. A partida não foi salva na nuvem.',
  rejected: 'Os números dessa partida não fecham e ela não foi salva.',
  'not-found': 'Não encontramos essa música nesse nível para salvar a partida.',
  server: 'Não foi possível salvar o progresso agora. Tente de novo em instantes.',
};

/** Erro com mensagem pronta para a tela; a causa original fica em `cause`. */
export class ProgressError extends Error {
  readonly kind: ProgressErrorKind;

  constructor(kind: ProgressErrorKind, cause?: unknown) {
    super(MESSAGES[kind], { cause });
    this.name = 'ProgressError';
    this.kind = kind;
  }
}

/** Códigos que o submit_play usa (0005_plays.sql); sem código, a requisição nem chegou ao banco. */
function errorKind(error: { code?: string }): ProgressErrorKind {
  if (error.code === '22023') return 'rejected';
  if (error.code === 'P0002') return 'not-found';
  if (error.code === '42501' || !error.code) return 'offline';
  return 'server';
}

export type ProgressClient = { auth: AuthClient; from: SupabaseClient['from']; rpc: SupabaseClient['rpc'] };

function requireSession(client: ProgressClient | null, session: SessionState): ProgressClient {
  if (!client || session.status !== 'signed-in') throw new ProgressError('offline');
  return client;
}

interface OutcomeRow {
  play_id: string;
  accuracy: number | string;
  record: { previous: number | null; improved: boolean } | null;
  badges: string[];
  streak: { current_days: number; best_days: number; last_day: string } | null;
  duplicate: boolean;
}

const KNOWN_BADGES = new Set<string>(BADGES.map((b) => b.id));

const toStreak = (row: { current_days: number; best_days: number; last_day: string }): StreakInfo => ({
  currentDays: row.current_days,
  bestDays: row.best_days,
  lastDay: row.last_day,
});

/** Envia a partida por submit_play. A fila offline (reenvio depois) é do floor de sincronização. */
export async function submitPlay(client: ProgressClient | null, session: SessionState, payload: PlayPayload): Promise<PlayOutcome> {
  const db = requireSession(client, session);
  const { data, error } = await db.rpc('submit_play', { p_play: payload });
  if (error) throw new ProgressError(errorKind(error), error);
  const row = data as OutcomeRow;
  return {
    playId: row.play_id,
    accuracy: Number(row.accuracy),
    record: row.record,
    badges: row.badges.filter((id): id is BadgeId => KNOWN_BADGES.has(id)),
    streak: row.streak ? toStreak(row.streak) : null,
    duplicate: row.duplicate,
  };
}

export interface RecordEntry {
  songId: string;
  level: Level;
  score: number;
  accuracy: number;
}

/** Recordes do jogador por música e nível (a RLS só devolve os dele). */
export async function listMyRecords(client: ProgressClient | null, session: SessionState): Promise<RecordEntry[]> {
  const db = requireSession(client, session);
  const { data, error } = await db.from('records').select('song_id, level, score, accuracy');
  if (error) throw new ProgressError(errorKind(error), error);
  return ((data ?? []) as { song_id: string; level: Level; score: number; accuracy: number | string }[]).map((r) => ({
    songId: r.song_id,
    level: r.level,
    score: r.score,
    accuracy: Number(r.accuracy),
  }));
}

/** Selos conquistados, na ordem de BADGES. */
export async function listMyBadges(client: ProgressClient | null, session: SessionState): Promise<BadgeId[]> {
  const db = requireSession(client, session);
  const { data, error } = await db.from('badges_earned').select('badge_id');
  if (error) throw new ProgressError(errorKind(error), error);
  const owned = new Set(((data ?? []) as { badge_id: string }[]).map((r) => r.badge_id));
  return BADGES.map((b) => b.id).filter((id) => owned.has(id));
}

/** Um selo da coleção: quando e em que partida saiu. */
export interface EarnedBadge {
  id: BadgeId;
  earnedAt: string;
  /** A partida em que saiu; songTitle null quando a música não é mais legível para o jogador. */
  play: { songId: string; songTitle: string | null; level: Level } | null;
}

export interface BadgeCollection {
  /** Na ordem de BADGES. */
  earned: EarnedBadge[];
  /** Maior combo de uma partida que vale selo (sem prática); null sem partida. */
  bestCombo: number | null;
  /** Menor afinação média de uma música terminada (sem prática), em cents; null sem nenhuma. */
  bestCents: number | null;
}

interface EarnedRow {
  badge_id: string;
  earned_at: string;
  play: { song_id: string; level: Level; song: { title: string } | null } | null;
}

/** A coleção de selos com data e partida, e o quanto falta para os de combo e de afinação (a RLS só devolve os dele). */
export async function getMyBadgeCollection(client: ProgressClient | null, session: SessionState): Promise<BadgeCollection> {
  const db = requireSession(client, session);
  const [earned, combo, cents] = await Promise.all([
    db.from('badges_earned').select('badge_id, earned_at, play:plays(song_id, level, song:songs(title))'),
    db.from('plays').select('max_combo').neq('mode', 'practice').order('max_combo', { ascending: false }).limit(1),
    db
      .from('plays')
      .select('mean_abs_cents')
      .neq('mode', 'practice')
      .eq('finished', true)
      .not('mean_abs_cents', 'is', null)
      .order('mean_abs_cents', { ascending: true })
      .limit(1),
  ]);
  const error = earned.error ?? combo.error ?? cents.error;
  if (error) throw new ProgressError(errorKind(error), error);
  const rows = new Map(((earned.data ?? []) as unknown as EarnedRow[]).map((r) => [r.badge_id, r]));
  const bestCombo = (combo.data as { max_combo: number }[] | null)?.[0]?.max_combo;
  const bestCents = (cents.data as { mean_abs_cents: number | string }[] | null)?.[0]?.mean_abs_cents;
  return {
    earned: BADGES.flatMap((b) => {
      const row = rows.get(b.id);
      if (!row) return [];
      const play = row.play ? { songId: row.play.song_id, songTitle: row.play.song?.title ?? null, level: row.play.level } : null;
      return [{ id: b.id, earnedAt: row.earned_at, play }];
    }),
    bestCombo: bestCombo ?? null,
    bestCents: bestCents === undefined ? null : Number(bestCents),
  };
}

/** Sequência guardada; null antes da primeira partida. */
export async function getMyStreak(client: ProgressClient | null, session: SessionState): Promise<StreakInfo | null> {
  const db = requireSession(client, session);
  const { data, error } = await db.from('streaks').select('current_days, best_days, last_day').maybeSingle();
  if (error) throw new ProgressError(errorKind(error), error);
  return data ? toStreak(data as { current_days: number; best_days: number; last_day: string }) : null;
}

/** O dia de hoje (aaaa-mm-dd) no fuso que o servidor usa para a sequência, não no do aparelho. */
export function todayInBrazil(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

/** Dias seguidos que valem hoje: a sequência cai para 0 se o último dia ficou antes de ontem. */
export function currentStreak(streak: StreakInfo | null, today: string = todayInBrazil()): number {
  if (!streak) return 0;
  const gap = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${streak.lastDay}T00:00:00Z`)) / 86_400_000;
  return gap <= 1 ? streak.currentDays : 0;
}

export const progressKeys = {
  all: ['progress'] as const,
  records: ['progress', 'records'] as const,
  badges: ['progress', 'badges'] as const,
  badgeCollection: ['progress', 'badges', 'collection'] as const,
  streak: ['progress', 'streak'] as const,
};

/** A sessão é a mesma do SessionStatus (query ['session']). */
function useSession(client: ProgressClient | null) {
  const queryClient = useQueryClient();
  return () => queryClient.fetchQuery({ queryKey: ['session'], queryFn: () => ensureSession(client), staleTime: Infinity });
}

const retryServer = (count: number, error: Error) => count < 2 && error instanceof ProgressError && error.kind === 'server';

export function useSubmitPlay(client: ProgressClient | null = supabase) {
  const session = useSession(client);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PlayPayload) => submitPlay(client, await session(), payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: progressKeys.all }),
  });
}

export function useMyRecords(client: ProgressClient | null = supabase) {
  const session = useSession(client);
  return useQuery({ queryKey: progressKeys.records, queryFn: async () => listMyRecords(client, await session()), retry: retryServer });
}

/**
 * Selos da conta, que também entram em vh:badges: o motor passa a contar como já ganhos os que a conta tem (outro
 * aparelho), e o selo não comemora de novo mesmo quando a resposta do submit_play demora.
 */
export function myBadgesQuery(client: ProgressClient | null, session: () => Promise<SessionState>) {
  return {
    queryKey: progressKeys.badges,
    queryFn: async () => {
      const state = await session();
      const ids = await listMyBadges(client, state);
      // A resposta pode chegar depois de uma troca de conta (accountSwitch limpa vh:badges): só grava se o aparelho
      // ainda é de quem perguntou
      if (state.status === 'signed-in' && currentUserId() === state.userId) addEarnedBadges(ids);
      return ids;
    },
    retry: retryServer,
  };
}

export function useMyBadges(client: ProgressClient | null = supabase) {
  return useQuery(myBadgesQuery(client, useSession(client)));
}

export function useMyBadgeCollection(client: ProgressClient | null = supabase) {
  const session = useSession(client);
  return useQuery({
    queryKey: progressKeys.badgeCollection,
    queryFn: async () => getMyBadgeCollection(client, await session()),
    retry: retryServer,
  });
}

export function useMyStreak(client: ProgressClient | null = supabase) {
  const session = useSession(client);
  return useQuery({ queryKey: progressKeys.streak, queryFn: async () => getMyStreak(client, await session()), retry: retryServer });
}
