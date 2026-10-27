import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ODE } from '../game/engine/testing';
import { createPlaySync, memoryPlayQueueStore } from '../services/playQueue';
import { loadEarnedBadges } from '../services/badges';
import { progressKeys, type ProgressClient } from '../services/progress';
import type { SessionState } from '../services/session';
import { rememberUser } from '../services/user';
import { songKeys } from '../services/songs';
import { forgetUserQueries, playedChart, reconnect, useDeviceSync } from './deviceSync';

const SIGNED_IN: SessionState = { status: 'signed-in', userId: 'u1', anonymous: true };

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let net = false;
  const ensure = vi.fn(async (): Promise<SessionState> => (net ? SIGNED_IN : { status: 'offline' }));
  const session = () => queryClient.fetchQuery({ queryKey: ['session'], queryFn: ensure, staleTime: Infinity });
  const sync = createPlaySync({
    store: memoryPlayQueueStore(),
    user: () => 'u1',
    session,
    submit: vi.fn(async () => ({ playId: 'p', accuracy: 0, record: null, badges: [], streak: null, duplicate: false })),
    chart: async () => ({ hash: 'h', song: ODE }),
    online: () => net,
  });
  return { queryClient, ensure, session, sync, goOnline: () => (net = true) };
}

describe('reconnect', () => {
  it('a sessão que caiu para Offline tenta de novo e a fila sobe, sem recarregar', async () => {
    const t = setup();
    expect(await t.session()).toEqual({ status: 'offline' });
    await t.sync.enqueue({ payload: { client_id: 'a' } as never, chartHash: 'h', checkChart: false });
    t.goOnline();
    // staleTime Infinity: sem o reconnect, a sessão em cache continuaria Offline
    expect(await t.session()).toEqual({ status: 'offline' });
    await reconnect(t.queryClient, t.sync, t.session);
    expect(t.queryClient.getQueryData(['session'])).toEqual(SIGNED_IN);
    expect(await t.sync.pending('u1')).toBe(0);
  });

  it('sessão que já estava ok não é refeita', async () => {
    const t = setup();
    t.goOnline();
    await t.session();
    await reconnect(t.queryClient, t.sync, t.session);
    expect(t.ensure).toHaveBeenCalledTimes(1);
  });

  it('as queries que falharam tentam de novo; a música aberta do aparelho confere o hash', async () => {
    const t = setup();
    t.goOnline();
    await t.session();
    const catalog = vi.fn().mockRejectedValueOnce(new Error('sem rede')).mockResolvedValue(['ok']);
    await t.queryClient.fetchQuery({ queryKey: ['songs', 'catalog'], queryFn: catalog }).catch(() => undefined);
    t.queryClient.setQueryData(songKeys.song('greensleeves', 'easy'), { hash: 'a', saved: 'device' });
    t.queryClient.setQueryData(songKeys.song('canon', 'easy'), { hash: 'b', saved: 'unchanged' });
    await reconnect(t.queryClient, t.sync, t.session);
    expect(t.queryClient.getQueryData(['songs', 'catalog'])).toEqual(['ok']);
    expect(t.queryClient.getQueryState(songKeys.song('greensleeves', 'easy'))?.isInvalidated).toBe(true);
    expect(t.queryClient.getQueryState(songKeys.song('canon', 'easy'))?.isInvalidated).toBe(false);
  });
});

describe('forgetUserQueries', () => {
  it('a troca de usuário tira da memória as baixadas, as músicas abertas, o progresso e o perfil; o catálogo fica', () => {
    const queryClient = new QueryClient();
    for (const key of [songKeys.saved, songKeys.song('canon', 'easy'), ['progress', 'records'], ['profile', 'remote'], songKeys.catalog]) {
      queryClient.setQueryData(key, 'x');
    }
    forgetUserQueries(queryClient);
    expect(queryClient.getQueryCache().getAll().map((q) => q.queryKey)).toEqual([songKeys.catalog]);
  });
});

describe('useDeviceSync', () => {
  it('partida que o servidor aceitou invalida o progresso (selos, sequência, recordes)', async () => {
    const t = setup();
    t.goOnline();
    await t.session();
    t.queryClient.setQueryData(progressKeys.streak, null);
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: t.queryClient }, children);
    const view = renderHook(() => useDeviceSync(t.sync, null), { wrapper });
    await t.sync.enqueue({ payload: { client_id: 'a' } as never, chartHash: 'h', checkChart: false });
    await t.sync.flush();
    await waitFor(() => expect(t.queryClient.getQueryState(progressKeys.streak)?.isInvalidated).toBe(true));
    view.unmount();
  });

  it('os selos da conta entram em vh:badges na abertura e depois de cada partida aceita', async () => {
    localStorage.clear();
    rememberUser('u1');
    const t = setup();
    t.goOnline();
    await t.session();
    let owned = [{ badge_id: 'combo-25' }];
    const select = vi.fn(async () => ({ data: owned, error: null }));
    const client = { auth: {}, from: () => ({ select }), rpc: vi.fn() } as unknown as ProgressClient;
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: t.queryClient }, children);
    const view = renderHook(() => useDeviceSync(t.sync, client), { wrapper });
    await waitFor(() => expect(loadEarnedBadges()).toEqual(['combo-25']));
    owned = [...owned, { badge_id: 'sem-erros' }];
    await t.sync.enqueue({ payload: { client_id: 'b' } as never, chartHash: 'h', checkChart: false });
    await t.sync.flush();
    await waitFor(() => expect(loadEarnedBadges()).toEqual(['combo-25', 'sem-erros']));
    view.unmount();
    localStorage.clear();
  });
});

describe('playedChart', () => {
  it('do servidor: hash e sem conferir; do aparelho ou sem query (embutida): confere antes de enviar', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(songKeys.song('canon', 'easy'), { hash: 'b', saved: 'saved' });
    queryClient.setQueryData(songKeys.song('greensleeves', 'easy'), { hash: 'a', saved: 'device' });
    expect(playedChart(queryClient, 'canon', 'easy')).toEqual({ chartHash: 'b', checkChart: false });
    expect(playedChart(queryClient, 'greensleeves', 'easy')).toEqual({ chartHash: 'a', checkChart: true });
    expect(playedChart(queryClient, 'ode-a-alegria', 'easy')).toEqual({ chartHash: null, checkChart: true });
  });
});
