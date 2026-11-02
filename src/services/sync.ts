import React from 'react';
import type { DeviceData } from './deviceData';
import { createPlaySync, indexedDbPlayQueueStore, memoryPlayQueueStore, type PlaySync } from './playQueue';
import { forgetProfilePending } from './profilePending';
import { submitPlay, type PlayOutcome } from './progress';
import {
  createRecordingUploads,
  indexedDbRecordingQueueStore,
  memoryRecordingQueueStore,
  type RecordingUploads,
  type UploadTarget,
} from './recordingUpload';
import { ensureSession, type SessionState } from './session';
import { songCache, songStore } from './songCache';
import { getSong } from './songs';
import { supabase } from './supabase';
import { currentUserId, rememberUser } from './user';

/** De onde a fila tira a sessão: a shell troca pela query ['session'] (a mesma do SessionStatus). */
let sessionSource: () => Promise<SessionState> = () => ensureSession(supabase);

export function setSessionSource(source: () => Promise<SessionState>): void {
  sessionSource = source;
}

/** A fila do app: no IndexedDB do aparelho; sem ele (jsdom, aba anônima de alguns navegadores), na memória da visita. */
export const playSync: PlaySync = createPlaySync({
  store: typeof indexedDB === 'undefined' ? memoryPlayQueueStore() : indexedDbPlayQueueStore(indexedDB),
  user: currentUserId,
  session: () => sessionSource(),
  submit: (session, payload) => submitPlay(supabase, session, payload),
  async chart(session, songId, level) {
    const loaded = await getSong(supabase, session, songId, level);
    // A próxima partida sem rede já sai com o chart novo
    await songCache?.remember(loaded, level).catch(() => null);
    return loaded;
  },
});

/** Para onde as gravações das entregas sobem; null até o Storage do ciclo 5 existir (a fila só guarda). */
let uploadTarget: UploadTarget | null = null;

export function setUploadTarget(target: UploadTarget | null): void {
  uploadTarget = target;
}

/** A fila de gravações do app, como a de partidas: no IndexedDB do aparelho, por usuário. */
export const recordingUploads: RecordingUploads = createRecordingUploads({
  store: typeof indexedDB === 'undefined' ? memoryRecordingQueueStore() : indexedDbRecordingQueueStore(indexedDB),
  user: currentUserId,
  session: () => sessionSource(),
  target: () => uploadTarget,
});

/** O que o aparelho guarda de cada usuário, para a troca de conta (contrato em deviceData.ts). */
export function createDeviceData(
  sync: PlaySync = playSync,
  songs = songStore,
  onUse: (userId: string) => void = () => {},
  uploads: RecordingUploads = recordingUploads,
): DeviceData {
  return {
    async flush(userId) {
      // As duas filas tentam; a primeira que ficou com algo decide o erro
      const [plays, recordings] = await Promise.allSettled([sync.flush(userId, { strict: true }), uploads.flush(userId, { strict: true })]);
      for (const outcome of [plays, recordings]) if (outcome.status === 'rejected') throw outcome.reason;
    },
    async forget(userId) {
      forgetProfilePending(userId);
      await Promise.all([sync.forget(userId), uploads.forget(userId), songs?.clear(userId)]);
    },
    use(userId) {
      rememberUser(userId);
      onUse(userId);
      void sync.flush().catch(() => undefined);
      void uploads.flush().catch(() => undefined);
    },
    // Uma entrega que não subiu também é perdida ao sair
    pending: async (userId) => (await sync.pending(userId)) + (await uploads.pending(userId)),
  };
}

/** O que o servidor confirmou para a partida (recorde, selos); undefined enquanto não respondeu ou sem servidor. */
export function usePlayOutcome(clientId: string | undefined, sync: PlaySync = playSync): PlayOutcome | undefined {
  return React.useSyncExternalStore(
    sync.subscribe,
    () => (clientId ? sync.outcome(clientId) : undefined),
  );
}
