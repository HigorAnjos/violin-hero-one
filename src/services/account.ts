import type { SupabaseClient } from '@supabase/supabase-js';
import { deviceData, type DeviceData } from './deviceData';
import { signedIn, type SessionState } from './session';

/**
 * Conta opcional. Criar conta liga e-mail ou Google ao MESMO usuário anônimo (o id não muda: partidas, recordes,
 * selos, sequência e perfil ficam onde estão). Entrar numa conta que já existe troca o usuário do aparelho; o que o
 * anônimo tinha pendente sobe antes, na conta anônima, e nunca vai para a conta de outra pessoa.
 * E-mail só serve para o login: não vai para perfil, ranking nem para outro jogador.
 */
export type AccountClient = {
  auth: Pick<SupabaseClient['auth'], 'updateUser' | 'linkIdentity' | 'signInWithOtp' | 'signInWithOAuth' | 'signOut' | 'signInAnonymously'>;
};

export type AccountErrorKind = 'invalid-email' | 'taken' | 'no-account' | 'google-taken' | 'expired' | 'wait' | 'pending' | 'offline' | 'server';

const MESSAGES: Record<AccountErrorKind, string> = {
  expired: 'Esse link venceu ou já foi usado. Peça outro.',
  'invalid-email': 'Esse e-mail não parece certo. Confira e tente de novo.',
  taken: 'Esse e-mail já tem uma conta. Você pode entrar nela.',
  'no-account': 'Não achamos conta com esse e-mail. Para criar uma, comece a tocar e salve o progresso depois.',
  'google-taken': 'Essa conta Google já é de outro jogador. Entre por ela na tela de entrada.',
  wait: 'Muitos pedidos seguidos. Espere um minuto e tente de novo.',
  pending: 'As partidas deste aparelho ainda não subiram. Conecte à internet e tente de novo.',
  offline: 'Sem conexão. A conta precisa de internet.',
  server: 'Não foi possível falar com o servidor agora. Tente de novo em instantes.',
};

/** Erro com mensagem pronta para a tela; a causa original fica em `cause`. */
export class AccountError extends Error {
  readonly kind: AccountErrorKind;

  constructor(kind: AccountErrorKind, cause?: unknown) {
    super(MESSAGES[kind], { cause });
    this.name = 'AccountError';
    this.kind = kind;
  }
}

/** Códigos do GoTrue (error_code); sem código ou status 0, a requisição nem chegou. */
export function accountErrorKind(error: { code?: string; status?: number; name?: string }): AccountErrorKind {
  switch (error.code) {
    case 'email_exists':
    case 'user_already_exists':
      return 'taken';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'invalid-email';
    case 'otp_disabled':
    case 'user_not_found':
      return 'no-account';
    case 'identity_already_exists':
      return 'google-taken';
    case 'otp_expired':
      return 'expired';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'wait';
  }
  if (error.name === 'AuthRetryableFetchError' || !error.status) return 'offline';
  return 'server';
}

function fail(error: { code?: string; status?: number; name?: string } | null): void {
  if (error) throw new AccountError(accountErrorKind(error), error);
}

/** Mesma regra frouxa do navegador: algo@algo.algo, sem espaço. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Endereço completo para onde o link mágico e o Google voltam (o caminho da tela que pediu a conta). */
export function returnUrl(path: string, origin: string = window.location.origin): string {
  return new URL(path, origin).toString();
}

function requireEmail(raw: string): string {
  const email = normalizeEmail(raw);
  if (!email) throw new AccountError('invalid-email');
  return email;
}

function requireClient(client: AccountClient | null): AccountClient {
  if (!client) throw new AccountError('offline');
  return client;
}

/** Criar conta pelo e-mail: o anônimo ganha o e-mail quando abrir o link (mesmo user id). */
export async function linkEmail(client: AccountClient | null, raw: string, back: string): Promise<void> {
  const db = requireClient(client);
  const { error } = await db.auth.updateUser({ email: requireEmail(raw) }, { emailRedirectTo: returnUrl(back) });
  fail(error);
}

/** Criar conta pelo Google: o navegador vai ao Google e volta em `back` com o mesmo user id. */
export async function linkGoogle(client: AccountClient | null, back: string): Promise<void> {
  const db = requireClient(client);
  const { error } = await db.auth.linkIdentity({ provider: 'google', options: { redirectTo: returnUrl(back) } });
  fail(error);
}

/** Antes de trocar de usuário: a fila do anônimo sobe na conta anônima; sem conseguir, nada de trocar. */
async function flushBeforeSwitch(session: SessionState, data: DeviceData): Promise<void> {
  if (session.status !== 'signed-in') return;
  try {
    await data.flush(session.userId);
  } catch (cause) {
    throw new AccountError('pending', cause);
  }
}

/** Entrar numa conta que já existe (outro aparelho): manda o link mágico; conta nova não nasce por aqui. */
export async function sendLoginLink(client: AccountClient | null, session: SessionState, raw: string, back: string, data: DeviceData = deviceData()): Promise<void> {
  const db = requireClient(client);
  const email = requireEmail(raw);
  await flushBeforeSwitch(session, data);
  const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: returnUrl(back) } });
  fail(error);
}

/** Entrar com Google numa conta que já existe. */
export async function loginWithGoogle(client: AccountClient | null, session: SessionState, back: string, data: DeviceData = deviceData()): Promise<void> {
  const db = requireClient(client);
  await flushBeforeSwitch(session, data);
  const { error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl(back) } });
  fail(error);
}

/** Antes de sair: tenta subir a fila; o que não subiu é o que sair agora descartaria. */
export async function unsentBeforeSignOut(session: SessionState, data: DeviceData = deviceData()): Promise<number> {
  if (session.status !== 'signed-in') return 0;
  try {
    await data.flush(session.userId);
    return 0;
  } catch {
    return data.pending(session.userId);
  }
}

/**
 * Sair da conta: o aparelho esquece o usuário (cache e fila) e volta a ser um convidado novo. Só nesta sessão do
 * aparelho (scope local): os outros aparelhos da conta continuam conectados. Devolve a sessão anônima nova.
 */
export async function signOut(client: AccountClient | null, session: SessionState, data: DeviceData = deviceData()): Promise<SessionState> {
  const db = requireClient(client);
  // Sai primeiro: se o auth falhar, o aparelho segue na conta com a fila e o cache intactos
  const { error } = await db.auth.signOut({ scope: 'local' });
  fail(error);
  if (session.status === 'signed-in') await data.forget(session.userId);
  const fresh = await db.auth.signInAnonymously();
  if (fresh.error || !fresh.data.user) return { status: 'offline' };
  return signedIn(fresh.data.user);
}

/** Provedores ligados no projeto, lidos do próprio auth (GET /auth/v1/settings, público com a chave anon). */
export interface AuthProviders {
  google: boolean;
}

export async function fetchAuthProviders(url: string, anonKey: string, fetcher: typeof fetch = fetch): Promise<AuthProviders> {
  if (!url || !anonKey) return { google: false };
  try {
    const res = await fetcher(new URL('/auth/v1/settings', url), { headers: { apikey: anonKey } });
    if (!res.ok) return { google: false };
    const body = (await res.json()) as { external?: Record<string, unknown> };
    return { google: body.external?.google === true };
  } catch {
    return { google: false };
  }
}

/** Erro que o auth devolve na volta do Google ou do link (#error_code=… ou ?error_code=…), se houver. */
export function authErrorFromUrl(href: string): AccountErrorKind | null {
  const url = new URL(href);
  const params = new URLSearchParams(url.hash.slice(1));
  const code = params.get('error_code') ?? url.searchParams.get('error_code');
  if (!code) return null;
  return accountErrorKind({ code, status: 400 });
}
