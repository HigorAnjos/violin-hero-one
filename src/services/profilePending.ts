import type { PlayerLevel } from '../game/engine/levels';
import type { Animal } from './profile';

/** As colunas de violinhero.profiles que o aparelho também guarda (o GRANT de update de 0002 cobre todas). */
export interface ProfileFields {
  nickname: string | null;
  animal: Animal | null;
  level: PlayerLevel | null;
  a4_hz: number;
  latency_ms: number | null;
  theme_id: string | null;
}

export const PENDING_STORAGE_KEY = 'vh:perfil-pendente';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** O que mudou no aparelho e o servidor ainda não confirmou. */
export function loadPending(): Partial<ProfileFields> {
  try {
    const raw: unknown = JSON.parse(storage()?.getItem(PENDING_STORAGE_KEY) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<ProfileFields>) : {};
  } catch {
    return {};
  }
}

function savePending(pending: Partial<ProfileFields>) {
  try {
    if (Object.keys(pending).length) storage()?.setItem(PENDING_STORAGE_KEY, JSON.stringify(pending));
    else storage()?.removeItem(PENDING_STORAGE_KEY);
  } catch {
    // sem armazenamento: a mudança sobe só se a gravação direta der certo
  }
}

/** Marca campos mudados no aparelho: sobem na próxima sincronização, antes de o servidor sobrescrever o aparelho. */
export function markProfilePending(change: Partial<ProfileFields>): void {
  savePending({ ...loadPending(), ...change });
}

/** O servidor gravou estes valores: saem da pendência (se não mudaram de novo nesse meio-tempo). */
export function clearProfilePending(sent: Partial<ProfileFields>): void {
  const pending = loadPending();
  for (const [key, value] of Object.entries(sent) as [keyof ProfileFields, unknown][]) {
    if (pending[key] === value) delete pending[key];
  }
  savePending(pending);
}
