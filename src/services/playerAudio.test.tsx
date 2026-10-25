import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { saveLatency } from '../game/audio';
import { addEarnedBadges, BADGES_STORAGE_KEY, loadEarnedBadges } from './badges';
import { A4_STORAGE_KEY, clampA4, loadA4, needsCalibration, saveA4, syncCalibration, useSaveCalibration } from './playerAudio';
import type { ProfileClient } from './profile';

function fakeClient() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1', is_anonymous: true } } }, error: null }),
    signInAnonymously: vi.fn(),
  };
  return { client: { auth, from } as unknown as ProfileClient, update, eq };
}

afterEach(() => localStorage.clear());

describe('Lá de referência no aparelho', () => {
  it('padrão 442, guarda a escolha e recusa fora da faixa do banco', () => {
    expect(loadA4()).toBe(442);
    saveA4(440);
    expect(loadA4()).toBe(440);
    localStorage.setItem(A4_STORAGE_KEY, '900');
    expect(loadA4()).toBe(442);
    expect(clampA4(400)).toBe(415);
    expect(clampA4(Number.NaN)).toBe(442);
  });
});

describe('needsCalibration', () => {
  it('pede calibrar quando este par entrada>saída não tem medida local', () => {
    expect(needsCalibration('mic>fone')).toBe(true);
    saveLatency({ latencySeconds: 0.12, confidence: 0.9, measuredAt: '' }, 'mic>fone');
    expect(needsCalibration('mic>fone')).toBe(false);
    expect(needsCalibration('mic>caixa')).toBe(true);
  });
});

describe('syncCalibration', () => {
  it('grava a4_hz e latency_ms (inteiro) no perfil da sessão', async () => {
    const { client, update, eq } = fakeClient();
    await syncCalibration(client, { status: 'signed-in', userId: 'u1', anonymous: true }, { a4: 443, latencySeconds: 0.1424 });
    expect(update).toHaveBeenCalledWith({ a4_hz: 443, latency_ms: 142 });
    expect(eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('sem resultado confiável só o Lá vai; offline não grava', async () => {
    const { client, update } = fakeClient();
    await syncCalibration(client, { status: 'signed-in', userId: 'u1', anonymous: true }, { a4: 442 });
    expect(update).toHaveBeenCalledWith({ a4_hz: 442 });
    expect(await syncCalibration(null, { status: 'offline' }, { a4: 442 })).toBe(false);
  });

  it('o hook guarda o Lá no aparelho antes de sincronizar', async () => {
    const { client, update } = fakeClient();
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useSaveCalibration(client), { wrapper });
    result.current.mutate({ a4: 415, latencySeconds: 0.2 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(loadA4()).toBe(415);
    expect(update).toHaveBeenCalledWith({ a4_hz: 415, latency_ms: 200 });
  });
});

describe('selos conquistados', () => {
  it('soma sem repetir e ignora ids desconhecidos', () => {
    addEarnedBadges(['primeira-musica']);
    addEarnedBadges(['primeira-musica', 'combo-25']);
    expect(loadEarnedBadges()).toEqual(['primeira-musica', 'combo-25']);
    localStorage.setItem(BADGES_STORAGE_KEY, '["combo-25","dragão",3]');
    expect(loadEarnedBadges()).toEqual(['combo-25']);
  });
});
