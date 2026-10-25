import type { Song } from '../game/notation/song';
import type { OrchestraLevel } from '../components/Orchestra/stage';

/**
 * A parte da orquestra (src/game/synth, floor ciclo1-orquestra) que a partida usa. Enquanto o synth
 * não entra em task/ciclo-1, a partida roda sem som de orquestra, só com a faixa acesa pela energia.
 */
export interface GameOrchestra {
  /** O state de cada julgamento do Motor (energia e combo). */
  update(drive: { energy: number; combo: number }): void;
  stop(fadeSeconds?: number): Promise<void>;
  dispose(): void;
}

export interface OrchestraStart {
  /** Tempo do AudioContext do primeiro tempo da música (o startAt do Motor no relógio deste contexto). */
  startAt: number;
  bpm?: number;
  a4?: number;
  energy?: number;
  volume?: number;
  enabled?: boolean;
  headphones?: boolean;
}

export type OrchestraFactory = (context: BaseAudioContext, song: Song, options: OrchestraStart) => Promise<GameOrchestra>;

export const loadOrchestra: OrchestraFactory | null = null;

export interface OrchestraPrefs {
  enabled: boolean;
  volume: number;
  headphones: boolean;
}

/** Mesma chave e forma do synth (loadOrchestraSettings), para a resposta do "Está de fone?" valer lá. */
export const ORCHESTRA_STORAGE_KEY = 'vh:orchestra';
const DEFAULTS: OrchestraPrefs = { enabled: true, volume: 0.5, headphones: false };

export function loadOrchestraPrefs(): OrchestraPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(ORCHESTRA_STORAGE_KEY) ?? '{}') as Partial<Record<keyof OrchestraPrefs, unknown>>;
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULTS.enabled,
      volume: typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1 ? raw.volume : DEFAULTS.volume,
      headphones: typeof raw.headphones === 'boolean' ? raw.headphones : DEFAULTS.headphones,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveOrchestraPrefs(prefs: OrchestraPrefs): void {
  try {
    localStorage.setItem(ORCHESTRA_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // sem armazenamento: a escolha vale só nesta página
  }
}

/** Naipes acesos pela energia (cordas, madeiras, metais) e a percussão com 12 acertos seguidos, como no synth. */
export const PERCUSSION_COMBO = 12;
const THRESHOLDS = [0, 0.25, 0.5];
const HYSTERESIS = 0.05;

export function orchestraLevel({ energy, combo }: { energy: number; combo: number }, previous?: OrchestraLevel): OrchestraLevel {
  if (!(energy > 0)) return 0;
  let level = 0;
  THRESHOLDS.forEach((threshold, i) => {
    const k = i + 1;
    const keep = previous !== undefined && previous >= k && k > 1;
    if (energy > (keep ? threshold - HYSTERESIS : threshold)) level = k;
  });
  if (level === 3 && combo >= PERCUSSION_COMBO) level = 4;
  return level as OrchestraLevel;
}
