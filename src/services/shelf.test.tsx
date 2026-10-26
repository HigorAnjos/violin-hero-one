import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FIXED_SONGS } from '../game/notation/songs';
import { catalogShelf, EMBEDDED_SHELF, embeddedChart, offlineShelf, savedCount, usePlayableSong, useShelf } from './shelf';
import { createSongCache, memorySongStore, type SavedSong } from './songCache';
import type { CatalogEntry, SongsClient } from './songs';

const ENTRY: CatalogEntry = {
  id: 'greensleeves',
  title: 'Greensleeves',
  composer: 'Tradicional',
  bpm: 90,
  timeSignature: { beats: 3, unit: 4 },
  key: 'A minor',
  durationSeconds: 70,
  origin: 'catalog',
  levels: ['easy', 'medium', 'hard'],
};

function fakeClient({ select = { data: [] as unknown, error: null as unknown }, rpc = { data: [] as unknown, error: null as unknown } } = {}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(select).then(resolve, reject),
  };
  for (const fn of [query.select, query.eq, query.not, query.order]) fn.mockReturnValue(query);
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1', is_anonymous: true } } }, error: null }),
    signInAnonymously: vi.fn(),
  };
  return { auth, from: vi.fn().mockReturnValue(query), rpc: vi.fn().mockResolvedValue(rpc) } as unknown as SongsClient;
}

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const row = (entry: CatalogEntry) => ({
  id: entry.id,
  title: entry.title,
  composer: entry.composer,
  bpm: String(entry.bpm),
  time_beats: entry.timeSignature.beats,
  time_unit: entry.timeSignature.unit,
  key: entry.key,
  duration_seconds: String(entry.durationSeconds),
  origin: 'catalog',
  song_charts: entry.levels.map((level) => ({ level })),
});

describe('estante', () => {
  it('as embutidas tocam só no Fácil e sem internet', () => {
    expect(EMBEDDED_SHELF.map((s) => s.id)).toEqual(FIXED_SONGS.map((s) => s.id));
    for (const song of EMBEDDED_SHELF) {
      expect(song).toMatchObject({ levels: ['easy'], embedded: true });
      expect(song.durationSeconds).toBeGreaterThan(0);
    }
  });

  it('música do catálogo que também vem no app fica marcada como embutida', () => {
    const shelf = catalogShelf([ENTRY, { ...ENTRY, id: FIXED_SONGS[0].id }]);
    expect(shelf.map((s) => s.embedded)).toEqual([false, true]);
    expect(shelf[0]).toMatchObject({ title: 'Greensleeves', levels: ['easy', 'medium', 'hard'] });
  });

  it('embutida só substitui o banco no nível que ela tem', () => {
    const { id } = FIXED_SONGS[0];
    expect(embeddedChart(id, 'easy')).toBe(FIXED_SONGS[0].song);
    expect(embeddedChart(id, 'hard')).toBeUndefined();
    expect(embeddedChart('greensleeves', 'easy')).toBeUndefined();
  });

  it('useShelf: com banco, o catálogo; sem cliente, as embutidas com o motivo', async () => {
    const online = renderHook(() => useShelf(fakeClient({ select: { data: [row(ENTRY)], error: null } })), { wrapper: wrapper() });
    expect(online.result.current.status).toBe('loading');
    await waitFor(() => expect(online.result.current.status).toBe('ready'));
    expect(online.result.current).toMatchObject({ fallback: false, songs: [{ id: 'greensleeves' }] });

    const offline = renderHook(() => useShelf(null), { wrapper: wrapper() });
    await waitFor(() => expect(offline.result.current.status).toBe('ready'));
    expect(offline.result.current).toMatchObject({ fallback: true, reason: 'offline', songs: EMBEDDED_SHELF });
  });

  it('usePlayableSong: sem rede, a embutida do nível; sem embutida, o erro em português', async () => {
    const fixed = renderHook(() => usePlayableSong(FIXED_SONGS[1].id, 'easy', null), { wrapper: wrapper() });
    await waitFor(() => expect(fixed.result.current.status).toBe('ready'));
    expect(fixed.result.current).toMatchObject({ song: FIXED_SONGS[1].song, embedded: true });

    const missing = renderHook(() => usePlayableSong('greensleeves', 'medium', null), { wrapper: wrapper() });
    await waitFor(() => expect(missing.result.current.status).toBe('error'));
    expect(missing.result.current).toMatchObject({ error: { kind: 'offline', message: expect.stringMatching(/Sem conexão/) } });
  });

  it('offlineShelf: as embutidas, com os níveis já baixados, e depois as baixadas', () => {
    const saved: SavedSong[] = [
      { sheet: ENTRY, levels: ['medium', 'hard'] },
      { sheet: { ...ENTRY, id: FIXED_SONGS[0].id, title: FIXED_SONGS[0].song.title }, levels: ['hard'] },
    ];
    const shelf = offlineShelf(saved);
    expect(shelf.map((s) => s.id)).toEqual([...FIXED_SONGS.map((s) => s.id), 'greensleeves']);
    expect(shelf[0]).toMatchObject({ embedded: true, saved: true, levels: ['easy', 'hard'] });
    expect(shelf[1]).toMatchObject({ embedded: true, saved: false, levels: ['easy'] });
    expect(shelf.at(-1)).toMatchObject({ title: 'Greensleeves', embedded: false, saved: true, levels: ['medium', 'hard'] });
  });

  it('savedCount: embutida com outro nível guardado continua do app', () => {
    const onlyEmbedded = offlineShelf([{ sheet: { ...ENTRY, id: FIXED_SONGS[0].id }, levels: ['hard'] }]);
    expect(onlyEmbedded[0].saved).toBe(true);
    expect(savedCount(onlyEmbedded)).toBe(0);
    expect(savedCount(offlineShelf([{ sheet: ENTRY, levels: ['easy'] }]))).toBe(1);
  });

  it('catalogShelf marca as baixadas', () => {
    const shelf = catalogShelf([ENTRY, { ...ENTRY, id: 'jingle-bells' }], [{ sheet: ENTRY, levels: ['easy'] }]);
    expect(shelf.map((s) => s.saved)).toEqual([true, false]);
  });

  it('sem rede: a estante traz as baixadas e a baixada toca no nível guardado', async () => {
    const cache = createSongCache(memorySongStore());
    const chart = { ...FIXED_SONGS[0].song, id: 'greensleeves', level: 'medium' as const };
    await cache.remember({ sheet: ENTRY, song: chart, hash: 'a'.repeat(64) }, 'medium');

    const shelf = renderHook(() => useShelf(null, cache), { wrapper: wrapper() });
    await waitFor(() => expect(shelf.result.current.status).toBe('ready'));
    expect(shelf.result.current).toMatchObject({ fallback: true, songs: expect.arrayContaining([expect.objectContaining({ id: 'greensleeves', saved: true, levels: ['medium'] })]) });

    const playable = renderHook(() => usePlayableSong('greensleeves', 'medium', null, cache), { wrapper: wrapper() });
    await waitFor(() => expect(playable.result.current.status).toBe('ready'));
    expect(playable.result.current).toMatchObject({ embedded: false, song: { id: 'greensleeves', level: 'medium' } });
  });

  it('usePlayableSong: com banco, a partitura do get_song', async () => {
    const chart = { ...FIXED_SONGS[0].song, level: 'hard' as const };
    const client = fakeClient({ rpc: { data: [{ ...row(ENTRY), level: 'hard', format_version: 1, chart, hash: 'a'.repeat(64) }], error: null } });
    const { result } = renderHook(() => usePlayableSong('escala-re-maior', 'hard', client), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ embedded: false, song: { level: 'hard' } });
  });
});
