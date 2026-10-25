export const ORCHESTRA_STORAGE_KEY = 'vh:orchestra';
export const DEFAULT_ORCHESTRA_VOLUME = 0.5;

export interface OrchestraSettings {
  enabled: boolean;
  /** Linear 0 a 1. */
  volume: number;
  /** Resposta do "Está de fone?" da calibração: com fone a orquestra toca completa. */
  headphones: boolean;
}

export const DEFAULT_ORCHESTRA_SETTINGS: Readonly<OrchestraSettings> = {
  enabled: true,
  volume: DEFAULT_ORCHESTRA_VOLUME,
  headphones: false,
};

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function clampVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_ORCHESTRA_VOLUME;
}

export function loadOrchestraSettings(storage: Pick<Storage, 'getItem'> | undefined = defaultStorage()): OrchestraSettings {
  try {
    const raw = storage?.getItem(ORCHESTRA_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ORCHESTRA_SETTINGS };
    const value = JSON.parse(raw) as Partial<Record<keyof OrchestraSettings, unknown>> | null;
    return {
      enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_ORCHESTRA_SETTINGS.enabled,
      volume: typeof value?.volume === 'number' ? clampVolume(value.volume) : DEFAULT_ORCHESTRA_SETTINGS.volume,
      headphones: typeof value?.headphones === 'boolean' ? value.headphones : DEFAULT_ORCHESTRA_SETTINGS.headphones,
    };
  } catch {
    return { ...DEFAULT_ORCHESTRA_SETTINGS };
  }
}

/** Falso quando o armazenamento falta ou está cheio: a escolha vale só nesta página. */
export function saveOrchestraSettings(
  settings: OrchestraSettings,
  storage: Pick<Storage, 'setItem'> | undefined = defaultStorage(),
): boolean {
  try {
    if (!storage) return false;
    const { enabled, headphones } = settings;
    storage.setItem(ORCHESTRA_STORAGE_KEY, JSON.stringify({ enabled, volume: clampVolume(settings.volume), headphones }));
    return true;
  } catch {
    return false;
  }
}

export function volumeLabel(volume: number): string {
  return `${Math.round(clampVolume(volume) * 100)}%`;
}
