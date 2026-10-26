import React from 'react';
import type { DeviceData } from './deviceData';
import { createPlaySync, indexedDbPlayQueueStore, memoryPlayQueueStore, type PlaySync } from './playQueue';
import { submitPlay, type PlayOutcome } from './progress';
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

/** O que o aparelho guarda de cada usuário, para a troca de conta (contrato em deviceData.ts). */
export function createDeviceData(sync: PlaySync = playSync, songs = songStore): DeviceData {
  return {
    flush: (userId) => sync.flush(userId, { strict: true }),
    async forget(userId) {
      await Promise.all([sync.forget(userId), songs?.clear(userId)]);
    },
    use(userId) {
      rememberUser(userId);
      void sync.flush().catch(() => undefined);
    },
    pending: (userId) => sync.pending(userId),
  };
}

/** O que o servidor confirmou para a partida (recorde, selos); undefined enquanto não respondeu ou sem servidor. */
export function usePlayOutcome(clientId: string | undefined, sync: PlaySync = playSync): PlayOutcome | undefined {
  return React.useSyncExternalStore(
    sync.subscribe,
    () => (clientId ? sync.outcome(clientId) : undefined),
  );
}
