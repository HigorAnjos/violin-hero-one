import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DEVICE_DB_NAME, deviceDb, done, PLAYS_STORE, SONGS_STORE } from './deviceDb';
import { indexedDbPlayQueueStore } from './playQueue';
import { indexedDbSongStore } from './songCache';

/** O banco como a versão 1 do app deixava: músicas por (id, nível), sem dono e sem fila. */
async function versionOne(factory: IDBFactory) {
  const open = factory.open(DEVICE_DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(SONGS_STORE, { keyPath: ['id', 'level'] });
  const db = await done(open);
  await done(db.transaction(SONGS_STORE, 'readwrite').objectStore(SONGS_STORE).put({ id: 'greensleeves', level: 'easy', hash: 'a' }));
  db.close();
}

describe('IndexedDB do aparelho', () => {
  it('v1 com músicas no formato antigo abre na v2 sem erro: músicas vazias e a fila nasce', async () => {
    const factory = new IDBFactory();
    await versionOne(factory);
    const run = deviceDb(factory);
    expect(await indexedDbSongStore(run).all('')).toEqual([]);
    expect(await run(SONGS_STORE, 'readonly', (s) => s.count())).toBe(0);
    expect(await indexedDbPlayQueueStore(run).all('u1')).toEqual([]);
    expect(await run(PLAYS_STORE, 'readonly', (s) => s.count())).toBe(0);
  });

  it('banco novo nasce com os dois stores', async () => {
    const run = deviceDb(new IDBFactory());
    expect(await run(SONGS_STORE, 'readonly', (s) => s.count())).toBe(0);
    expect(await run(PLAYS_STORE, 'readonly', (s) => s.count())).toBe(0);
  });
});
