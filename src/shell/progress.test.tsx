import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { BADGES_STORAGE_KEY } from '../services/badges';
import { PROFILE_STORAGE_KEY } from '../services/profile';
import type { ProgressClient } from '../services/progress';
import { loadLocalProgress, mergeRecords, useProgress } from './progress';
import { loadRecords, RECORDS_STORAGE_KEY } from './records';

afterEach(() => localStorage.clear());

describe('progresso local', () => {
  it('aparelho vazio: sem nome, bicho, nível, recordes, selos nem sequência', () => {
    expect(loadLocalProgress()).toEqual({ nickname: null, animal: null, level: null, records: [], badges: [], streakDays: null });
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
    return { select: () => Object.assign(Promise.resolve(result), { maybeSingle: async () => result }) };
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
    });
    const { result } = renderHook(() => useProgress(client), { wrapper });
    await waitFor(() => expect(result.current.streakDays).toBe(4));
    expect(result.current.records.map((r) => r.songId)).toEqual(['minueto', 'ode']);
    expect(result.current.badges).toEqual(['primeira-musica', 'combo-25']);
  });
});
