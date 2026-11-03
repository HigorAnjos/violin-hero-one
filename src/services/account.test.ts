import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AccountError,
  accountErrorKind,
  authErrorFromUrl,
  DELETE_ACCOUNT_FUNCTION,
  deleteAccount,
  fetchAuthProviders,
  linkEmail,
  linkGoogle,
  loginWithGoogle,
  normalizeEmail,
  sendLoginLink,
  signOut,
  unsentBeforeSignOut,
  type AccountClient,
} from './account';
import type { DeviceData } from './deviceData';
import { openExternal } from './platform';
import type { SessionState } from './session';

const platform = vi.hoisted(() => ({ native: false }));
vi.mock('./platform', () => ({ isNative: () => platform.native, openExternal: vi.fn(async () => undefined) }));

afterEach(() => {
  platform.native = false;
  vi.mocked(openExternal).mockClear();
});

const ok = { data: {}, error: null };

function fakeAuth(overrides: Partial<Record<keyof AccountClient['auth'], ReturnType<typeof vi.fn>>> = {}) {
  const auth = {
    updateUser: vi.fn().mockResolvedValue(ok),
    linkIdentity: vi.fn().mockResolvedValue(ok),
    signInWithOtp: vi.fn().mockResolvedValue(ok),
    signInWithOAuth: vi.fn().mockResolvedValue(ok),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    signInAnonymously: vi.fn().mockResolvedValue({ data: { user: { id: 'anon-2', is_anonymous: true } }, error: null }),
    ...overrides,
  };
  return { client: { auth } as unknown as AccountClient, auth };
}

function fakeDevice({ flushFails = false, pending = 0 } = {}) {
  const calls: string[] = [];
  const data: DeviceData = {
    flush: vi.fn(async (id: string) => {
      calls.push(`flush:${id}`);
      if (flushFails) throw new Error('sem rede');
    }),
    forget: vi.fn(async (id: string) => void calls.push(`forget:${id}`)),
    use: vi.fn((id: string) => void calls.push(`use:${id}`)),
    pending: vi.fn(async () => pending),
  };
  return { data, calls };
}

const anon: SessionState = { status: 'signed-in', userId: 'anon-1', anonymous: true };
const account: SessionState = { status: 'signed-in', userId: 'conta-1', anonymous: false, email: 'lia@t.test' };
const rejectsAs = (promise: Promise<unknown>, kind: string) => expect(promise).rejects.toMatchObject({ name: 'AccountError', kind });

describe('criar conta no anônimo (mesmo user id)', () => {
  it('e-mail: updateUser no próprio anônimo, voltando para a tela que pediu', async () => {
    const { client, auth } = fakeAuth();
    await linkEmail(client, '  Lia@T.test ', '/configuracoes?secao=conta');
    expect(auth.updateUser).toHaveBeenCalledWith({ email: 'lia@t.test' }, { emailRedirectTo: `${window.location.origin}/configuracoes?secao=conta` });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('Google: linkIdentity, nunca signInWithOAuth (que criaria outro usuário)', async () => {
    const { client, auth } = fakeAuth();
    await linkGoogle(client, '/');
    expect(auth.linkIdentity).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } });
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('e-mail de outra conta responde igual a e-mail livre: não revela quem tem conta', async () => {
    for (const code of ['email_exists', 'user_already_exists']) {
      const { client } = fakeAuth({ updateUser: vi.fn().mockResolvedValue({ data: {}, error: { code, status: 422 } }) });
      await expect(linkEmail(client, 'lia@t.test', '/')).resolves.toBeUndefined();
    }
  });

  it('e-mail inválido, limite de envios e sem cliente viram mensagens próprias', async () => {
    const { client } = fakeAuth({ updateUser: vi.fn().mockResolvedValue({ data: {}, error: { code: 'over_email_send_rate_limit', status: 429 } }) });
    await rejectsAs(linkEmail(client, 'lia@t.test', '/'), 'wait');
    await rejectsAs(linkEmail(fakeAuth().client, 'lia', '/'), 'invalid-email');
    await rejectsAs(linkEmail(null, 'lia@t.test', '/'), 'offline');
  });
});

describe('entrar numa conta que já existe', () => {
  it('a fila pendente do anônimo sobe antes do link; a conta não nasce por aqui', async () => {
    const { client, auth } = fakeAuth();
    const { data, calls } = fakeDevice();
    auth.signInWithOtp.mockImplementation(async () => {
      calls.push('link');
      return ok;
    });
    await sendLoginLink(client, anon, 'lia@t.test', '/', data);
    expect(calls).toEqual(['flush:anon-1', 'link']);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'lia@t.test', options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` } });
  });

  it('se a fila não sobe, não manda o link (nada do anônimo vai parar na conta de outra pessoa)', async () => {
    const { client, auth } = fakeAuth();
    await rejectsAs(sendLoginLink(client, anon, 'lia@t.test', '/', fakeDevice({ flushFails: true }).data), 'pending');
    await rejectsAs(loginWithGoogle(client, anon, '/', fakeDevice({ flushFails: true }).data), 'pending');
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('e-mail sem conta responde igual a e-mail com conta (e não cria conta): não revela quem tem conta', async () => {
    for (const code of ['otp_disabled', 'user_not_found']) {
      const { client } = fakeAuth({ signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: { code, status: 422 } }) });
      await expect(sendLoginLink(client, anon, 'nova@t.test', '/', fakeDevice().data)).resolves.toBeUndefined();
    }
  });

  it('Google: sobe a fila e vai pelo signInWithOAuth', async () => {
    const { client, auth } = fakeAuth();
    const { data, calls } = fakeDevice();
    await loginWithGoogle(client, anon, '/', data);
    expect(calls).toEqual(['flush:anon-1']);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } });
  });
});

describe('no celular (Capacitor)', () => {
  const GOOGLE = 'https://projeto.supabase.co/auth/v1/authorize?provider=google';

  it('link mágico e criar conta voltam pelo deep link do app, no caminho da tela', async () => {
    platform.native = true;
    const { client, auth } = fakeAuth();
    await sendLoginLink(client, anon, 'lia@t.test', '/', fakeDevice().data);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'lia@t.test', options: { shouldCreateUser: false, emailRedirectTo: 'app.violinhero://auth/' } });
    await linkEmail(client, 'lia@t.test', '/configuracoes?secao=conta');
    expect(auth.updateUser).toHaveBeenCalledWith({ email: 'lia@t.test' }, { emailRedirectTo: 'app.violinhero://auth/configuracoes?secao=conta' });
  });

  it('Google abre no navegador do sistema (o Google barra WebView) e volta pelo deep link', async () => {
    platform.native = true;
    const { client, auth } = fakeAuth({
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: GOOGLE }, error: null }),
      linkIdentity: vi.fn().mockResolvedValue({ data: { url: GOOGLE }, error: null }),
    });
    await loginWithGoogle(client, anon, '/', fakeDevice().data);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'app.violinhero://auth/', skipBrowserRedirect: true } });
    await linkGoogle(client, '/conta');
    expect(auth.linkIdentity).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'app.violinhero://auth/conta', skipBrowserRedirect: true } });
    expect(vi.mocked(openExternal).mock.calls).toEqual([[GOOGLE], [GOOGLE]]);
  });

  it('Google com erro não abre nada', async () => {
    platform.native = true;
    const { client } = fakeAuth({ signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: null }, error: { code: 'x', status: 500 } }) });
    await rejectsAs(loginWithGoogle(client, anon, '/', fakeDevice().data), 'server');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('na web, o supabase-js leva a página: nada de navegador do sistema', async () => {
    const { client } = fakeAuth({ signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: GOOGLE }, error: null }) });
    await loginWithGoogle(client, anon, '/', fakeDevice().data);
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe('sair da conta', () => {
  it('com a fila enviada, nada a perder', async () => {
    expect(await unsentBeforeSignOut(account, fakeDevice().data)).toBe(0);
  });

  it('sem rede, conta o que sair agora descartaria', async () => {
    expect(await unsentBeforeSignOut(account, fakeDevice({ flushFails: true, pending: 2 }).data)).toBe(2);
  });

  it('esquece o usuário no aparelho, sai só deste aparelho e volta como convidado novo', async () => {
    const { client, auth } = fakeAuth();
    const { data, calls } = fakeDevice();
    expect(await signOut(client, account, data)).toEqual({ status: 'signed-in', userId: 'anon-2', anonymous: true });
    expect(calls).toEqual(['forget:conta-1']);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('auth não deixou sair: nada é esquecido e o erro sobe', async () => {
    const { client } = fakeAuth({ signOut: vi.fn().mockResolvedValue({ error: { status: 0, name: 'AuthRetryableFetchError' } }) });
    const { data, calls } = fakeDevice();
    await rejectsAs(signOut(client, account, data), 'offline');
    expect(calls).toEqual([]);
  });

  it('sem rede para o convidado novo: offline', async () => {
    const { client } = fakeAuth({ signInAnonymously: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('rede') }) });
    expect(await signOut(client, account, fakeDevice().data)).toEqual({ status: 'offline' });
  });
});

describe('apagar a conta', () => {
  function withFunction(result: { data?: unknown; error: unknown }) {
    const { client, auth } = fakeAuth();
    const invoke = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error });
    return { client: { ...client, functions: { invoke } } as never, auth, invoke };
  }

  it('o servidor apaga; o aparelho esquece o usuário e volta como convidado novo', async () => {
    const { client, auth, invoke } = withFunction({ data: { deleted: true }, error: null });
    const { data, calls } = fakeDevice();
    expect(await deleteAccount(client, account, data)).toEqual({ status: 'signed-in', userId: 'anon-2', anonymous: true });
    expect(invoke).toHaveBeenCalledWith(DELETE_ACCOUNT_FUNCTION, { method: 'POST' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    // A fila do aparelho não sobe: era desta conta
    expect(calls).toEqual(['forget:conta-1']);
  });

  it('convidado também apaga os dados', async () => {
    const { client } = withFunction({ data: { deleted: true }, error: null });
    const { data, calls } = fakeDevice();
    await deleteAccount(client, anon, data);
    expect(calls).toEqual(['forget:anon-1']);
  });

  it('conta de aluno (403): student, e nada é esquecido', async () => {
    const { client, auth } = withFunction({ error: { name: 'FunctionsHttpError', context: { status: 403 } } });
    const { data, calls } = fakeDevice();
    await rejectsAs(deleteAccount(client, account, data), 'student');
    expect(new AccountError('student').message).toMatch(/professor/);
    expect(calls).toEqual([]);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('sem rede: offline; erro do servidor: server; nada é esquecido', async () => {
    const { data, calls } = fakeDevice();
    await rejectsAs(deleteAccount(withFunction({ error: { name: 'FunctionsFetchError' } }).client, account, data), 'offline');
    await rejectsAs(deleteAccount(withFunction({ error: { name: 'FunctionsHttpError', context: { status: 500 } } }).client, account, data), 'server');
    await rejectsAs(deleteAccount(null, account, data), 'offline');
    expect(calls).toEqual([]);
  });
});

describe('provedores e erros', () => {
  it('o botão do Google depende do auth do projeto (external.google)', async () => {
    const answer = (google: boolean) => vi.fn().mockResolvedValue(new Response(JSON.stringify({ external: { google, email: true } })));
    expect(await fetchAuthProviders('http://x', 'k', answer(true))).toEqual({ google: true });
    expect(await fetchAuthProviders('http://x', 'k', answer(false))).toEqual({ google: false });
    expect(await fetchAuthProviders('', '', answer(true))).toEqual({ google: false });
    expect(await fetchAuthProviders('http://x', 'k', vi.fn().mockRejectedValue(new TypeError('rede')))).toEqual({ google: false });
  });

  it('códigos do auth e da volta do link', () => {
    expect(accountErrorKind({ name: 'AuthRetryableFetchError', status: 0 })).toBe('offline');
    expect(accountErrorKind({ code: 'over_email_send_rate_limit', status: 429 })).toBe('wait');
    expect(accountErrorKind({ code: 'unexpected', status: 500 })).toBe('server');
    expect(authErrorFromUrl('http://x/#error=access_denied&error_code=otp_expired')).toBe('expired');
    expect(authErrorFromUrl('http://x/?error_code=identity_already_exists')).toBe('google-taken');
    expect(authErrorFromUrl('http://x/perfil')).toBeNull();
    expect(new AccountError('pending').message).toMatch(/ainda não subiram/);
  });

  it('e-mail normalizado', () => {
    expect(normalizeEmail(' A@B.co ')).toBe('a@b.co');
    expect(normalizeEmail('a b@c.d')).toBeNull();
  });
});
