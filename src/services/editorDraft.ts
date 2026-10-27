import { editorFromDoc, type EditorDoc, type EditorState } from '../game/notation/editor';
import { currentUserId } from './user';

/** Rascunho do editor no aparelho, um por usuário: sair da tela (ou fechar o app) não perde o que foi escrito. */
export const DRAFT_STORAGE_KEY = 'vh:rascunho-partitura';

const keyFor = (user: string | null) => `${DRAFT_STORAGE_KEY}:${user ?? ''}`;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** O rascunho do usuário da vez; nada (ou lixo de outra versão) volta como null. */
export function loadDraft(user = currentUserId()): EditorState | null {
  try {
    const raw = storage()?.getItem(keyFor(user));
    return raw ? editorFromDoc(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Grava o documento; false quando o aparelho não guarda (navegação privada, sem espaço). */
export function saveDraft(doc: EditorDoc, user = currentUserId()): boolean {
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(keyFor(user), JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(user = currentUserId()): void {
  try {
    storage()?.removeItem(keyFor(user));
  } catch {
    // sem armazenamento: não havia rascunho
  }
}
