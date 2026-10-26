/**
 * O que o aparelho guarda de cada usuário: cache de músicas e fila de partidas ainda não enviadas.
 * Quem implementa é a sincronização (ciclo3-sync, setDeviceData no boot); a conta só chama na troca
 * de usuário. Sem implementação, nada a subir nem a apagar.
 */
export interface DeviceData {
  /** Sobe a fila pendente do usuário; sem rede ou com erro, lança. */
  flush(userId: string): Promise<void>;
  /** Apaga do aparelho o cache de músicas e a fila do usuário. */
  forget(userId: string): Promise<void>;
  /** Cache e fila passam a ser do usuário. */
  use(userId: string): void;
  /** Partidas do usuário ainda não enviadas. */
  pending(userId: string): Promise<number>;
}

const NOTHING: DeviceData = {
  flush: async () => {},
  forget: async () => {},
  use: () => {},
  pending: async () => 0,
};

let current: DeviceData = NOTHING;

export function deviceData(): DeviceData {
  return current;
}

/** `null` volta ao aparelho sem sincronização (testes). */
export function setDeviceData(data: DeviceData | null): void {
  current = data ?? NOTHING;
}
