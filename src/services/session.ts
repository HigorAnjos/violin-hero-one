import type { SupabaseClient } from '@supabase/supabase-js';

export type SessionState =
  | { status: 'offline' }
  /** `email`: só o próprio jogador vê (Configurações › Conta); nunca vai para outro jogador. */
  | { status: 'signed-in'; userId: string; anonymous: boolean; email?: string };

export type AuthClient = Pick<SupabaseClient['auth'], 'getSession' | 'signInAnonymously'>;

/** O estado da sessão para um usuário do Supabase. */
export function signedIn(user: { id: string; is_anonymous?: boolean; email?: string }): SessionState {
  return { status: 'signed-in', userId: user.id, anonymous: user.is_anonymous ?? false, ...(user.email ? { email: user.email } : {}) };
}

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
  // O dono do cache e da fila (vh:usuario) é gravado pelo adoptUser da conta, na primeira sessão e em toda troca
  return signedIn(user);
}
