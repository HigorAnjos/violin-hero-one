import { describe, expect, it, vi } from 'vitest';
import { authErrorFromUrl } from './account';
import { completeAuthReturn, type NativeAuthClient } from './nativeAuth';

function fakeClient(error: { code?: string } | null = null) {
  const auth = {
    exchangeCodeForSession: vi.fn().mockResolvedValue({ data: {}, error }),
    setSession: vi.fn().mockResolvedValue({ data: {}, error }),
  };
  return { client: { auth } as unknown as NativeAuthClient, auth };
}

describe('completeAuthReturn', () => {
  it('troca o código pela sessão e devolve a tela que pediu a conta', async () => {
    const { client, auth } = fakeClient();
    expect(await completeAuthReturn(client, 'app.violinhero://auth/conta?motivo=ranking&code=abc')).toBe('/conta?motivo=ranking');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('sem caminho, a raiz', async () => {
    const { client } = fakeClient();
    expect(await completeAuthReturn(client, 'app.violinhero://auth?code=abc')).toBe('/');
    expect(await completeAuthReturn(client, 'app.violinhero://auth/?code=abc')).toBe('/');
  });

  it('tokens prontos no # (outro site ou app tentando pôr o aparelho na conta dele): ignorados, sem sessão', async () => {
    const { client, auth } = fakeClient();
    expect(await completeAuthReturn(client, 'app.violinhero://auth/conta#access_token=a&refresh_token=r&expires_in=3600&type=magiclink')).toBe('/conta');
    expect(await completeAuthReturn(client, 'app.violinhero://auth/?access_token=a&refresh_token=r')).toBe('/');
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('link vencido: a tela abre com o erro no #, que as telas de conta já leem', async () => {
    const { client, auth } = fakeClient();
    const screen = await completeAuthReturn(client, 'app.violinhero://auth/entrar#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');
    expect(screen).toBe('/entrar#error_code=otp_expired&error_description=Email+link+is+invalid');
    expect(authErrorFromUrl(`https://localhost${screen}`)).toBe('expired');
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('erro no ?: também vai para o #', async () => {
    const { client } = fakeClient();
    expect(await completeAuthReturn(client, 'app.violinhero://auth/entrar?error=access_denied')).toBe('/entrar#error_code=access_denied');
  });

  it('troca recusada (código vencido, outro aparelho): a tela abre com o erro', async () => {
    const { client } = fakeClient({ code: 'flow_state_expired' });
    const screen = await completeAuthReturn(client, 'app.violinhero://auth/entrar?code=velho');
    expect(screen).toBe('/entrar#error_code=flow_state_expired');
    expect(authErrorFromUrl(`https://localhost${screen}`)).toBe('server');
  });

  it('sem cliente (build sem backend): só abre a tela', async () => {
    expect(await completeAuthReturn(null, 'app.violinhero://auth/conta?code=abc')).toBe('/conta');
  });

  it('endereço que não é da conta: null, sem tocar no auth', async () => {
    const { client, auth } = fakeClient();
    expect(await completeAuthReturn(client, 'app.violinhero://outra/coisa?code=abc')).toBeNull();
    expect(await completeAuthReturn(client, 'https://violin-hero-one.vercel.app/?code=abc')).toBeNull();
    expect(await completeAuthReturn(client, 'não é endereço')).toBeNull();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
