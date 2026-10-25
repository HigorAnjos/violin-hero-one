import { BADGES, type BadgeId } from '../game/engine';

export const BADGES_STORAGE_KEY = 'vh:badges';

const KNOWN = new Set<string>(BADGES.map((b) => b.id));

/** Selos já conquistados neste aparelho; o servidor passa a conferir no ciclo 3. */
export function loadEarnedBadges(): BadgeId[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(BADGES_STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? (raw.filter((id) => typeof id === 'string' && KNOWN.has(id)) as BadgeId[]) : [];
  } catch {
    return [];
  }
}

export function addEarnedBadges(ids: readonly BadgeId[]): void {
  if (!ids.length) return;
  try {
    const all = [...new Set([...loadEarnedBadges(), ...ids])];
    window.localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // sem armazenamento: o selo aparece de novo na próxima partida
  }
}
