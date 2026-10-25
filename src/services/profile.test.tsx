import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  isOnboarded,
  loadLocalProfile,
  markOnboarded,
  normalizeNickname,
  PROFILE_STORAGE_KEY,
  syncProfile,
  useSaveStartProfile,
  type ProfileClient,
  type StartProfile,
} from './profile';

const PROFILE: StartProfile = { level: 'beginner', nickname: 'Lia', animal: 'fox' };

function fakeClient({ error = null as unknown, user = { id: 'u1', is_anonymous: true } } = {}) {
  const eq = vi.fn().mockResolvedValue({ error });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user } }, error: null }),
    signInAnonymously: vi.fn(),
  };
  return { client: { auth, from } as unknown as ProfileClient, from, update, eq };
}

describe('perfil no aparelho', () => {
  afterEach(() => window.localStorage.clear());

  it('apelido segue a regra do banco: aparado, até 24 letras, vazio vira null', () => {
    expect(normalizeNickname('  Lia   Souza ')).toBe('Lia Souza');
    expect(normalizeNickname('   ')).toBeNull();
    expect(normalizeNickname('a'.repeat(30))).toHaveLength(24);
  });

  it('ignora lixo guardado no aparelho', () => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, '{"level":"expert","animal":"dragão","nickname":"  Bia "}');
    expect(loadLocalProfile()).toEqual({ nickname: 'Bia' });
    window.localStorage.setItem(PROFILE_STORAGE_KEY, 'não é json');
    expect(loadLocalProfile()).toEqual({});
  });

  it('marca a primeira vez como feita', () => {
    expect(isOnboarded()).toBe(false);
    markOnboarded();
    expect(isOnboarded()).toBe(true);
  });
});

describe('syncProfile', () => {
  it('sem cliente ou offline, fica só no aparelho', async () => {
    expect(await syncProfile(null, { status: 'offline' }, PROFILE)).toBe(false);
    const { client, from } = fakeClient();
    expect(await syncProfile(client, { status: 'offline' }, PROFILE)).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('com sessão, atualiza o próprio perfil', async () => {
    const { client, from, update, eq } = fakeClient();
    expect(await syncProfile(client, { status: 'signed-in', userId: 'u1', anonymous: true }, PROFILE)).toBe(true);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith(PROFILE);
    expect(eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('erro do banco sobe para a mutação', async () => {
    const { client } = fakeClient({ error: new Error('rls') });
    await expect(syncProfile(client, { status: 'signed-in', userId: 'u1', anonymous: true }, PROFILE)).rejects.toThrow('rls');
  });
});

describe('useSaveStartProfile', () => {
  afterEach(() => window.localStorage.clear());

  it('grava no aparelho e no perfil da sessão', async () => {
    const { client, update } = fakeClient();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSaveStartProfile(client), { wrapper });
    result.current.mutate(PROFILE);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
    expect(update).toHaveBeenCalledWith(PROFILE);
    expect(loadLocalProfile()).toEqual(PROFILE);
  });
});
