import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '../assets/styles/themes';
import { loadA4 } from './playerAudio';
import { isOnboarded, loadLocalProfile, saveLocalProfile } from './profile';
import { loadPending, markProfilePending, clearProfilePending } from './profilePending';
import { readProfileRow, syncProfileNow, type ProfileSyncClient } from './profileSync';
import type { SessionState } from './session';

const SIGNED_IN: SessionState = { status: 'signed-in', userId: 'u1', anonymous: true };
const ROW = { id: 'u1', nickname: 'Lia', animal: 'cat', level: 'some_songs', a4_hz: '440.00', latency_ms: 120, theme_id: 'palco' };

function fakeClient(row: object = ROW, { updateError = null as unknown } = {}) {
  const eq = vi.fn().mockResolvedValue({ error: updateError });
  const update = vi.fn().mockReturnValue({ eq });
  const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
  return { client: { from: vi.fn().mockReturnValue({ update }), rpc } as unknown as ProfileSyncClient, update, eq, rpc };
}

describe('perfil do servidor no aparelho', () => {
  afterEach(() => localStorage.clear());

  it('aparelho novo: o perfil puxado vira o local e pula o onboarding', async () => {
    const { client, rpc, update } = fakeClient();
    expect(isOnboarded()).toBe(false);
    await syncProfileNow(client, SIGNED_IN);
    expect(rpc).toHaveBeenCalledWith('ensure_my_profile');
    expect(update).not.toHaveBeenCalled();
    expect(loadLocalProfile()).toEqual({ level: 'some_songs', nickname: 'Lia', animal: 'cat' });
    expect(loadA4()).toBe(440);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('palco');
    expect(isOnboarded()).toBe(true);
  });

  it('perfil sem nível (nunca passou do onboarding): continua indo para o onboarding', async () => {
    await syncProfileNow(fakeClient({ ...ROW, level: null }).client, SIGNED_IN);
    expect(isOnboarded()).toBe(false);
  });

  it('o que mudou sem rede sobe antes e não é sobrescrito pelo servidor', async () => {
    saveLocalProfile({ level: 'beginner', nickname: null, animal: 'fox' });
    markProfilePending({ level: 'beginner', animal: 'fox', theme_id: 'neon' });
    const { client, update, eq } = fakeClient();
    await syncProfileNow(client, SIGNED_IN);
    expect(update).toHaveBeenCalledWith({ level: 'beginner', animal: 'fox', theme_id: 'neon' });
    expect(eq).toHaveBeenCalledWith('id', 'u1');
    expect(loadPending()).toEqual({});
  });

  it('pendente que não subiu (erro) fica para a próxima e o aparelho não muda', async () => {
    saveLocalProfile({ level: 'beginner', nickname: null, animal: 'fox' });
    markProfilePending({ level: 'beginner' });
    await expect(syncProfileNow(fakeClient(ROW, { updateError: { message: 'sem rede' } }).client, SIGNED_IN)).rejects.toBeTruthy();
    expect(loadPending()).toEqual({ level: 'beginner' });
    expect(loadLocalProfile().level).toBe('beginner');
  });

  it('sem sessão ou sem cliente: nada muda', async () => {
    const { client, rpc } = fakeClient();
    expect(await syncProfileNow(client, { status: 'offline' })).toBeNull();
    expect(await syncProfileNow(null, SIGNED_IN)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a pendência só sai com o valor que foi enviado', () => {
    markProfilePending({ a4_hz: 440 });
    markProfilePending({ a4_hz: 443 });
    clearProfilePending({ a4_hz: 440 });
    expect(loadPending()).toEqual({ a4_hz: 443 });
  });

  it('linha do banco com lixo vira vazio', () => {
    expect(readProfileRow({ animal: 'dragão', level: 'expert', a4_hz: 'x', theme_id: '' })).toEqual({
      nickname: null,
      animal: null,
      level: null,
      a4_hz: 442,
      latency_ms: null,
      theme_id: null,
    });
  });
});
