import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { buildResult, type NoteJudgment, type PracticeResult } from '../game/engine';
import { GAME_MODES } from '../shell/play';
import {
  currentStreak,
  getMyStreak,
  listMyBadges,
  listMyRecords,
  myBadgesQuery,
  playPayload,
  PLAY_MODE_OF,
  ProgressError,
  submitPlay,
  todayInBrazil,
  useMyBadges,
  useSubmitPlay,
  type ProgressClient,
} from './progress';
import { loadEarnedBadges } from './badges';
import type { SessionState } from './session';
import { rememberUser } from './user';

const SIGNED_IN: SessionState = { status: 'signed-in', userId: 'u1', anonymous: true };
const SONG = { id: 'ode-a-alegria', level: 'easy' as const };

const judged = (index: number, judgment: NoteJudgment['judgment'], cents: number | null, points: number): NoteJudgment => ({
  index, noteIndex: index, measure: 0, string: 3, midi: 78, judgment,
  issue: judgment === 'miss' ? 'not-played' : null, offsetMs: cents === null ? null : 0, cents, playedMidi: null, points,
});

const RESULT = buildResult({
  status: 'finished',
  judgments: [judged(0, 'perfect', 3.333, 100), judged(1, 'great', -25.4, 70), judged(2, 'miss', null, 0)],
  score: 170,
  maxCombo: 2,
  energy: 0.8,
  totalMeasures: 1,
});

const OUTCOME_ROW = {
  play_id: 'p1',
  accuracy: '56.67',
  record: { previous: null, improved: true },
  badges: ['primeira-musica', 'selo-do-futuro'],
  streak: { current_days: 3, best_days: 5, last_day: '2026-10-26' },
  duplicate: false,
};

function fakeClient({ rpc = { data: OUTCOME_ROW as unknown, error: null as unknown }, select = { data: [] as unknown, error: null as unknown } } = {}) {
  const query = {
    select: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(select).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.maybeSingle.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  const rpcFn = vi.fn().mockResolvedValue(rpc);
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1', is_anonymous: true } } }, error: null }),
    signInAnonymously: vi.fn(),
  };
  return { client: { auth, from, rpc: rpcFn } as unknown as ProgressClient, from, query, rpc: rpcFn };
}

function wrapper(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('playPayload', () => {
  it('leva contagens, pontos, combo e afinação do resultado no formato do submit_play', () => {
    const playedAt = new Date('2026-10-26T15:00:00Z');
    const payload = playPayload({ song: SONG, mode: 'arcade', result: RESULT, durationMs: 31_999.6, clientId: 'c1', playedAt });
    expect(payload).toEqual({
      client_id: 'c1',
      song_id: 'ode-a-alegria',
      level: 'easy',
      mode: 'arcade',
      finished: true,
      no_fail: false,
      looped: false,
      speed: 1,
      score: 170,
      accuracy: RESULT.accuracy,
      counts: { perfect: 1, great: 1, good: 0, miss: 1 },
      max_combo: 2,
      mean_abs_cents: 14.37,
      string_cents: [null, null, null, -11.03],
      duration_ms: 32_000,
      played_at: '2026-10-26T15:00:00.000Z',
    });
  });

  it('gera um client_id novo por partida', () => {
    const a = playPayload({ song: SONG, mode: 'arcade', result: RESULT, durationMs: 1 });
    const b = playPayload({ song: SONG, mode: 'arcade', result: RESULT, durationMs: 1 });
    expect(a.client_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.client_id).not.toBe(b.client_id);
  });

  it('prática: laço quando houve mais de uma volta e a menor velocidade das voltas', () => {
    const lap = { lap: 0, from: 0, to: 1, notes: 3, counts: RESULT.counts, accuracy: 0, score: 0, complete: true };
    const practice: PracticeResult = { ...RESULT, laps: [{ ...lap, factors: [0.7, 0.8] }, { ...lap, lap: 1, factors: [0.6] }], bestLap: 0 };
    expect(playPayload({ song: SONG, mode: 'practice', result: practice, durationMs: 1 })).toMatchObject({ looped: true, speed: 0.6 });
    // Fora da prática o servidor recusa laço e velocidade: nunca saem
    expect(playPayload({ song: SONG, mode: 'arcade', result: RESULT, durationMs: 1, looped: true })).toMatchObject({ looped: false, speed: 1 });
  });

  it('partida comum que virou prática a 0,7 vai como prática, sem laço, na menor velocidade', () => {
    const lap = { lap: 0, from: 2, to: 4, notes: 3, counts: RESULT.counts, accuracy: 0, score: 0, complete: true, factors: [0.7] };
    const converted: PracticeResult = { ...RESULT, laps: [lap], bestLap: 0 };
    expect(playPayload({ song: SONG, mode: 'arcade', result: converted, durationMs: 1 })).toMatchObject({ mode: 'practice', looped: false, speed: 0.7 });
    expect(playPayload({ song: SONG, mode: 'strings3d', result: converted, durationMs: 1 }).mode).toBe('practice');
  });

  it('afinação fora de ±100 ¢ chega presa no limite que o servidor aceita', () => {
    const result = { ...RESULT, meanAbsCents: 130, strings: RESULT.strings.map((s) => ({ ...s, meanCents: s.string === 0 ? -140 : null })) };
    const payload = playPayload({ song: SONG, mode: 'sheet', result, durationMs: 1 });
    expect(payload.mean_abs_cents).toBe(100);
    expect(payload.string_cents).toEqual([-100, null, null, null]);
  });

  it('todo modo da shell tem o seu valor no banco', () => {
    expect(Object.keys(PLAY_MODE_OF).sort()).toEqual([...GAME_MODES].sort());
  });
});

describe('submitPlay', () => {
  const payload = playPayload({ song: SONG, mode: 'arcade', result: RESULT, durationMs: 1, clientId: 'c1' });

  it('chama submit_play e devolve recorde, selos conhecidos e sequência', async () => {
    const { client, rpc } = fakeClient();
    const outcome = await submitPlay(client, SIGNED_IN, payload);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('submit_play', { p_play: payload });
    expect(outcome).toEqual({
      playId: 'p1',
      accuracy: 56.67,
      record: { previous: null, improved: true },
      badges: ['primeira-musica'],
      streak: { currentDays: 3, bestDays: 5, lastDay: '2026-10-26' },
      duplicate: false,
    });
  });

  it.each([
    ['22023', 'rejected', /não fecham/],
    ['P0002', 'not-found', /Não encontramos/],
    ['42501', 'offline', /Sem conexão/],
    ['', 'offline', /Sem conexão/],
    ['XX000', 'server', /Não foi possível/],
  ])('erro %s vira %s, em português', async (code, kind, message) => {
    const { client } = fakeClient({ rpc: { data: null, error: { code, message: 'x' } } });
    await expect(submitPlay(client, SIGNED_IN, payload)).rejects.toMatchObject({ kind, message: expect.stringMatching(message) });
  });

  it('sem cliente ou sem sessão: offline, sem chamar o banco', async () => {
    const { client, rpc } = fakeClient();
    await expect(submitPlay(null, SIGNED_IN, payload)).rejects.toBeInstanceOf(ProgressError);
    await expect(submitPlay(client, { status: 'offline' }, payload)).rejects.toMatchObject({ kind: 'offline' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('leituras do próprio progresso', () => {
  it('recordes com a precisão em número', async () => {
    const { client, from } = fakeClient({ select: { data: [{ song_id: 'a', level: 'hard', score: 900, accuracy: '97.50' }], error: null } });
    expect(await listMyRecords(client, SIGNED_IN)).toEqual([{ songId: 'a', level: 'hard', score: 900, accuracy: 97.5 }]);
    expect(from).toHaveBeenCalledWith('records');
  });

  it('selos na ordem de BADGES, sem os desconhecidos', async () => {
    const rows = [{ badge_id: 'combo-25' }, { badge_id: 'primeira-musica' }, { badge_id: 'velho' }];
    const { client } = fakeClient({ select: { data: rows, error: null } });
    expect(await listMyBadges(client, SIGNED_IN)).toEqual(['primeira-musica', 'combo-25']);
  });

  it('sequência: null antes da primeira partida', async () => {
    expect(await getMyStreak(fakeClient({ select: { data: null, error: null } }).client, SIGNED_IN)).toBeNull();
    const { client } = fakeClient({ select: { data: { current_days: 2, best_days: 4, last_day: '2026-10-25' }, error: null } });
    expect(await getMyStreak(client, SIGNED_IN)).toEqual({ currentDays: 2, bestDays: 4, lastDay: '2026-10-25' });
  });

  it('erro de leitura vira erro de servidor', async () => {
    const { client } = fakeClient({ select: { data: null, error: { code: '500', message: 'boom' } } });
    await expect(listMyRecords(client, SIGNED_IN)).rejects.toMatchObject({ kind: 'server' });
  });

  it('a sequência vale hoje e ontem; antes disso cai para 0', () => {
    const streak = { currentDays: 4, bestDays: 4, lastDay: '2026-10-25' };
    expect(currentStreak(streak, '2026-10-25')).toBe(4);
    expect(currentStreak(streak, '2026-10-26')).toBe(4);
    expect(currentStreak(streak, '2026-10-27')).toBe(0);
    expect(currentStreak(null, '2026-10-26')).toBe(0);
  });

  it('hoje é o dia de Brasília: 23h30 de domingo lá já é segunda em UTC', () => {
    expect(todayInBrazil(new Date('2026-10-27T02:30:00Z'))).toBe('2026-10-26');
    expect(todayInBrazil(new Date('2026-10-27T03:00:00Z'))).toBe('2026-10-27');
  });
});

describe('hooks', () => {
  it('useMyBadges lê com a sessão compartilhada', async () => {
    const { client } = fakeClient({ select: { data: [{ badge_id: 'sem-erros' }], error: null } });
    const { result } = renderHook(() => useMyBadges(client), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toEqual(['sem-erros']));
  });

  it('useSubmitPlay envia e invalida recordes, selos e sequência', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { client, rpc } = fakeClient();
    const { result } = renderHook(() => useSubmitPlay(client), { wrapper: wrapper(queryClient) });
    const payload = playPayload({ song: SONG, mode: 'arcade', result: RESULT, durationMs: 1 });
    await act(async () => {
      await result.current.mutateAsync(payload);
    });
    expect(rpc).toHaveBeenCalledWith('submit_play', { p_play: payload });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['progress'] });
  });
});

describe('myBadgesQuery', () => {
  const pending = () => {
    let answer: (rows: { badge_id: string }[]) => void = () => undefined;
    const select = vi.fn(() => new Promise((resolve) => (answer = (rows) => resolve({ data: rows, error: null }))));
    return {
      client: { auth: {}, from: () => ({ select }), rpc: vi.fn() } as unknown as ProgressClient,
      // Responde quando o pedido saiu (a sessão é esperada antes)
      answer: async (rows: { badge_id: string }[]) => {
        await vi.waitFor(() => expect(select).toHaveBeenCalled());
        answer(rows);
      },
    };
  };

  it('os selos da conta do aparelho entram em vh:badges', async () => {
    localStorage.clear();
    rememberUser('u1');
    const { client, answer } = pending();
    const run = myBadgesQuery(client, async () => SIGNED_IN).queryFn();
    await answer([{ badge_id: 'combo-25' }]);
    expect(await run).toEqual(['combo-25']);
    expect(loadEarnedBadges()).toEqual(['combo-25']);
    localStorage.clear();
  });

  it('resposta da conta A que chega depois da troca para B não grava nada no aparelho de B', async () => {
    localStorage.clear();
    rememberUser('u1');
    const { client, answer } = pending();
    const run = myBadgesQuery(client, async () => SIGNED_IN).queryFn();
    // A troca de conta (accountSwitch) limpa vh:badges e passa o aparelho para B
    rememberUser('u2');
    await answer([{ badge_id: 'combo-25' }, { badge_id: 'sem-erros' }]);
    expect(await run).toEqual(['sem-erros', 'combo-25']);
    expect(loadEarnedBadges()).toEqual([]);
    localStorage.clear();
  });
});
