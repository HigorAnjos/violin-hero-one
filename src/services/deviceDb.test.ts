import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { BY_USER, DEVICE_DB_NAME, deviceDb, done, PLAYS_STORE, RECORDINGS_STORE, SONGS_STORE } from './deviceDb';
import { indexedDbPlayQueueStore } from './playQueue';
import { indexedDbRecordingQueueStore } from './recordingUpload';
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

  it('banco novo nasce com os três stores', async () => {
    const run = deviceDb(new IDBFactory());
    expect(await run(SONGS_STORE, 'readonly', (s) => s.count())).toBe(0);
    expect(await run(PLAYS_STORE, 'readonly', (s) => s.count())).toBe(0);
    expect(await run(RECORDINGS_STORE, 'readonly', (s) => s.count())).toBe(0);
  });

  it('v2 abre na v3 com músicas e fila de partidas intactas e a fila de gravações nova', async () => {
    const factory = new IDBFactory();
    const open = factory.open(DEVICE_DB_NAME, 2);
    open.onupgradeneeded = () => {
      open.result.createObjectStore(SONGS_STORE, { keyPath: ['userId', 'id', 'level'] }).createIndex(BY_USER, 'userId');
      open.result.createObjectStore(PLAYS_STORE, { keyPath: ['userId', 'clientId'] }).createIndex(BY_USER, 'userId');
    };
    const v2 = await done(open);
    await done(v2.transaction(SONGS_STORE, 'readwrite').objectStore(SONGS_STORE).put({ userId: 'u1', id: 'greensleeves', level: 'easy' }));
    await done(v2.transaction(PLAYS_STORE, 'readwrite').objectStore(PLAYS_STORE).put({ userId: 'u1', clientId: 'c1' }));
    v2.close();
    const run = deviceDb(factory);
    expect(await run(SONGS_STORE, 'readonly', (s) => s.count())).toBe(1);
    expect(await run(PLAYS_STORE, 'readonly', (s) => s.count())).toBe(1);
    expect(await indexedDbRecordingQueueStore(run).all('u1')).toEqual([]);
  });
});
