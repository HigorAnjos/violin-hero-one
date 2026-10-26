import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ensureSession, type SessionState } from './session';
import { progressKeys, ProgressError, todayInBrazil, type ProgressClient } from './progress';
import { supabase } from './supabase';

/** Quanto do histórico o Perfil mostra: 4 semanas (o gráfico de minutos usa as 2 últimas). */
export const HISTORY_DAYS = 28;

export interface PlayDay {
  /** aaaa-mm-dd, horário de Brasília (o mesmo dia da sequência). */
  day: string;
  seconds: number;
}

export interface PlayTuning {
  playedAt: string;
  /** Desvio médio de cada corda, Sol Ré Lá Mi; null sem nota naquela corda. */
  stringCents: (number | null)[];
}

export interface History {
  days: PlayDay[];
  plays: PlayTuning[];
}

/** Dia `n` dias antes de `day` (aaaa-mm-dd), sem fuso no meio da conta. */
export function shiftDay(day: string, n: number): string {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() - n);
  return at.toISOString().slice(0, 10);
}

/** Minutos por dia e afinação por corda das últimas 4 semanas (a RLS só devolve as do jogador). */
export async function loadHistory(client: ProgressClient | null, session: SessionState, today: string = todayInBrazil()): Promise<History> {
  if (!client || session.status !== 'signed-in') throw new ProgressError('offline');
  const since = shiftDay(today, HISTORY_DAYS - 1);
  const [days, plays] = await Promise.all([
    client.from('play_days').select('day, seconds').gte('day', since),
    client.from('plays').select('played_at, string_cents').gte('played_at', `${since}T00:00:00-03:00`),
  ]);
  const error = days.error ?? plays.error;
  if (error) throw new ProgressError(error.code ? 'server' : 'offline', error);
  return {
    days: ((days.data ?? []) as { day: string; seconds: number }[]).map((d) => ({ day: d.day, seconds: d.seconds })),
    plays: ((plays.data ?? []) as { played_at: string; string_cents: (number | string | null)[] }[]).map((p) => ({
      playedAt: p.played_at,
      stringCents: p.string_cents.map((c) => (c === null ? null : Number(c))),
    })),
  };
}

export function useMyHistory(client: ProgressClient | null = supabase) {
  const queryClient = useQueryClient();
  return useQuery({
    // Debaixo de progressKeys.all: uma partida enviada (useSubmitPlay) invalida junto
    queryKey: [...progressKeys.all, 'history'],
    queryFn: async () => {
      const session = await queryClient.fetchQuery({ queryKey: ['session'], queryFn: () => ensureSession(client), staleTime: Infinity });
      return loadHistory(client, session);
    },
    retry: false,
  });
}
