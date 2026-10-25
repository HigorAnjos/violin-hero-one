import { useMutation, useQueryClient } from '@tanstack/react-query';
import { latencyToMs, loadLatency } from '../game/audio';
import { DEFAULT_A4, MAX_A4, MIN_A4 } from '../game/notation/violin';
import type { ProfileClient } from './profile';
import { ensureSession, type SessionState } from './session';
import { supabase } from './supabase';

export const A4_STORAGE_KEY = 'vh:a4';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Mesma faixa do check de profiles.a4_hz; passo de 1 Hz como no afinador. */
export function clampA4(hz: number): number {
  return Number.isFinite(hz) ? Math.min(MAX_A4, Math.max(MIN_A4, Math.round(hz))) : DEFAULT_A4;
}

/** O Lá do aparelho (o do perfil é a cópia sincronizada); sem escolha, 442. */
export function loadA4(): number {
  const raw = Number(storage()?.getItem(A4_STORAGE_KEY));
  return raw >= MIN_A4 && raw <= MAX_A4 ? clampA4(raw) : DEFAULT_A4;
}

export function saveA4(hz: number): void {
  try {
    storage()?.setItem(A4_STORAGE_KEY, String(clampA4(hz)));
  } catch {
    // sem armazenamento: vale só para esta visita
  }
}

/**
 * A calibração vale por par entrada>saída: um fone novo pede outra medida, mesmo com latency_ms no
 * perfil (que é de outro aparelho ou de outro fone).
 */
export function needsCalibration(deviceKey: string): boolean {
  return loadLatency(deviceKey) === null;
}

export interface CalibrationProfile {
  a4: number;
  /** Só a latência de um resultado confiável, em segundos. */
  latencySeconds?: number;
}

/** Grava a4_hz (e latency_ms, quando confiável) no perfil da sessão. Sem cliente ou sessão, devolve false. */
export async function syncCalibration(client: ProfileClient | null, session: SessionState, calibration: CalibrationProfile): Promise<boolean> {
  if (!client || session.status !== 'signed-in') return false;
  const row: { a4_hz: number; latency_ms?: number } = { a4_hz: clampA4(calibration.a4) };
  if (calibration.latencySeconds !== undefined) row.latency_ms = latencyToMs(calibration.latencySeconds);
  const { error } = await client.from('profiles').update(row).eq('id', session.userId);
  if (error) throw error;
  return true;
}

export function useSaveCalibration(client: ProfileClient | null = supabase) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (calibration: CalibrationProfile) => {
      saveA4(calibration.a4);
      const session = await queryClient.fetchQuery({
        queryKey: ['session'],
        queryFn: () => ensureSession(client),
        staleTime: Infinity,
      });
      return syncCalibration(client, session, calibration);
    },
  });
}
