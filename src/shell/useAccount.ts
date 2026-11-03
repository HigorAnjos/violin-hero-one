import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { AccountError, authErrorFromUrl, fetchAuthProviders, type AuthProviders } from '../services/account';
import { ensureSession, type AuthClient } from '../services/session';
import { supabase, supabaseAnonKey, supabaseUrl } from '../services/supabase';

/** A sessão das telas (a mesma query ['session'] do SessionStatus). Erro de rede vira offline. */
export function useSession(client: { auth: AuthClient } | null = supabase) {
  const query = useQuery({ queryKey: ['session'], queryFn: () => ensureSession(client), staleTime: Infinity });
  return query.isError ? { status: 'offline' as const } : query.data;
}

/**
 * O botão do Google só aparece com o provedor ligado no projeto do Supabase: lido do próprio auth
 * (GET /auth/v1/settings), sem variável de build. Sem resposta, só e-mail.
 */
export function useAuthProviders(load: () => Promise<AuthProviders> = () => fetchAuthProviders(supabaseUrl, supabaseAnonKey)): AuthProviders {
  const { data } = useQuery({ queryKey: ['auth-providers'], queryFn: load, staleTime: Infinity, retry: false });
  return data ?? { google: false };
}

/**
 * O erro da volta da conta (#error_code=…), para a tela mostrar. Na web ele chega com a página nova (a tela lê na
 * montagem); no celular o deep link troca só o # da tela que já está aberta (nativeAuthReturn), e é por aqui que
 * ela fica sabendo.
 */
export function useAuthReturnError(show: (message: string) => void): void {
  const { pathname, search, hash } = useLocation();
  const [seen, setSeen] = React.useState(hash);
  if (hash !== seen) {
    setSeen(hash);
    const kind = authErrorFromUrl(new URL(`${pathname}${search}${hash}`, window.location.origin).toString());
    if (kind) show(new AccountError(kind).message);
  }
}
