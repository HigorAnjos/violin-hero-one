import type { SupabaseClient } from '@supabase/supabase-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PLAYER_LEVELS, type PlayerLevel } from '../game/engine/levels';
import { ensureSession, type AuthClient, type SessionState } from './session';
import { supabase } from './supabase';

export const ANIMALS = ['fox', 'penguin', 'cat'] as const;
export type Animal = (typeof ANIMALS)[number];

export interface StartProfile {
  level: PlayerLevel;
  nickname: string | null;
  animal: Animal | null;
}

export const PROFILE_STORAGE_KEY = 'vh:profile';
export const ONBOARDED_STORAGE_KEY = 'vh:onboarded';
export const NICKNAME_MAX = 24;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Mesma regra do check do banco: sem espaço nas pontas, de 1 a 24 letras; vazio vira null. */
export function normalizeNickname(raw: string): string | null {
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX).trim();
  return clean || null;
}

/** O que está guardado no aparelho; lixo ou valor desconhecido viram vazio. */
export function loadLocalProfile(): Partial<StartProfile> {
  try {
    const raw = JSON.parse(storage()?.getItem(PROFILE_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    const profile: Partial<StartProfile> = {};
    if (PLAYER_LEVELS.includes(raw.level as PlayerLevel)) profile.level = raw.level as PlayerLevel;
    if (typeof raw.nickname === 'string') profile.nickname = normalizeNickname(raw.nickname);
    if (ANIMALS.includes(raw.animal as Animal)) profile.animal = raw.animal as Animal;
    return profile;
  } catch {
    return {};
  }
}

export function saveLocalProfile(profile: StartProfile): void {
  try {
    storage()?.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // sem armazenamento: vale só para esta visita
  }
}

/** A primeira vez acabou (cordas testadas ou puladas): a raiz deixa de levar ao onboarding. */
export function isOnboarded(): boolean {
  return storage()?.getItem(ONBOARDED_STORAGE_KEY) === '1';
}

export function markOnboarded(): void {
  try {
    storage()?.setItem(ONBOARDED_STORAGE_KEY, '1');
  } catch {
    // sem armazenamento: na próxima visita o onboarding aparece de novo
  }
}

export type ProfileClient = { auth: AuthClient; from: SupabaseClient['from'] };

/**
 * Grava no perfil do usuário da sessão (anônimo inclusive). Sem cliente ou sem rede, fica só no
 * aparelho: devolve false em vez de falhar.
 */
export async function syncProfile(client: ProfileClient | null, session: SessionState, profile: StartProfile): Promise<boolean> {
  if (!client || session.status !== 'signed-in') return false;
  const { error } = await client.from('profiles').update(profile).eq('id', session.userId);
  if (error) throw error;
  return true;
}

/** Salva no aparelho na hora e, com sessão, em violinhero.profiles. A sessão é a mesma do SessionStatus. */
export function useSaveStartProfile(client: ProfileClient | null = supabase) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: StartProfile) => {
      saveLocalProfile(profile);
      const session = await queryClient.fetchQuery({
        queryKey: ['session'],
        queryFn: () => ensureSession(client),
        staleTime: Infinity,
      });
      return syncProfile(client, session, profile);
    },
  });
}
