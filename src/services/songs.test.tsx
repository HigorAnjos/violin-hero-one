import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import type { SessionState } from './session';
import { getSong, listCatalog, SongError, useCatalog, useSong, type SongsClient } from './songs';

const CHART = {
  formatVersion: 1,
  id: 'escala-re-maior',
  title: 'Escala de Ré maior',
  composer: '',
  key: 'D major',
  bpm: 60,
  timeSignature: { beats: 4, unit: 4 },
  level: 'easy',
  measures: [{ beats: 4, notes: [{ beat: 0, beats: 4, midi: 62, string: 1, finger: 0 }] }],
};

const SIGNED_IN: SessionState = { status: 'signed-in', userId: 'u1', anonymous: true };

const SHEET_ROW = {
  id: 'escala-re-maior',
  title: 'Escala de Ré maior',
  composer: '',
  bpm: '60.00',
  time_beats: 4,
  time_unit: 4,
  key: 'D major',
  duration_seconds: '32.00',
  origin: 'catalog',
};

const SHEET = {
  id: 'escala-re-maior',
  title: 'Escala de Ré maior',
  composer: '',
  bpm: 60,
  timeSignature: { beats: 4, unit: 4 },
  key: 'D major',
  durationSeconds: 32,
  origin: 'catalog',
};

function fakeClient({ select = { data: [] as unknown, error: null as unknown }, rpc = { data: [] as unknown, error: null as unknown } } = {}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(select).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.order.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  const rpcFn = vi.fn().mockResolvedValue(rpc);
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1', is_anonymous: true } } }, error: null }),
    signInAnonymously: vi.fn(),
  };
  return { client: { auth, from, rpc: rpcFn } as unknown as SongsClient, from, query, rpc: rpcFn, auth };
}

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('listCatalog', () => {
  it('lê só o catálogo, na ordem da estante, com os níveis de fácil a difícil', async () => {
    const { client, from, query } = fakeClient({
      select: { data: [{ ...SHEET_ROW, song_charts: [{ level: 'hard' }, { level: 'easy' }] }], error: null },
    });
    expect(await listCatalog(client, SIGNED_IN)).toEqual([{ ...SHEET, levels: ['easy', 'hard'] }]);
    expect(from).toHaveBeenCalledWith('songs');
    expect(query.eq).toHaveBeenCalledWith('origin', 'catalog');
    expect(query.order).toHaveBeenCalledExactlyOnceWith('catalog_position', { ascending: true });
  });

  it('deixa de fora a música que saiu da estante (posição nula)', async () => {
    const { client, query } = fakeClient();
    await listCatalog(client, SIGNED_IN);
    expect(query.not).toHaveBeenCalledExactlyOnceWith('catalog_position', 'is', null);
  });

  it('sem cliente ou sem sessão: erro offline em português, sem tocar no banco', async () => {
    const { client, from } = fakeClient();
    await expect(listCatalog(null, SIGNED_IN)).rejects.toMatchObject({ kind: 'offline', message: expect.stringMatching(/Sem conexão/) });
    await expect(listCatalog(client, { status: 'offline' })).rejects.toBeInstanceOf(SongError);
    expect(from).not.toHaveBeenCalled();
  });

  it('erro do banco vira erro de servidor com a causa guardada', async () => {
    const cause = { message: 'boom', code: '500' };
    const { client } = fakeClient({ select: { data: null, error: cause } });
    await expect(listCatalog(client, SIGNED_IN)).rejects.toMatchObject({ kind: 'server', cause });
  });
});

describe('getSong', () => {
  const row = { ...SHEET_ROW, level: 'easy', format_version: 1, chart: CHART, hash: 'a'.repeat(64) };

  it('chama get_song e devolve ficha, Song validada e hash', async () => {
    const { client, rpc } = fakeClient({ rpc: { data: [row], error: null } });
    const loaded = await getSong(client, SIGNED_IN, 'escala-re-maior', 'easy');
    expect(rpc).toHaveBeenCalledWith('get_song', { p_song_id: 'escala-re-maior', p_level: 'easy' });
    expect(loaded.sheet).toEqual(SHEET);
    expect(loaded.song.id).toBe('escala-re-maior');
    expect(loaded.song.measures.length).toBeGreaterThan(0);
    expect(loaded.hash).toBe('a'.repeat(64));
  });

  it('nenhuma linha (não existe, nível que falta ou sem acesso): não encontrada', async () => {
    const { client } = fakeClient({ rpc: { data: [], error: null } });
    await expect(getSong(client, SIGNED_IN, 'x', 'hard')).rejects.toMatchObject({ kind: 'not-found', message: 'Não encontramos essa música nesse nível.' });
  });

  it('chart fora do formato: inválida, sem quebrar a tela', async () => {
    const { client } = fakeClient({ rpc: { data: [{ ...row, chart: { ...CHART, bpm: -1 } }], error: null } });
    await expect(getSong(client, SIGNED_IN, 'escala-re-maior', 'easy')).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('erro do rpc vira erro de servidor', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'permission denied' } } });
    await expect(getSong(client, SIGNED_IN, 'escala-re-maior', 'easy')).rejects.toMatchObject({ kind: 'server' });
  });
});

describe('hooks', () => {
  it('useCatalog usa a sessão compartilhada e devolve o catálogo', async () => {
    const { client, auth } = fakeClient({ select: { data: [{ ...SHEET_ROW, song_charts: [{ level: 'easy' }] }], error: null } });
    const { result } = renderHook(() => useCatalog(client), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((s) => s.id)).toEqual(['escala-re-maior']);
    expect(auth.getSession).toHaveBeenCalledOnce();
  });

  it('useSong sem cliente fica em erro offline', async () => {
    const { result } = renderHook(() => useSong('escala-re-maior', 'easy', null), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ kind: 'offline' });
  });
});
