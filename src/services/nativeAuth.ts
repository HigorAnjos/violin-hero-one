import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * No celular, o link mágico e o Google voltam para o app por este deep link (app.violinhero://auth/<caminho>), e
 * não para a página: o WebView não lê a volta sozinho como o supabase-js faz na web (detectSessionInUrl). Na lista
 * de redirects do Supabase: app.violinhero://auth/**.
 */
export const NATIVE_AUTH_RETURN = 'app.violinhero://auth';

export type NativeAuthClient = { auth: Pick<SupabaseClient['auth'], 'exchangeCodeForSession' | 'setSession'> };

/** O que a volta traz e não fica no endereço da tela: o código, os tokens e o erro (que volta só no #). */
const AUTH_PARAMS = ['code', 'access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type', 'provider_token', 'provider_refresh_token', 'error', 'error_code', 'error_description'];

/**
 * A volta da conta no celular: troca o código (PKCE) pela sessão, como a web faz na própria página, e devolve o
 * endereço da tela que pediu a conta. Erro (link vencido, troca recusada) volta como #error_code=…, que as telas de
 * conta já leem (authErrorFromUrl). Endereço que não é da conta: null.
 */
export async function completeAuthReturn(client: NativeAuthClient | null, href: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (`${url.protocol}//${url.host}` !== NATIVE_AUTH_RETURN) return null;
  const params = new URLSearchParams(url.search);
  for (const [key, value] of new URLSearchParams(url.hash.slice(1))) params.set(key, value);
  const kept = new URLSearchParams(url.search);
  for (const key of AUTH_PARAMS) kept.delete(key);
  const search = kept.size ? `?${kept}` : '';
  const screen = `${url.pathname || '/'}${search}`;
  const failed = (code: string, description?: string | null) => {
    const hash = new URLSearchParams({ error_code: code, ...(description ? { error_description: description } : {}) });
    return `${screen}#${hash}`;
  };

  const errorCode = params.get('error_code') ?? params.get('error');
  if (errorCode) return failed(errorCode, params.get('error_description'));
  if (!client) return screen;

  const code = params.get('code');
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    return error ? failed(error.code ?? 'unexpected_failure') : screen;
  }
  // Volta do fluxo implícito (tokens no #): a mesma sessão que o supabase-js montaria na web
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    return error ? failed(error.code ?? 'unexpected_failure') : screen;
  }
  return screen;
}
