import { afterEach, describe, expect, it } from 'vitest';
import { levelSettings } from '../game/engine';
import { PROFILE_STORAGE_KEY } from '../services/profile';
import { FALLBACK_LEVEL, playerLevelSettings } from './playerLevel';

describe('playerLevelSettings', () => {
  afterEach(() => localStorage.clear());

  it('lê o nível guardado no aparelho', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ level: 'never' }));
    expect(playerLevelSettings()).toEqual(levelSettings('never'));
  });

  it('sem nível, as folgas de sempre do motor', () => {
    expect(playerLevelSettings()).toEqual(levelSettings(FALLBACK_LEVEL));
    expect(playerLevelSettings().toleranceCents).toBe(50);
  });
});
