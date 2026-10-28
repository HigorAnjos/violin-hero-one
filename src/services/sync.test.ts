import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createPlaySync, memoryPlayQueueStore, PlaySyncError } from './playQueue';
import type { PlayOutcome, PlayPayload } from './progress';
import { createRecordingUploads, memoryRecordingQueueStore, memoryUploadTarget, RecordingUploadError } from './recordingUpload';
import type { SessionState } from './session';
import { memorySongStore } from './songCache';
import { createDeviceData, usePlayOutcome } from './sync';
import { currentUserId, USER_STORAGE_KEY } from './user';
import { ODE } from '../game/engine/testing';

const OUTCOME: PlayOutcome = { playId: 'p1', accuracy: 90, record: null, badges: [], streak: null, duplicate: false };

function setup(user = 'anon') {
  let session: SessionState = { status: 'signed-in', userId: user, anonymous: true };
  let owner: string | null = user;
  const store = memoryPlayQueueStore();
  const submit = vi.fn(async () => OUTCOME);
  const sync = createPlaySync({
    store,
    user: () => owner,
    session: async () => session,
    submit,
    chart: async () => ({ hash: 'h', song: ODE }),
    online: () => true,
  });
  const songs = memorySongStore();
  const target = memoryUploadTarget();
  const uploads = createRecordingUploads({
    store: memoryRecordingQueueStore(),
    user: () => owner,
    session: async () => session,
    target: () => target,
    online: () => true,
  });
  return {
    sync,
    store,
    songs,
    submit,
    uploads,
    target,
    data: createDeviceData(sync, songs, undefined, uploads),
    setSession: (s: SessionState) => (session = s),
    setOwner: (u: string) => (owner = u),
  };
}

const recording = (id: string) => ({ id, blob: new Blob(['som']), mimeType: 'audio/mp4', durationMs: 1000, meta: {} });

const play = (id: string) => ({ payload: { client_id: id, song_id: 'ode', level: 'easy' } as PlayPayload, chartHash: 'h', checkChart: false });

describe('DeviceData da sincronização', () => {
  it('flush sobe a fila do usuário e, com sessão de outro, lança com o que ficou', async () => {
    const t = setup();
    await t.sync.enqueue(play('a'));
    expect(await t.data.pending('anon')).toBe(1);
    t.setSession({ status: 'signed-in', userId: 'conta', anonymous: false });
    await expect(t.data.flush('anon')).rejects.toBeInstanceOf(PlaySyncError);
    t.setSession({ status: 'signed-in', userId: 'anon', anonymous: true });
    await t.data.flush('anon');
    expect(await t.data.pending('anon')).toBe(0);
  });

  it('forget apaga a fila e as músicas só daquele usuário; use troca o dono', async () => {
    const t = setup();
    await t.sync.enqueue(play('a'));
    await t.songs.put({ userId: 'anon', id: 'ode', level: 'easy', hash: 'h', sheet: {} as never, song: ODE, savedAt: 1, openedAt: 1 });
    await t.songs.put({ userId: 'outro', id: 'ode', level: 'easy', hash: 'h', sheet: {} as never, song: ODE, savedAt: 1, openedAt: 1 });
    await t.data.forget('anon');
    expect(await t.data.pending('anon')).toBe(0);
    expect(await t.songs.all('anon')).toEqual([]);
    expect(await t.songs.all('outro')).toHaveLength(1);
    t.data.use('conta');
    expect(currentUserId()).toBe('conta');
    localStorage.removeItem(USER_STORAGE_KEY);
  });

  it('gravação que não subiu segura a troca de conta, conta no pendente e some no forget', async () => {
    const t = setup();
    t.target.fail('offline');
    await t.uploads.enqueue(recording('e1'));
    await t.sync.enqueue(play('a'));
    expect(await t.data.pending('anon')).toBe(2);
    await expect(t.data.flush('anon')).rejects.toBeInstanceOf(RecordingUploadError);
    // A partida subiu mesmo com a gravação presa
    expect(await t.sync.pending('anon')).toBe(0);
    await t.data.forget('anon');
    expect(await t.data.pending('anon')).toBe(0);
    expect(t.target.files.size).toBe(0);
  });

  it('flush sobe a gravação na conta do dono', async () => {
    const t = setup();
    t.target.fail('offline');
    await t.uploads.enqueue(recording('e1'));
    t.target.fail(null);
    await t.data.flush('anon');
    expect([...t.target.files.keys()]).toEqual(['anon/e1']);
  });
});

describe('usePlayOutcome', () => {
  it('aparece quando o servidor responde', async () => {
    const t = setup();
    const { result } = renderHook(() => usePlayOutcome('a', t.sync));
    expect(result.current).toBeUndefined();
    await t.sync.enqueue(play('a'));
    await act(() => t.sync.flush());
    expect(result.current).toEqual(OUTCOME);
  });
});
