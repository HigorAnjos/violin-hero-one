import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { BADGES_STORAGE_KEY } from '../services/badges';
import { deviceData, type DeviceData } from '../services/deviceData';
import { markOnboarded, PROFILE_STORAGE_KEY, saveLocalProfile, type Animal, type StartProfile } from '../services/profile';
import { progressKeys } from '../services/progress';
import { signedIn, type SessionState } from '../services/session';
import { supabase } from '../services/supabase';
import { currentUserId, rememberUser, USER_STORAGE_KEY } from '../services/user';
import { RECORDS_STORAGE_KEY } from './records';

/** De quem é o que o aparelho guarda: a mesma chave do cache e da fila da sincronização (services/user.ts). */
export const DEVICE_USER_STORAGE_KEY = USER_STORAGE_KEY;

/** O que é do jogador e não do aparelho: some na troca de usuário. Tema, Lá, latência e ajustes ficam. */
export const PER_USER_KEYS = [RECORDS_STORAGE_KEY, BADGES_STORAGE_KEY, PROFILE_STORAGE_KEY] as const;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export type SwitchOutcome = 'same' | 'first' | 'switched';

type ProfileRow = { level: StartProfile['level'] | null; nickname: string | null; animal: string | null };

/** O perfil da conta que entrou vira o perfil local (apelido, bicho e nível são dela, não do anônimo que estava aqui). */
async function pullProfile(client: { rpc: SupabaseClient['rpc'] }): Promise<void> {
  const { data, error } = await client.rpc('ensure_my_profile');
  if (error || !data) return;
  const row = data as ProfileRow;
  if (row.level) saveLocalProfile({ level: row.level, nickname: row.nickname, animal: (row.animal as Animal | null) ?? null });
}

/**
 * O aparelho passa a ser do usuário da sessão. Mesmo usuário (inclusive o anônimo que acabou de ganhar e-mail ou
 * Google): nada muda. Usuário novo (entrou noutra conta, ou saiu e virou convidado novo): o aparelho esquece o
 * anterior (cache, fila, recordes, selos e perfil locais) e, se for conta, traz o perfil dela do servidor.
 */
export async function adoptUser(client: { rpc: SupabaseClient['rpc'] } | null, session: SessionState, data: DeviceData = deviceData()): Promise<SwitchOutcome> {
  if (session.status !== 'signed-in') return 'same';
  // Mesmo usuário (renovação do token, e-mail confirmado no anônimo): cache e fila já são dele
  if (currentUserId() === session.userId) return 'same';
  // Primeira sessão no aparelho (ou aparelho de antes desta versão): o que está nele é desse usuário
  const previous = rememberUser(session.userId);
  if (!previous) return 'first';
  await data.forget(previous);
  for (const key of PER_USER_KEYS) storage()?.removeItem(key);
  data.use(session.userId);
  if (!session.anonymous) {
    // Conta que já existe já jogou: o aparelho novo vai direto para a tela inicial
    markOnboarded();
    if (client) await pullProfile(client).catch(() => undefined);
  }
  return 'switched';
}

type WatchClient = { auth: Pick<SupabaseClient['auth'], 'onAuthStateChange'>; rpc: SupabaseClient['rpc'] };

/**
 * Acompanha a sessão do auth: link mágico aberto (nesta aba ou noutra), volta do Google, sair da conta. A query
 * ['session'] passa a ser a do usuário novo; trocou de usuário, o progresso em memória é jogado fora.
 */
export function useAccountWatch(client: WatchClient | null = supabase): void {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (!client) return;
    let chain = Promise.resolve();
    const { data } = client.auth.onAuthStateChange((_event, authSession) => {
      if (!authSession) return;
      const next = signedIn(authSession.user);
      // Fora do callback: chamar o supabase dentro dele trava o auth (aviso do supabase-js)
      setTimeout(() => {
        chain = chain
          .then(async () => {
            const outcome = await adoptUser(client, next);
            const cached = queryClient.getQueryData<SessionState>(['session']);
            queryClient.setQueryData(['session'], next);
            const otherUser = cached?.status === 'signed-in' && cached.userId !== (next.status === 'signed-in' ? next.userId : null);
            if (outcome === 'switched' || otherUser) {
              queryClient.removeQueries({ queryKey: progressKeys.all });
              await queryClient.invalidateQueries();
            }
          })
          .catch(() => undefined);
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [client, queryClient]);
}
