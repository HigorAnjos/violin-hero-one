import type { SupabaseClient } from '@supabase/supabase-js';

export type SessionState =
  | { status: 'offline' }
  | { status: 'signed-in'; userId: string; anonymous: boolean };

export type AuthClient = Pick<SupabaseClient['auth'], 'getSession' | 'signInAnonymously'>;

/**
 * Todo jogador é um usuário do Supabase desde o primeiro toque: sem sessão salva, entra como
 * anônimo (sem cadastro). Criar conta depois só liga e-mail ou Google ao mesmo usuário.
 * Sem cliente ou sem rede, o jogo segue offline.
 */
export async function ensureSession(client: { auth: AuthClient } | null): Promise<SessionState> {
  if (!client) return { status: 'offline' };
  const { data: current } = await client.auth.getSession();
  let user = current.session?.user;
  if (!user) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.user) return { status: 'offline' };
    user = data.user;
  }
  return { status: 'signed-in', userId: user.id, anonymous: user.is_anonymous ?? false };
}
