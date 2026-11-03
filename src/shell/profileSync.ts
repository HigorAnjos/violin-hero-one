import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { publicNameKey } from '../services/profile';
import { PROFILE_QUERY_KEY, syncProfileNow, type ProfileSyncClient } from '../services/profileSync';
import { supabase } from '../services/supabase';
import { sessionQuery } from './deviceSync';
import { useThemeChoice } from './ThemeChoice';

/**
 * O perfil do servidor no aparelho: sobe o pendente e traz o resto. Uma vez por visita, de novo quando a rede volta
 * (reconnect) ou quando o tema muda. Sem servidor, null e o aparelho segue como está.
 */
export function useRemoteProfile(client: ProfileSyncClient | null = supabase) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: async () => {
      const row = await syncProfileNow(client, await sessionQuery(queryClient)());
      // O bicho pendente pode ter subido agora, com número novo (0021): o nome público é relido
      if (row) void queryClient.invalidateQueries({ queryKey: publicNameKey });
      return row;
    },
    staleTime: Infinity,
    retry: false,
    // Sem rede a sessão cai para Offline e devolve null na hora: pausar a query deixaria a primeira tela em branco
    networkMode: 'always',
  });
}

/** Aplica o tema que veio do servidor e sobe o escolhido no aparelho. Fica dentro do ThemeChoiceProvider. */
export const ProfileSync: React.FC<{ client?: ProfileSyncClient | null }> = ({ client = supabase }) => {
  const queryClient = useQueryClient();
  const { theme, setThemeId } = useThemeChoice();
  const remote = useRemoteProfile(client).data?.theme_id;
  const synced = React.useRef<string | null>(null);
  // setThemeId muda a cada tema: só o valor do servidor dispara a aplicação
  const apply = React.useRef(setThemeId);
  React.useEffect(() => {
    apply.current = setThemeId;
  });

  React.useEffect(() => {
    if (!remote) return;
    synced.current = remote;
    apply.current(remote, 'server');
  }, [remote]);

  React.useEffect(() => {
    if (synced.current === null || synced.current === theme.id) return;
    synced.current = theme.id;
    void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
  }, [theme.id, queryClient]);

  return null;
};
