import React from 'react';
import { BADGES, type BadgeId } from '../game/engine';
import type { PlayerLevel } from '../game/engine/levels';
import { loadEarnedBadges } from '../services/badges';
import { useMyHistory, type History } from '../services/history';
import { loadLocalProfile, type Animal } from '../services/profile';
import {
  currentStreak,
  useMyBadgeCollection,
  useMyBadges,
  useMyRecords,
  useMyStreak,
  type EarnedBadge,
  type PlayOutcome,
  type ProgressClient,
} from '../services/progress';
import { supabase } from '../services/supabase';
import { loadRecords, type RecordEntry } from './records';

/** O que a tela de Perfil mostra: quem é o jogador e o que ele já fez. */
export interface Progress {
  nickname: string | null;
  animal: Animal | null;
  level: PlayerLevel | null;
  /** Do maior para o menor. */
  records: RecordEntry[];
  badges: BadgeId[];
  /** Dias seguidos que valem hoje; null sem servidor (o aparelho não conta sequência). */
  streakDays: number | null;
  /** Minutos por dia e afinação por corda das últimas 4 semanas; null sem servidor. */
  history: History | null;
}

/**
 * Os selos novos que a tela mostra. Sem resposta do servidor, os do aparelho; com ela (reenvio incluso, que devolve
 * os selos daquela partida), só os que o servidor confirmou E o aparelho ainda não tinha mostrado. A regra é a mesma
 * dos dois lados (badgeCases.json), então o servidor nunca traz um selo fora da lista local: no máximo tira um que o
 * jogador já tinha ganhado em outro aparelho. Assim o mesmo selo nunca comemora duas vezes.
 */
export function badgesToShow(local: readonly BadgeId[], outcome: PlayOutcome | undefined): BadgeId[] {
  return outcome ? outcome.badges.filter((id) => local.includes(id)) : [...local];
}

/** Um selo na coleção: do servidor (com data e partida) ou só do aparelho (sem rede, ou antes do envio). */
export type CollectedBadge = { id: BadgeId } & ({ source: 'server'; earned: EarnedBadge } | { source: 'device' });

export interface Collection {
  /** Na ordem de BADGES. */
  earned: CollectedBadge[];
  bestCombo: number | null;
  bestCents: number | null;
  /** server: a coleção da conta; device: o servidor não respondeu (sem rede), só o aparelho; pending: perguntando. */
  status: 'pending' | 'server' | 'device';
}

/** A coleção da tela de selos: os do servidor com data e partida, mais os do aparelho que ainda não subiram. */
export function useBadgeCollection(client: ProgressClient | null = supabase): Collection {
  const [local] = React.useState(loadEarnedBadges);
  const server = useMyBadgeCollection(client);
  return React.useMemo(() => {
    const fromServer = new Map((server.data?.earned ?? []).map((e) => [e.id, e]));
    const earned = BADGES.flatMap((b): CollectedBadge[] => {
      const e = fromServer.get(b.id);
      if (e) return [{ id: b.id, source: 'server', earned: e }];
      return local.includes(b.id) ? [{ id: b.id, source: 'device' }] : [];
    });
    const status = server.isSuccess ? 'server' : server.isError ? 'device' : 'pending';
    return { earned, bestCombo: server.data?.bestCombo ?? null, bestCents: server.data?.bestCents ?? null, status };
  }, [local, server.data, server.isSuccess, server.isError]);
}

/** Do aparelho: vh:profile, vh:recordes e vh:badges. */
export function loadLocalProgress(): Progress {
  const profile = loadLocalProfile();
  return {
    nickname: profile.nickname ?? null,
    animal: profile.animal ?? null,
    level: profile.level ?? null,
    records: loadRecords(),
    badges: loadEarnedBadges(),
    streakDays: null,
    history: null,
  };
}

/** Maior pontuação por música e nível, das duas fontes. */
export function mergeRecords(a: readonly RecordEntry[], b: readonly RecordEntry[]): RecordEntry[] {
  const best = new Map<string, RecordEntry>();
  for (const r of [...a, ...b]) {
    const key = `${r.songId}:${r.level}`;
    const seen = best.get(key);
    if (!seen || r.score > seen.score) best.set(key, { songId: r.songId, level: r.level, score: r.score, ...(r.accuracy === undefined ? {} : { accuracy: r.accuracy }) });
  }
  return [...best.values()].sort((x, y) => y.score - x.score);
}

/**
 * Único ponto de leitura do progresso para as telas. Com sessão, recordes, selos e sequência do servidor; o aparelho
 * fica de reserva (sem rede, ou partida ainda não enviada) e entra somado. A troca completa da fonte é da sincronização.
 */
export function useProgress(client: ProgressClient | null = supabase): Progress {
  const [local] = React.useState(loadLocalProgress);
  const records = useMyRecords(client);
  const badges = useMyBadges(client);
  const streak = useMyStreak(client);
  const history = useMyHistory(client);
  return React.useMemo(() => {
    const owned = new Set([...local.badges, ...(badges.data ?? [])]);
    return {
      ...local,
      records: records.data ? mergeRecords(local.records, records.data) : local.records,
      badges: BADGES.map((b) => b.id).filter((id) => owned.has(id)),
      streakDays: streak.isSuccess ? currentStreak(streak.data) : null,
      history: history.data ?? null,
    };
  }, [local, records.data, badges.data, streak.isSuccess, streak.data, history.data]);
}
