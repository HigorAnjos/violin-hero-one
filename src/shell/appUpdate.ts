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

/** A mensagem que o sw.js do workbox (generateSW, registerType prompt) atende com skipWaiting(). */
const SKIP_WAITING = { type: 'SKIP_WAITING' };

export function createAppUpdate(
  register: RegisterServiceWorker,
  checkEveryMs = UPDATE_CHECK_MS,
  reload: () => void = () => window.location.reload()
): AppUpdate {
  let waiting = false;
  let registration: ServiceWorkerRegistration | undefined;
  const listeners = new Set<() => void>();
  register({
    onNeedRefresh() {
      waiting = true;
      for (const listener of listeners) listener();
    },
    // Quem recarrega é o apply: o registerSW só recarrega no controllerchange de página que já tinha controlador
    onNeedReload: () => undefined,
    onRegisteredSW(_url, r) {
      if (!r) return;
      registration = r;
      // Sem internet a conferência falha: tenta de novo na próxima hora, sem erro na tela
      setInterval(() => void r.update().catch(() => undefined), checkEveryMs);
    },
  });
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    waiting: () => waiting,
    /**
     * Página sem controlador (primeira visita, recarga forçada) não recebe controllerchange, e a versão nova pode nem
     * ter esperado (ativou sozinha): o updateServiceWorker do vite-plugin-pwa não fazia nada e o app seguia na versão
     * velha. Aqui vale o estado do service worker: o que espera ativa e a página recarrega quando ele termina; sem
     * nenhum esperando, a versão nova já está ativa e basta recarregar.
     */
    apply() {
      const next = registration?.waiting;
      if (!next) {
        reload();
        return;
      }
      next.addEventListener('statechange', () => {
        if (next.state === 'activated') reload();
      });
      next.postMessage(SKIP_WAITING);
    },
  };
}
