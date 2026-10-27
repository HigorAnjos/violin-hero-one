export const USER_STORAGE_KEY = 'vh:usuario';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * O último usuário que teve sessão neste aparelho. Sem rede a sessão some (o token não renova), mas as músicas
 * guardadas e a fila de partidas continuam sendo dele: é a chave dos dois no IndexedDB. null antes da primeira sessão.
 */
export function currentUserId(): string | null {
  try {
    return storage()?.getItem(USER_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Devolve o usuário anterior (null se era o primeiro). */
export function rememberUser(id: string | null): string | null {
  const previous = currentUserId();
  try {
    if (id) storage()?.setItem(USER_STORAGE_KEY, id);
    else storage()?.removeItem(USER_STORAGE_KEY);
  } catch {
    // sem armazenamento: o cache e a fila ficam no balde sem dono até a próxima sessão
  }
  return previous;
}
