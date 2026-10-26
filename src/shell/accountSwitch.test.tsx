import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BADGES_STORAGE_KEY } from '../services/badges';
import type { DeviceData } from '../services/deviceData';
import { isOnboarded, loadLocalProfile, ONBOARDED_STORAGE_KEY, PROFILE_STORAGE_KEY } from '../services/profile';
import type { SessionState } from '../services/session';
import { adoptUser, DEVICE_USER_STORAGE_KEY, useAccountWatch } from './accountSwitch';
import { loadRecords, RECORDS_STORAGE_KEY } from './records';

function fakeDevice() {
  const calls: string[] = [];
  const data: DeviceData = {
    flush: vi.fn(async () => undefined),
    forget: vi.fn(async (id: string) => void calls.push(`forget:${id}`)),
    use: vi.fn((id: string) => void calls.push(`use:${id}`)),
    pending: vi.fn(async () => 0),
  };
  return { data, calls };
}

const profileRpc = (row: unknown = { level: 'some_songs', nickname: 'Lia', animal: 'fox' }) => ({ rpc: vi.fn().mockResolvedValue({ data: row, error: null }) });
const session = (userId: string, anonymous = false): SessionState => ({ status: 'signed-in', userId, anonymous });

function deviceOf(userId: string) {
  localStorage.setItem(DEVICE_USER_STORAGE_KEY, userId);
  localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ 'brilha:easy': 900 }));
  localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(['primeira-musica']));
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ level: 'never', nickname: 'Anon', animal: 'cat' }));
}

beforeEach(() => localStorage.clear());

describe('adoptUser', () => {
  it('anônimo que virou conta (mesmo user id): nada some do aparelho', async () => {
    deviceOf('u1');
    const { data, calls } = fakeDevice();
    expect(await adoptUser(profileRpc(), session('u1'), data)).toBe('same');
    expect(calls).toEqual(['use:u1']);
    expect(loadRecords()).toHaveLength(1);
    expect(loadLocalProfile().nickname).toBe('Anon');
  });

  it('aparelho de antes desta versão: o que tem é do usuário da sessão', async () => {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ 'brilha:easy': 900 }));
    const { data, calls } = fakeDevice();
    expect(await adoptUser(profileRpc(), session('u1', true), data)).toBe('first');
    expect(calls).toEqual(['use:u1']);
    expect(loadRecords()).toHaveLength(1);
    expect(localStorage.getItem(DEVICE_USER_STORAGE_KEY)).toBe('u1');
  });

  it('entrou noutra conta: esquece o anônimo e traz o perfil da conta', async () => {
    deviceOf('anon-1');
    const { data, calls } = fakeDevice();
    const client = profileRpc();
    expect(await adoptUser(client, session('conta-1'), data)).toBe('switched');
    expect(calls).toEqual(['forget:anon-1', 'use:conta-1']);
    expect(loadRecords()).toEqual([]);
    expect(localStorage.getItem(BADGES_STORAGE_KEY)).toBeNull();
    expect(client.rpc).toHaveBeenCalledWith('ensure_my_profile');
    expect(loadLocalProfile()).toEqual({ level: 'some_songs', nickname: 'Lia', animal: 'fox' });
    expect(isOnboarded()).toBe(true);
  });

  it('saiu e virou convidado novo: aparelho limpo, sem perfil de ninguém', async () => {
    deviceOf('conta-1');
    localStorage.setItem(ONBOARDED_STORAGE_KEY, '1');
    const client = profileRpc();
    expect(await adoptUser(client, session('anon-2', true), fakeDevice().data)).toBe('switched');
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
    expect(client.rpc).not.toHaveBeenCalled();
    // Já passou pelo onboarding neste aparelho: o convidado novo cai na tela inicial
    expect(isOnboarded()).toBe(true);
  });

  it('sem rede para o perfil da conta: troca mesmo assim', async () => {
    deviceOf('anon-1');
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'rede' } }) };
    expect(await adoptUser(client, session('conta-1'), fakeDevice().data)).toBe('switched');
    expect(loadLocalProfile()).toEqual({});
  });
});

describe('useAccountWatch', () => {
  function setup(cached: SessionState) {
    let emit: (event: string, s: unknown) => void = () => undefined;
    const unsubscribe = vi.fn();
    const client = {
      auth: {
        onAuthStateChange: vi.fn((cb: typeof emit) => {
          emit = cb;
          return { data: { subscription: { unsubscribe } } };
        }),
      },
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const queryClient = new QueryClient();
    queryClient.setQueryData(['session'], cached);
    queryClient.setQueryData(['progress', 'records'], [{ songId: 'x', level: 'easy', score: 1 }]);
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useAccountWatch(client as never), { wrapper });
    return { emit: (s: unknown) => emit('SIGNED_IN', s), queryClient, hook, unsubscribe };
  }

  it('link aberto noutra aba trocou o usuário: sessão nova e progresso antigo fora da memória', async () => {
    localStorage.setItem(DEVICE_USER_STORAGE_KEY, 'anon-1');
    const { emit, queryClient } = setup(session('anon-1', true));
    emit({ user: { id: 'conta-1', is_anonymous: false, email: 'lia@t.test' } });
    await waitFor(() => expect(queryClient.getQueryData(['progress', 'records'])).toBeUndefined());
    expect(localStorage.getItem(DEVICE_USER_STORAGE_KEY)).toBe('conta-1');
  });

  it('anônimo confirmou o e-mail: mesma pessoa, a sessão só passa a dizer conta', async () => {
    localStorage.setItem(DEVICE_USER_STORAGE_KEY, 'u1');
    const { emit, queryClient } = setup(session('u1', true));
    emit({ user: { id: 'u1', is_anonymous: false, email: 'lia@t.test' } });
    await waitFor(() => expect(queryClient.getQueryData(['session'])).toEqual({ status: 'signed-in', userId: 'u1', anonymous: false, email: 'lia@t.test' }));
    expect(queryClient.getQueryData(['progress', 'records'])).toHaveLength(1);
  });

  it('desmontou: para de ouvir', () => {
    const { hook, unsubscribe } = setup(session('u1'));
    hook.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
