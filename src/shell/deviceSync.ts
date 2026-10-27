import React from 'react';
import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { setDeviceData } from '../services/deviceData';
import type { PlaySync } from '../services/playQueue';
import { PROFILE_QUERY_KEY } from '../services/profileSync';
import { progressKeys } from '../services/progress';
import { songStore } from '../services/songCache';
import { ensureSession, type SessionState } from '../services/session';
import { songKeys, type LoadedSong } from '../services/songs';
import { supabase } from '../services/supabase';
import { createDeviceData, playSync, setSessionSource } from '../services/sync';

/** A mesma query do SessionStatus: dois logins anônimos ao mesmo tempo criariam dois usuários. */
export const sessionQuery = (queryClient: QueryClient) => () =>
  queryClient.fetchQuery({ queryKey: ['session'], queryFn: () => ensureSession(supabase), staleTime: Infinity });

/** Sem pedido nenhum, a fila confere de tempos em tempos (o recuo manda mais cedo quando há o que esperar). */
export const IDLE_CHECK_MS = 60_000;

/**
 * A rede voltou (ou a aba voltou ao foco): a sessão que tinha caído para Offline tenta de novo, as queries que
 * falharam também, a música aberta do aparelho confere o hash no servidor e a fila sobe. Sem recarregar.
 */
export async function reconnect(queryClient: QueryClient, sync: PlaySync = playSync, session = sessionQuery(queryClient)): Promise<void> {
  const state = queryClient.getQueryState<SessionState>(['session']);
  if (state && (state.status === 'error' || state.data?.status === 'offline')) {
    await queryClient.invalidateQueries({ queryKey: ['session'] });
    await session().catch(() => undefined);
  }
  await Promise.all([
    queryClient.refetchQueries({ predicate: (q) => q.state.status === 'error' && q.queryKey[0] !== 'session' }),
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'songs' && q.queryKey[1] === 'song' && (q.state.data as { saved?: string } | undefined)?.saved === 'device',
    }),
    // O perfil sobe o que mudou sem rede e traz o do servidor
    queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY }),
  ]);
  await sync.flush().catch(() => undefined);
}

/** Troca de usuário: o que a memória do app guardava do anterior (baixadas, músicas abertas, progresso, perfil) sai. */
export function forgetUserQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: songKeys.saved });
  queryClient.removeQueries({ queryKey: ['songs', 'song'] });
  queryClient.removeQueries({ queryKey: progressKeys.all });
  queryClient.removeQueries({ queryKey: PROFILE_QUERY_KEY });
}

/**
 * Liga a sincronização na shell: registra o DeviceData para a troca de conta, aponta a fila para a sessão do app e
 * sobe as partidas pendentes na abertura, ao voltar a rede, no foco e no recuo da fila.
 */
export function useDeviceSync(sync: PlaySync = playSync): void {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    setSessionSource(sessionQuery(queryClient));
    setDeviceData(createDeviceData(sync, songStore, () => forgetUserQueries(queryClient)));
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (alive) timer = setTimeout(run, sync.nextDelay() ?? IDLE_CHECK_MS);
    };
    const run = () => void reconnect(queryClient, sync).finally(schedule);
    const onVisible = () => document.visibilityState === 'visible' && run();
    const offOnline = onlineManager.subscribe((online) => online && run());
    // Partida que o servidor aceitou: selos, sequência e recordes da conta mudaram
    const offOutcome = sync.subscribe(() => void queryClient.invalidateQueries({ queryKey: progressKeys.all }));
    addEventListener('focus', run);
    document.addEventListener('visibilitychange', onVisible);
    void sync.flush().catch(() => undefined).finally(schedule);
    return () => {
      alive = false;
      clearTimeout(timer);
      offOnline();
      offOutcome();
      removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVisible);
      setDeviceData(null);
    };
  }, [queryClient, sync]);
}

/** O chart que a partida tocou, pela query da música: com hash do banco ou do aparelho (que pode ter ficado velho). */
export function playedChart(queryClient: QueryClient, id: string, level: LoadedSong['song']['level']) {
  const loaded = queryClient.getQueryData<LoadedSong & { saved?: string | null }>(songKeys.song(id, level));
  return { chartHash: loaded?.hash ?? null, checkChart: !loaded || loaded.saved === 'device' };
}
