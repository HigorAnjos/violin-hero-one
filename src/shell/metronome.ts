export const METRONOME_STORAGE_KEY = 'vh:metronomo';
/** Ligar o metrônomo sem volume guardado: este volume. */
export const METRONOME_DEFAULT = 0.4;

/** Volume do metrônomo guardado no aparelho, 0 a 1; 0 = desligado. */
export function loadMetronome(): number {
  try {
    const raw = Number(window.localStorage.getItem(METRONOME_STORAGE_KEY));
    return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  } catch {
    return 0;
  }
}

export function saveMetronome(volume: number): void {
  try {
    window.localStorage.setItem(METRONOME_STORAGE_KEY, String(Math.max(0, Math.min(1, volume))));
  } catch {
    // sem armazenamento: vale só para esta visita
  }
}
