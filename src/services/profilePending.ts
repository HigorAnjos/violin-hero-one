import type { PlayerLevel } from '../game/engine/levels';
import type { Animal } from './profile';
import { currentUserId } from './user';

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

/** A pendência guardada, com o dono: a mudança de um usuário nunca sobe para o perfil de outro. */
interface StoredPending {
  /** '' antes da primeira sessão no aparelho: passa para o primeiro dono. */
  userId: string;
  fields: Partial<ProfileFields>;
}

const owner = () => currentUserId() ?? '';

function readStored(): StoredPending | null {
  try {
    const raw: unknown = JSON.parse(storage()?.getItem(PENDING_STORAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const stored = raw as Partial<StoredPending>;
    if (typeof stored.userId !== 'string' || !stored.fields || typeof stored.fields !== 'object') return null;
    return { userId: stored.userId, fields: stored.fields };
  } catch {
    return null;
  }
}

/** O que mudou no aparelho e o servidor ainda não confirmou, deste usuário (padrão: o dono da vez). */
export function loadPending(userId: string = owner()): Partial<ProfileFields> {
  const stored = readStored();
  return stored && (stored.userId === userId || stored.userId === '') ? { ...stored.fields } : {};
}

function savePending(userId: string, fields: Partial<ProfileFields>) {
  try {
    if (Object.keys(fields).length) storage()?.setItem(PENDING_STORAGE_KEY, JSON.stringify({ userId, fields } satisfies StoredPending));
    else storage()?.removeItem(PENDING_STORAGE_KEY);
  } catch {
    // sem armazenamento: a mudança sobe só se a gravação direta der certo
  }
}

/** Marca campos mudados no aparelho: sobem na próxima sincronização, antes de o servidor sobrescrever o aparelho. */
export function markProfilePending(change: Partial<ProfileFields>): void {
  const userId = owner();
  savePending(userId, { ...loadPending(userId), ...change });
}

/** O servidor gravou estes valores para o usuário: saem da pendência (se não mudaram de novo nesse meio-tempo). */
export function clearProfilePending(sent: Partial<ProfileFields>, userId: string = owner()): void {
  const pending = loadPending(userId);
  for (const [key, value] of Object.entries(sent) as [keyof ProfileFields, unknown][]) {
    if (pending[key] === value) delete pending[key];
  }
  savePending(userId, pending);
}

/** Troca de conta (DeviceData.forget): a pendência do usuário que saiu some do aparelho. */
export function forgetProfilePending(userId: string): void {
  const stored = readStored();
  if (stored && (stored.userId === userId || stored.userId === '')) savePending(userId, {});
}
