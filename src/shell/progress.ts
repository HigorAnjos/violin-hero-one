import React from 'react';
import { BADGES, type BadgeId } from '../game/engine';
import type { PlayerLevel } from '../game/engine/levels';
import { loadEarnedBadges } from '../services/badges';
import { loadLocalProfile, type Animal } from '../services/profile';
import { currentStreak, useMyBadges, useMyRecords, useMyStreak, type ProgressClient } from '../services/progress';
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
  };
}

/** Maior pontuação por música e nível, das duas fontes. */
export function mergeRecords(a: readonly RecordEntry[], b: readonly RecordEntry[]): RecordEntry[] {
  const best = new Map<string, RecordEntry>();
  for (const r of [...a, ...b]) {
    const key = `${r.songId}:${r.level}`;
    const seen = best.get(key);
    if (!seen || r.score > seen.score) best.set(key, { songId: r.songId, level: r.level, score: r.score });
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
  return React.useMemo(() => {
    const owned = new Set([...local.badges, ...(badges.data ?? [])]);
    return {
      ...local,
      records: records.data ? mergeRecords(local.records, records.data) : local.records,
      badges: BADGES.map((b) => b.id).filter((id) => owned.has(id)),
      streakDays: streak.isSuccess ? currentStreak(streak.data) : null,
    };
  }, [local, records.data, badges.data, streak.isSuccess, streak.data]);
}
