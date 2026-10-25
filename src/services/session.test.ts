import { describe, it, expect, vi } from 'vitest';
import { ensureSession } from './session';

type Auth = Parameters<typeof ensureSession>[0] extends infer C ? NonNullable<C>['auth'] : never;

function fakeClient({ session = null as unknown, signIn = {} as unknown } = {}) {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    signInAnonymously: vi.fn().mockResolvedValue(signIn),
  };
  return { auth: auth as unknown as Auth, spies: auth };
}

describe('ensureSession', () => {
  it('sem cliente configurado, segue offline', async () => {
    expect(await ensureSession(null)).toEqual({ status: 'offline' });
  });

  it('reaproveita a sessão salva sem criar outro usuário', async () => {
    const { auth, spies } = fakeClient({ session: { user: { id: 'u1', is_anonymous: false } } });
    expect(await ensureSession({ auth })).toEqual({ status: 'signed-in', userId: 'u1', anonymous: false });
    expect(spies.signInAnonymously).not.toHaveBeenCalled();
  });

  it('primeiro toque: entra como anônimo, sem cadastro', async () => {
    const { auth, spies } = fakeClient({ signIn: { data: { user: { id: 'anon', is_anonymous: true } }, error: null } });
    expect(await ensureSession({ auth })).toEqual({ status: 'signed-in', userId: 'anon', anonymous: true });
    expect(spies.signInAnonymously).toHaveBeenCalledOnce();
  });

  it('falha ao entrar (sem rede, login anônimo desligado): offline, sem erro', async () => {
    const { auth } = fakeClient({ signIn: { data: { user: null }, error: new Error('network') } });
    expect(await ensureSession({ auth })).toEqual({ status: 'offline' });
  });
});
