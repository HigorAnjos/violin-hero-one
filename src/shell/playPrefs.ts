export const PLAY_PREFS_STORAGE_KEY = 'vh:ajustes';

/** Opções de tela da partida, mudadas nas Configurações ou na Pausa e guardadas no aparelho. */
export interface PlayPrefs {
  /** Traço da afinação dos últimos 2 s no cartão de afinação (e na Afinação ao vivo da partitura). */
  tuningLine: boolean;
  /** Nome da nota (Dó, Ré…) em cima de cada nota da pista. */
  noteNames: boolean;
  /** Modo daltônico: cada corda com um padrão além da cor (a letra aparece sempre). */
  colorblind: boolean;
}

export const DEFAULT_PLAY_PREFS: Readonly<PlayPrefs> = { tuningLine: true, noteNames: false, colorblind: false };

/** O que está guardado; lixo ou chave desconhecida vira o padrão, campo a campo. */
export function loadPlayPrefs(): PlayPrefs {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(PLAY_PREFS_STORAGE_KEY) ?? '{}');
    const value = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof PlayPrefs, unknown>>) : {};
    const pick = (key: keyof PlayPrefs) => (typeof value[key] === 'boolean' ? (value[key] as boolean) : DEFAULT_PLAY_PREFS[key]);
    return { tuningLine: pick('tuningLine'), noteNames: pick('noteNames'), colorblind: pick('colorblind') };
  } catch {
    return { ...DEFAULT_PLAY_PREFS };
  }
}

export function savePlayPrefs(prefs: PlayPrefs): void {
  try {
    window.localStorage.setItem(PLAY_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // sem armazenamento: vale só para esta visita
  }
}
