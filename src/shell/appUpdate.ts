import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

/** O registerSW do vite-plugin-pwa (virtual:pwa-register); os testes passam um de mentira. */
export type RegisterServiceWorker = (options: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>;

/**
 * Versão nova do app baixada pelo service worker, esperando para entrar. Quem decide a hora é a tela
 * (UpdatePrompt): nunca no meio da música. Fechar o app sem atualizar também serve: na próxima abertura,
 * sem nenhuma aba da versão velha, a nova já entra sozinha.
 */
export interface AppUpdate {
  subscribe(listener: () => void): () => void;
  /** Tem versão nova esperando. */
  waiting(): boolean;
  /** Troca para a versão nova e recarrega a página. */
  apply(): void;
}

/** Versão nova sempre esperando, sem service worker: ?nova-versao (ferramenta de conferência, main.tsx). */
export const pendingUpdate = (): AppUpdate => ({ subscribe: () => () => undefined, waiting: () => true, apply: () => undefined });

/** Com o app aberto por horas (PWA instalado), confere de hora em hora se saiu versão nova. */
export const UPDATE_CHECK_MS = 60 * 60_000;

export function createAppUpdate(register: RegisterServiceWorker, checkEveryMs = UPDATE_CHECK_MS): AppUpdate {
  let waiting = false;
  const listeners = new Set<() => void>();
  const update = register({
    onNeedRefresh() {
      waiting = true;
      for (const listener of listeners) listener();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Sem internet a conferência falha: tenta de novo na próxima hora, sem erro na tela
      setInterval(() => void registration.update().catch(() => undefined), checkEveryMs);
    },
  });
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    waiting: () => waiting,
    apply: () => void update(true),
  };
}
