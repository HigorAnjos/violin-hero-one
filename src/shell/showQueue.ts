/** Cada julgamento fica no texto central pelo menos isto, mesmo numa sequência rápida. */
export const MIN_SHOW_SECONDS = 0.25;
/** Mais que isto esperando e os mais antigos saem: o texto não fica para trás da música. */
export const MAX_WAITING = 3;

export interface Shown<T> {
  item: T;
  /** Hora de jogo em que entrou na tela. */
  at: number;
  /** Conta as entradas: muda a cada item novo, para a animação recomeçar. */
  serial: number;
}

export interface ShowQueue<T> {
  push(item: T, now: number): void;
  /** O que está na tela em `now`: o da vez fica `hold` segundos se nada vier depois. */
  current(now: number): Shown<T> | null;
  clear(): void;
}

/**
 * O texto central como fila: cada item aparece por pelo menos `min` segundos, na ordem em que veio; o último fica
 * `hold` segundos. Troca a regra antiga de prioridade (o erro segurava a tela), que escondia julgamentos.
 */
export function createShowQueue<T>(hold: number, min: number = MIN_SHOW_SECONDS, maxWaiting: number = MAX_WAITING): ShowQueue<T> {
  let shown: Shown<T> | null = null;
  let waiting: { item: T; at: number }[] = [];
  let serial = 0;

  const settle = (now: number) => {
    while (shown && waiting.length && now - shown.at >= min) {
      const next = waiting.shift()!;
      shown = { item: next.item, at: Math.max(shown.at + min, next.at), serial: ++serial };
    }
    if (shown && !waiting.length && now - shown.at >= hold) shown = null;
  };

  return {
    push(item, now) {
      settle(now);
      if (!shown) {
        shown = { item, at: now, serial: ++serial };
        return;
      }
      waiting.push({ item, at: now });
      if (waiting.length > maxWaiting) waiting = waiting.slice(-maxWaiting);
    },
    current(now) {
      settle(now);
      return shown;
    },
    clear() {
      shown = null;
      waiting = [];
    },
  };
}
