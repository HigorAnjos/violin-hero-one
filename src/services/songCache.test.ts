import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { songDurationSeconds, type Level } from '../game/notation/song';
import { createSongCache, indexedDbSongStore, memorySongStore, type SongStore } from './songCache';
import type { LoadedSong } from './songs';
import { fakeChart } from './testing';

function loaded(id: string, level: Level, hash = 'a'.repeat(64), title?: string): LoadedSong {
  const song = fakeChart(id, level);
  return {
    sheet: {
      id,
      title: title ?? song.title,
      composer: 'Tradicional',
      bpm: song.bpm,
      timeSignature: song.timeSignature,
      key: song.key,
      durationSeconds: songDurationSeconds(song),
      origin: 'catalog',
    },
    song,
    hash,
  };
}

/** Relógio que anda 1 ms a cada leitura: dá ordem às aberturas. */
function clock() {
  let t = 1000;
  return () => ++t;
}

describe.each([
  ['memória', () => memorySongStore()],
  ['IndexedDB', () => indexedDbSongStore(new IDBFactory())],
])('cache das músicas (%s)', (_name, makeStore: () => SongStore) => {
  it('guarda a música aberta e devolve a mesma sem rede', async () => {
    const cache = createSongCache(makeStore());
    const greensleeves = loaded('greensleeves', 'medium');
    expect(await cache.remember(greensleeves, 'medium')).toBe('saved');
    expect(await cache.find('greensleeves', 'medium')).toEqual(greensleeves);
    expect(await cache.find('greensleeves', 'hard')).toBeUndefined();
    expect(await cache.find('jingle-bells', 'medium')).toBeUndefined();
  });

  it('mesmo hash: não regrava o chart, só marca a abertura', async () => {
    const store = makeStore();
    const cache = createSongCache(store, { now: clock() });
    await cache.remember(loaded('greensleeves', 'easy'), 'easy');
    const first = await store.get('', 'greensleeves', 'easy');
    const put = vi.spyOn(store, 'put');
    expect(await cache.remember(loaded('greensleeves', 'easy'), 'easy')).toBe('unchanged');
    const again = await store.get('', 'greensleeves', 'easy');
    expect(again?.savedAt).toBe(first?.savedAt);
    expect(again?.openedAt).toBeGreaterThan(first!.openedAt);
    expect(put).toHaveBeenCalledWith({ ...first, openedAt: again?.openedAt });
  });

  it('hash novo: troca o chart guardado', async () => {
    const cache = createSongCache(makeStore(), { now: clock() });
    await cache.remember(loaded('greensleeves', 'easy', 'a'.repeat(64)), 'easy');
    const newer = loaded('greensleeves', 'easy', 'b'.repeat(64), 'Greensleeves (revisada)');
    newer.song = { ...newer.song, bpm: newer.song.bpm + 10 };
    expect(await cache.remember(newer, 'easy')).toBe('saved');
    const found = await cache.find('greensleeves', 'easy');
    expect(found?.hash).toBe('b'.repeat(64));
    expect(found?.song.bpm).toBe(newer.song.bpm);
    expect(found?.sheet.title).toBe('Greensleeves (revisada)');
  });

  it('passou do limite: saem as abertas há mais tempo', async () => {
    const cache = createSongCache(makeStore(), { limit: 2, now: clock() });
    await cache.remember(loaded('greensleeves', 'easy'), 'easy');
    await cache.remember(loaded('jingle-bells', 'easy'), 'easy');
    // Abrir de novo a primeira a deixa como a mais recente
    await cache.remember(loaded('greensleeves', 'easy'), 'easy');
    await cache.remember(loaded('canon', 'easy'), 'easy');
    expect(await cache.find('jingle-bells', 'easy')).toBeUndefined();
    expect(await cache.find('greensleeves', 'easy')).toBeDefined();
    expect(await cache.find('canon', 'easy')).toBeDefined();
  });

  it('a estante offline: uma linha por música, com os níveis guardados em ordem', async () => {
    const cache = createSongCache(makeStore(), { now: clock() });
    await cache.remember(loaded('greensleeves', 'hard'), 'hard');
    await cache.remember(loaded('greensleeves', 'easy', 'a'.repeat(64), 'Greensleeves novo nome'), 'easy');
    await cache.remember(loaded('jingle-bells', 'medium'), 'medium');
    const list = await cache.list();
    expect(list.map((s) => [s.sheet.id, s.levels])).toEqual(
      expect.arrayContaining([
        ['greensleeves', ['easy', 'hard']],
        ['jingle-bells', ['medium']],
      ])
    );
    expect(list).toHaveLength(2);
    expect(list.find((s) => s.sheet.id === 'greensleeves')?.sheet.title).toBe('Greensleeves novo nome');
  });

  it('partitura guardada num formato que o app não lê mais: some do cache', async () => {
    const store = makeStore();
    const cache = createSongCache(store);
    const old = loaded('greensleeves', 'easy');
    await cache.remember({ ...old, song: { ...old.song, formatVersion: 0 } as unknown as typeof old.song }, 'easy');
    expect(await cache.find('greensleeves', 'easy')).toBeUndefined();
    expect(await store.all('')).toEqual([]);
  });

  it('cada usuário vê só as músicas dele; apagar um não mexe no outro', async () => {
    const store = makeStore();
    let user = 'ana';
    const cache = createSongCache(store, { user: () => user });
    await cache.remember(loaded('greensleeves', 'easy'), 'easy');
    user = 'bia';
    expect(await cache.find('greensleeves', 'easy')).toBeUndefined();
    expect(await cache.list()).toEqual([]);
    await cache.remember(loaded('canon', 'easy'), 'easy');
    await store.clear('bia');
    expect(await cache.list()).toEqual([]);
    user = 'ana';
    expect((await cache.list()).map((s) => s.sheet.id)).toEqual(['greensleeves']);
  });
});
