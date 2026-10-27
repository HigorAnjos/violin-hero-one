import { useQuery } from '@tanstack/react-query';
import { fetchAuthProviders, type AuthProviders } from '../services/account';
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
