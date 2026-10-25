import { DEFAULT_DEVICE_KEY, DEFAULT_LATENCY_SECONDS, MAX_LATENCY_MS, type StoredLatency } from './types';

export const LATENCY_STORAGE_KEY = 'vh:latency';

type Entries = Record<string, StoredLatency>;

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Chave do par entrada→saída. O microfone vem do deviceId da trilha; a saída, do `sinkId` do contexto onde o navegador
 * expõe (Chrome). Sem nenhum dos dois, cai na chave padrão do aparelho.
 */
export function audioDeviceKey(stream?: MediaStream, context?: BaseAudioContext): string {
  const input = stream?.getAudioTracks?.()[0]?.getSettings?.().deviceId || '';
  const sink = (context as { sinkId?: unknown } | undefined)?.sinkId;
  const output = typeof sink === 'string' ? sink : '';
  if (!input && !output) return DEFAULT_DEVICE_KEY;
  return `${input || DEFAULT_DEVICE_KEY}>${output || DEFAULT_DEVICE_KEY}`;
}

function readEntries(storage: Storage | undefined): Entries {
  try {
    const raw = storage?.getItem(LATENCY_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Entries) : {};
  } catch {
    return {};
  }
}

function isValid(entry: unknown): entry is StoredLatency {
  if (!entry || typeof entry !== 'object') return false;
  const { latencySeconds, confidence } = entry as Partial<StoredLatency>;
  return (
    typeof latencySeconds === 'number' &&
    Number.isFinite(latencySeconds) &&
    latencySeconds >= 0 &&
    latencySeconds * 1000 <= MAX_LATENCY_MS &&
    typeof confidence === 'number' &&
    Number.isFinite(confidence)
  );
}

export function loadLatency(
  deviceKey: string = DEFAULT_DEVICE_KEY,
  storage: Storage | undefined = defaultStorage(),
): StoredLatency | null {
  const entry = readEntries(storage)[deviceKey];
  if (!isValid(entry)) return null;
  return {
    latencySeconds: entry.latencySeconds,
    confidence: entry.confidence,
    measuredAt: typeof entry.measuredAt === 'string' ? entry.measuredAt : '',
  };
}

/** Devolve false com armazenamento indisponível, cheio ou valor fora de 0..1 s; aí a latência vale só para esta página. */
export function saveLatency(
  entry: StoredLatency,
  deviceKey: string = DEFAULT_DEVICE_KEY,
  storage: Storage | undefined = defaultStorage(),
): boolean {
  if (!storage || !isValid(entry)) return false;
  try {
    const entries = readEntries(storage);
    entries[deviceKey] = entry;
    storage.setItem(LATENCY_STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/** Sem `deviceKey`, apaga as latências de todos os dispositivos. */
export function clearLatency(deviceKey?: string, storage: Storage | undefined = defaultStorage()): void {
  try {
    if (deviceKey === undefined) {
      storage?.removeItem(LATENCY_STORAGE_KEY);
      return;
    }
    const entries = readEntries(storage);
    if (!(deviceKey in entries)) return;
    delete entries[deviceKey];
    storage?.setItem(LATENCY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Armazenamento indisponível não tem o que apagar.
  }
}

/** Latência a descontar de PitchReading.time, em segundos: a calibrada deste par, ou o padrão. */
export function latencySeconds(
  deviceKey: string = DEFAULT_DEVICE_KEY,
  storage: Storage | undefined = defaultStorage(),
): number {
  return loadLatency(deviceKey, storage)?.latencySeconds ?? DEFAULT_LATENCY_SECONDS;
}

/** Inteiro em 0..1000 para profiles.latency_ms. */
export function latencyToMs(seconds: number): number {
  if (!Number.isFinite(seconds)) throw new RangeError(`latência inválida: ${seconds}`);
  return Math.min(MAX_LATENCY_MS, Math.max(0, Math.round(seconds * 1000)));
}

export function msToLatency(ms: number): number {
  return latencyToMs(ms / 1000) / 1000;
}
