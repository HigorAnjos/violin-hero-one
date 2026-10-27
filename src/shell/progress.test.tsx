import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { BADGES_STORAGE_KEY } from '../services/badges';
import { PROFILE_STORAGE_KEY } from '../services/profile';
import type { PlayOutcome, ProgressClient } from '../services/progress';
import { badgesToShow, loadLocalProgress, mergeRecords, useBadgeCollection, useProgress } from './progress';
import { loadRecords, RECORDS_STORAGE_KEY } from './records';

afterEach(() => localStorage.clear());

describe('progresso local', () => {
  it('aparelho vazio: sem nome, bicho, nível, recordes, selos nem sequência', () => {
    expect(loadLocalProgress()).toEqual({ nickname: null, animal: null, level: null, records: [], badges: [], streakDays: null, history: null });
  });

  it('junta perfil, recordes e selos do aparelho', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ level: 'beginner', nickname: 'Lia', animal: 'fox' }));
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ 'ode:easy': 1200, 'minueto:medium': 5400 }));
    localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(['primeira-musica', 'nao-existe']));
    expect(loadLocalProgress()).toMatchObject({
      nickname: 'Lia',
      animal: 'fox',
      level: 'beginner',
      records: [
        { songId: 'minueto', level: 'medium', score: 5400 },
        { songId: 'ode', level: 'easy', score: 1200 },
      ],
      badges: ['primeira-musica'],
    });
  });

  it('recordes: id com dois-pontos funciona; nível desconhecido fica de fora', () => {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ 'banco:42:hard': 10, 'ode:facil': 3, 'x:easy': 'muito' }));
    expect(loadRecords()).toEqual([{ songId: 'banco:42', level: 'hard', score: 10 }]);
  });

  it('mergeRecords fica com o maior de cada música e nível', () => {
    expect(
      mergeRecords(
        [{ songId: 'ode', level: 'easy', score: 100 }],
        [
          { songId: 'ode', level: 'easy', score: 300 },
          { songId: 'ode', level: 'hard', score: 50 },
        ]
      )
    ).toEqual([
      { songId: 'ode', level: 'easy', score: 300 },
      { songId: 'ode', level: 'hard', score: 50 },
    ]);
  });
});

/** Cliente falso do Supabase: sessão anônima e as três tabelas do jogador. */
function fakeClient(tables: Record<string, unknown>): ProgressClient {
  const session = { user: { id: 'u1', is_anonymous: true } };
  const query = (table: string) => {
    const result = { data: tables[table] ?? null, error: null };
    return { select: () => Object.assign(Promise.resolve(result), { maybeSingle: async () => result, gte: async () => result }) };
  };
  return {
    auth: { getSession: async () => ({ data: { session }, error: null }), signInAnonymously: async () => ({ data: { session }, error: null }) },
    from: query,
    rpc: async () => ({ data: null, error: null }),
  } as unknown as ProgressClient;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProgress', () => {
  it('sem servidor: o que está no aparelho, sem sequência', () => {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ 'ode:easy': 1200 }));
    const { result } = renderHook(() => useProgress(null), { wrapper });
    expect(result.current.records).toEqual([{ songId: 'ode', level: 'easy', score: 1200 }]);
    expect(result.current.streakDays).toBeNull();
  });

  it('com sessão: recordes e selos do servidor somados aos do aparelho, e a sequência', async () => {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ 'ode:easy': 1200 }));
    localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(['combo-25']));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const client = fakeClient({
      records: [{ song_id: 'minueto', level: 'medium', score: 5400, accuracy: '91.5' }],
      badges_earned: [{ badge_id: 'primeira-musica' }],
      streaks: { current_days: 4, best_days: 9, last_day: today },
      play_days: [{ day: today, seconds: 600, plays: 1 }],
      plays: [{ played_at: new Date().toISOString(), string_cents: ['3.5', null, '-2', '8'] }],
    });
    const { result } = renderHook(() => useProgress(client), { wrapper });
    await waitFor(() => expect(result.current.streakDays).toBe(4));
    await waitFor(() => expect(result.current.history).not.toBeNull());
    expect(result.current.history).toEqual({ days: [{ day: today, seconds: 600, marked: true }], plays: [{ playedAt: expect.any(String), stringCents: [3.5, null, -2, 8] }] });
    expect(result.current.records.map((r) => r.songId)).toEqual(['minueto', 'ode']);
    expect(result.current.records[0].accuracy).toBe(91.5);
    expect(result.current.badges).toEqual(['primeira-musica', 'combo-25']);
  });
});

const outcome = (badges: PlayOutcome['badges'], duplicate = false): PlayOutcome => ({ playId: 'p', accuracy: 100, record: null, badges, streak: null, duplicate });

describe('badgesToShow', () => {
  it('sem resposta do servidor, os do aparelho', () => {
    expect(badgesToShow(['primeira-musica', 'combo-25'], undefined)).toEqual(['primeira-musica', 'combo-25']);
  });

  it('com resposta (e no reenvio), só os que o servidor confirmou e o aparelho ainda não tinha comemorado', () => {
    expect(badgesToShow(['primeira-musica', 'combo-25'], outcome(['combo-25']))).toEqual(['combo-25']);
    expect(badgesToShow(['primeira-musica'], outcome(['primeira-musica', 'combo-25']))).toEqual(['primeira-musica']);
    expect(badgesToShow(['primeira-musica'], outcome(['primeira-musica'], true))).toEqual(['primeira-musica']);
    expect(badgesToShow(['sem-erros'], outcome([]))).toEqual([]);
  });
});

/** Cliente cujas queries encadeiam (neq, eq, not, order, limit) e respondem pela tabela. */
function chainClient(tables: Record<string, unknown[]>): ProgressClient {
  const session = { user: { id: 'u1', is_anonymous: true } };
  const query = (table: string) => {
    const result = Promise.resolve({ data: tables[table] ?? [], error: null });
    const chain: Record<string, unknown> = { then: result.then.bind(result) };
    for (const m of ['select', 'neq', 'eq', 'not', 'order', 'limit']) chain[m] = () => chain;
    return chain;
  };
  return {
    auth: { getSession: async () => ({ data: { session }, error: null }), signInAnonymously: async () => ({ data: { session }, error: null }) },
    from: query,
    rpc: async () => ({ data: null, error: null }),
  } as unknown as ProgressClient;
}

describe('useBadgeCollection', () => {
  it('sem servidor: os selos do aparelho, sem data', async () => {
    localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(['combo-25', 'primeira-musica']));
    const { result } = renderHook(() => useBadgeCollection(null), { wrapper });
    expect(result.current.status).toBe('pending');
    await waitFor(() => expect(result.current.status).toBe('device'));
    expect(result.current.earned).toEqual([
      { id: 'primeira-musica', source: 'device' },
      { id: 'combo-25', source: 'device' },
    ]);
  });

  it('com sessão: data e partida do servidor, os do aparelho que faltam e o melhor combo e afinação', async () => {
    localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(['combo-25']));
    const client = chainClient({
      badges_earned: [{ badge_id: 'sem-erros', earned_at: '2026-10-20T15:00:00Z', play: { song_id: 'minueto', level: 'easy', song: { title: 'Minueto' } } }],
      plays: [{ max_combo: 31, mean_abs_cents: '12.5' }],
    });
    const { result } = renderHook(() => useBadgeCollection(client), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('server'));
    expect(result.current.earned).toEqual([
      { id: 'sem-erros', source: 'server', earned: { id: 'sem-erros', earnedAt: '2026-10-20T15:00:00Z', play: { songId: 'minueto', songTitle: 'Minueto', level: 'easy' } } },
      { id: 'combo-25', source: 'device' },
    ]);
    expect(result.current.bestCombo).toBe(31);
    expect(result.current.bestCents).toBe(12.5);
  });
});
