import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import type { SessionState } from './session';
import { createSongCache, memorySongStore } from './songCache';
import { getSong, listCatalog, listOwnSongs, loadSong, SongError, useCatalog, useSavedSongs, useSong, type SongsClient } from './songs';

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
    neq: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(select).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.neq.mockReturnValue(query);
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

describe('listOwnSongs', () => {
  it('lê as músicas fora do catálogo (a RLS só devolve as do dono), da mais nova para a mais antiga', async () => {
    const row = { ...SHEET_ROW, id: 'abc', origin: 'imported', song_charts: [{ level: 'hard' }, { level: 'medium' }] };
    const { client, query } = fakeClient({ select: { data: [row], error: null } });
    expect(await listOwnSongs(client, SIGNED_IN)).toEqual([{ ...SHEET, id: 'abc', origin: 'imported', levels: ['medium', 'hard'] }]);
    expect(query.neq).toHaveBeenCalledExactlyOnceWith('origin', 'catalog');
    expect(query.order).toHaveBeenCalledExactlyOnceWith('created_at', { ascending: false });
  });

  it('erro do banco vira erro de servidor; sem sessão, offline', async () => {
    const { client } = fakeClient({ select: { data: null, error: { message: 'boom' } } });
    await expect(listOwnSongs(client, SIGNED_IN)).rejects.toMatchObject({ kind: 'server' });
    await expect(listOwnSongs(client, { status: 'offline' })).rejects.toMatchObject({ kind: 'offline' });
  });
});

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

  it('useSong com rede guarda no aparelho e a estante de guardadas fica sabendo', async () => {
    const { client } = fakeClient({ rpc: { data: [ROW], error: null } });
    const cache = createSongCache(memorySongStore());
    const { result } = renderHook(() => ({ song: useSong('escala-re-maior', 'easy', client, cache), saved: useSavedSongs(cache) }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.saved.data?.map((s) => s.sheet.id)).toEqual(['escala-re-maior']));
    expect(result.current.song.data?.saved).toBe('saved');
  });
});

const ROW = { ...SHEET_ROW, level: 'easy', format_version: 1, chart: CHART, hash: 'a'.repeat(64) };
const signedIn = async () => SIGNED_IN;

describe('loadSong com o cache do aparelho', () => {
  it('com rede: devolve a do servidor e guarda; de novo com o mesmo hash, não regrava', async () => {
    const { client } = fakeClient({ rpc: { data: [ROW], error: null } });
    const cache = createSongCache(memorySongStore());
    expect((await loadSong(client, signedIn, 'escala-re-maior', 'easy', cache)).saved).toBe('saved');
    expect((await loadSong(client, signedIn, 'escala-re-maior', 'easy', cache)).saved).toBe('unchanged');
  });

  it('com rede e hash novo: troca a guardada', async () => {
    const cache = createSongCache(memorySongStore());
    await loadSong(fakeClient({ rpc: { data: [ROW], error: null } }).client, signedIn, 'escala-re-maior', 'easy', cache);
    const newer = { ...ROW, chart: { ...CHART, bpm: 72 }, hash: 'b'.repeat(64) };
    expect((await loadSong(fakeClient({ rpc: { data: [newer], error: null } }).client, signedIn, 'escala-re-maior', 'easy', cache)).saved).toBe('saved');
    expect(await cache.find('escala-re-maior', 'easy')).toMatchObject({ hash: 'b'.repeat(64), song: { bpm: 72 } });
  });

  it.each([
    ['sem cliente (offline)', null],
    ['servidor fora do ar', fakeClient({ rpc: { data: null, error: { message: 'Failed to fetch' } } }).client],
  ])('%s: usa a guardada', async (_name, offline) => {
    const cache = createSongCache(memorySongStore());
    await loadSong(fakeClient({ rpc: { data: [ROW], error: null } }).client, signedIn, 'escala-re-maior', 'easy', cache);
    const kept = await loadSong(offline, signedIn, 'escala-re-maior', 'easy', cache);
    expect(kept).toMatchObject({ saved: 'device', hash: 'a'.repeat(64), sheet: SHEET });
  });

  it('sem rede e sem guardada: o erro de sempre', async () => {
    await expect(loadSong(null, signedIn, 'escala-re-maior', 'easy', createSongCache(memorySongStore()))).rejects.toMatchObject({ kind: 'offline' });
  });

  it('a música sumiu do servidor: não esconde com a guardada', async () => {
    const cache = createSongCache(memorySongStore());
    await loadSong(fakeClient({ rpc: { data: [ROW], error: null } }).client, signedIn, 'escala-re-maior', 'easy', cache);
    await expect(loadSong(fakeClient({ rpc: { data: [], error: null } }).client, signedIn, 'escala-re-maior', 'easy', cache)).rejects.toMatchObject({
      kind: 'not-found',
    });
  });

  it('cache quebrado (sem espaço, sem IndexedDB): toca do mesmo jeito', async () => {
    const broken = { remember: vi.fn().mockRejectedValue(new Error('quota')), find: vi.fn().mockRejectedValue(new Error('x')), list: vi.fn() };
    const loaded = await loadSong(fakeClient({ rpc: { data: [ROW], error: null } }).client, signedIn, 'escala-re-maior', 'easy', broken);
    expect(loaded).toMatchObject({ saved: null, sheet: SHEET });
    await expect(loadSong(null, signedIn, 'escala-re-maior', 'easy', broken)).rejects.toMatchObject({ kind: 'offline' });
  });
});
