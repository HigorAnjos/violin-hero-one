import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BADGES_STORAGE_KEY } from '../services/badges';
import type { DeviceData } from '../services/deviceData';
import { DRAFT_STORAGE_KEY, loadDraft, saveDraft } from '../services/editorDraft';
import { createEditor, insertNote } from '../game/notation/editor';
import { isOnboarded, loadLocalProfile, ONBOARDED_STORAGE_KEY, PROFILE_STORAGE_KEY } from '../services/profile';
import type { SessionState } from '../services/session';
import { ODE } from '../game/engine/testing';
import { createPlaySync, memoryPlayQueueStore } from '../services/playQueue';
import type { PlayPayload } from '../services/progress';
import { memorySongStore } from '../services/songCache';
import { createDeviceData } from '../services/sync';
import { currentUserId } from '../services/user';
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
    // Nem o use: no sync ele limparia as queries a cada renovação de token
    expect(calls).toEqual([]);
    expect(loadRecords()).toHaveLength(1);
    expect(loadLocalProfile().nickname).toBe('Anon');
  });

  it('aparelho de antes desta versão: o que tem é do usuário da sessão', async () => {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ 'brilha:easy': 900 }));
    const { data, calls } = fakeDevice();
    expect(await adoptUser(profileRpc(), session('u1', true), data)).toBe('first');
    // A primeira sessão vira dona do cache e da fila pela chave de services/user.ts; nada a esquecer
    expect(calls).toEqual([]);
    expect(currentUserId()).toBe('u1');
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

  it('troca de A para B: o rascunho do editor de A sai do aparelho', async () => {
    deviceOf('anon-1');
    saveDraft(insertNote(createEditor({ title: 'Segredo' }), 62).doc, 'anon-1');
    await adoptUser(profileRpc(), session('conta-1'), fakeDevice().data);
    expect(loadDraft('anon-1')).toBeNull();
    expect(Object.keys(localStorage).filter((k) => k.startsWith(DRAFT_STORAGE_KEY))).toEqual([]);
  });

  it('primeira sessão: o rascunho escrito antes dela passa a ser do primeiro dono', async () => {
    saveDraft(insertNote(createEditor({ title: 'Antes do login' }), 62).doc, null);
    await adoptUser(profileRpc(), session('u1', true), fakeDevice().data);
    expect(loadDraft('u1')?.doc.meta.title).toBe('Antes do login');
    expect(loadDraft(null)).toBeNull();
  });

  it('forget falhou (IndexedDB): o aparelho segue do anterior, com o que é dele, e a próxima sessão tenta de novo', async () => {
    deviceOf('anon-1');
    const { data } = fakeDevice();
    vi.mocked(data.forget).mockRejectedValueOnce(new Error('idb'));
    await expect(adoptUser(profileRpc(), session('conta-1'), data)).rejects.toThrow('idb');
    expect(currentUserId()).toBe('anon-1');
    expect(loadRecords()).toHaveLength(1);
    expect(await adoptUser(profileRpc(), session('conta-1'), data)).toBe('switched');
    expect(currentUserId()).toBe('conta-1');
  });

  it('sem rede para o perfil da conta: troca mesmo assim', async () => {
    deviceOf('anon-1');
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'rede' } }) };
    expect(await adoptUser(client, session('conta-1'), fakeDevice().data)).toBe('switched');
    expect(loadLocalProfile()).toEqual({});
    expect(isOnboarded()).toBe(true);
  });
});

describe('adoptUser com o DeviceData do sync', () => {
  function realDevice() {
    const submitted: string[] = [];
    let current: SessionState = session('anon-1', true);
    const sync = createPlaySync({
      store: memoryPlayQueueStore(),
      user: currentUserId,
      session: async () => current,
      submit: async (s, payload) => {
        if (s.status === 'signed-in') submitted.push(`${s.userId}:${payload.client_id}`);
        return { playId: 'p', accuracy: 100, record: null, badges: [], streak: null, duplicate: false };
      },
      chart: async () => ({ hash: 'h', song: ODE }),
      online: () => true,
    });
    const songs = memorySongStore();
    return { sync, songs, submitted, data: createDeviceData(sync, songs), setSession: (s: SessionState) => (current = s) };
  }
  const play = (id: string) => ({ payload: { client_id: id, song_id: 'ode', level: 'easy' } as PlayPayload, chartHash: 'h', checkChart: false });

  it('login noutro aparelho: a fila do convidado sobe na conta dele, a troca esquece o resto e a fila passa a ser da conta', async () => {
    const t = realDevice();
    expect(await adoptUser(null, session('anon-1', true), t.data)).toBe('first');
    await t.sync.enqueue(play('a'));
    await t.songs.put({ userId: 'anon-1', id: 'ode', level: 'easy', hash: 'h', sheet: {} as never, song: ODE, savedAt: 1, openedAt: 1 });
    // Antes do link (sendLoginLink): flush na conta anônima
    await t.data.flush('anon-1');
    expect(t.submitted).toEqual(['anon-1:a']);
    // Partida sem rede depois do link e antes de abrir: fica com o convidado e some na troca, nunca vai para a conta
    await t.sync.enqueue(play('b'));
    t.setSession(session('conta-1'));
    expect(await adoptUser(null, session('conta-1'), t.data)).toBe('switched');
    expect(currentUserId()).toBe('conta-1');
    expect(await t.data.pending('anon-1')).toBe(0);
    expect(await t.songs.all('anon-1')).toEqual([]);
    await t.sync.enqueue(play('c'));
    await t.sync.flush();
    expect(t.submitted).toEqual(['anon-1:a', 'conta-1:c']);
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
