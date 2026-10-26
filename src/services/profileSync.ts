import type { SupabaseClient } from '@supabase/supabase-js';
import { PLAYER_LEVELS, type PlayerLevel } from '../game/engine/levels';
import { THEME_STORAGE_KEY } from '../assets/styles/themes';
import { clampA4, saveA4 } from './playerAudio';
import { ANIMALS, loadLocalProfile, markOnboarded, normalizeNickname, saveLocalProfile, type Animal } from './profile';
import { clearProfilePending, loadPending, type ProfileFields } from './profilePending';
import type { SessionState } from './session';

/** Linha do banco limpa: valor fora das regras do app vira vazio. */
export function readProfileRow(row: Record<string, unknown>): ProfileFields {
  return {
    nickname: typeof row.nickname === 'string' ? normalizeNickname(row.nickname) : null,
    animal: ANIMALS.includes(row.animal as Animal) ? (row.animal as Animal) : null,
    level: PLAYER_LEVELS.includes(row.level as PlayerLevel) ? (row.level as PlayerLevel) : null,
    a4_hz: clampA4(Number(row.a4_hz)),
    latency_ms: typeof row.latency_ms === 'number' ? row.latency_ms : null,
    theme_id: typeof row.theme_id === 'string' && row.theme_id ? row.theme_id : null,
  };
}

/**
 * O perfil do servidor vira o do aparelho (fonte da verdade com sessão), menos o que ainda está pendente. Nível
 * escolhido no servidor quer dizer que o onboarding já foi feito em algum aparelho: este pula. A latência fica de fora:
 * vale por par entrada>saída do aparelho (playerAudio.needsCalibration).
 */
export function applyProfile(row: ProfileFields): void {
  const pending = loadPending();
  const local = loadLocalProfile();
  const pick = <K extends 'level' | 'nickname' | 'animal'>(key: K, current: ProfileFields[K] | undefined): ProfileFields[K] =>
    key in pending ? (pending[key] as ProfileFields[K]) : (row[key] ?? current ?? null);
  const level = pick('level', local.level);
  if (level) {
    saveLocalProfile({ level, nickname: pick('nickname', local.nickname), animal: pick('animal', local.animal) });
    markOnboarded();
  }
  if (!('a4_hz' in pending)) saveA4(row.a4_hz);
  if (!('theme_id' in pending) && row.theme_id) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, row.theme_id);
    } catch {
      // sem armazenamento: o tema do servidor vale só nesta visita
    }
  }
}

/** A query do perfil do servidor (shell/profileSync.ts); a volta da rede a refaz. */
export const PROFILE_QUERY_KEY = ['profile', 'remote'] as const;

export type ProfileSyncClient ={ from: SupabaseClient['from']; rpc: SupabaseClient['rpc'] };

/**
 * Sobe o que está pendente e traz o perfil do servidor para o aparelho. Sem cliente ou sessão, null (o aparelho
 * segue como está). ensure_my_profile cria o perfil de quem chegou antes do trigger (banco compartilhado).
 */
export async function syncProfileNow(client: ProfileSyncClient | null, session: SessionState): Promise<ProfileFields | null> {
  if (!client || session.status !== 'signed-in') return null;
  const pending = loadPending();
  if (Object.keys(pending).length) {
    const { error } = await client.from('profiles').update(pending).eq('id', session.userId);
    if (error) throw error;
    clearProfilePending(pending);
  }
  const { data, error } = await client.rpc('ensure_my_profile');
  if (error) throw error;
  const row = readProfileRow(((Array.isArray(data) ? data[0] : data) ?? {}) as Record<string, unknown>);
  applyProfile(row);
  return row;
}
