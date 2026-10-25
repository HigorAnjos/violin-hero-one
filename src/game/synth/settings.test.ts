import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORCHESTRA_SETTINGS,
  ORCHESTRA_STORAGE_KEY,
  clampVolume,
  loadOrchestraSettings,
  saveOrchestraSettings,
  volumeLabel,
} from './settings';

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('volume e liga/desliga da orquestra no aparelho', () => {
  it('sem nada salvo: ligada, volume 50%', () => {
    expect(loadOrchestraSettings(memory())).toEqual({ enabled: true, volume: 0.5 });
  });

  it('grava e lê de volta', () => {
    const storage = memory();
    expect(saveOrchestraSettings({ enabled: false, volume: 0.8 }, storage)).toBe(true);
    expect(JSON.parse(storage.data.get(ORCHESTRA_STORAGE_KEY)!)).toEqual({ enabled: false, volume: 0.8 });
    expect(loadOrchestraSettings(storage)).toEqual({ enabled: false, volume: 0.8 });
  });

  it('valor estragado ou fora da faixa cai no padrão ou é limitado', () => {
    expect(loadOrchestraSettings(memory({ [ORCHESTRA_STORAGE_KEY]: '{oops' }))).toEqual(DEFAULT_ORCHESTRA_SETTINGS);
    expect(loadOrchestraSettings(memory({ [ORCHESTRA_STORAGE_KEY]: 'null' }))).toEqual(DEFAULT_ORCHESTRA_SETTINGS);
    expect(loadOrchestraSettings(memory({ [ORCHESTRA_STORAGE_KEY]: '{"enabled":"sim","volume":7}' }))).toEqual({
      enabled: true,
      volume: 1,
    });
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(Number.NaN)).toBe(0.5);
  });

  it('armazenamento cheio: devolve falso sem lançar', () => {
    const full = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(saveOrchestraSettings({ enabled: true, volume: 0.5 }, full)).toBe(false);
  });

  it('sem armazenamento explícito, usa o localStorage do aparelho', () => {
    localStorage.removeItem(ORCHESTRA_STORAGE_KEY);
    expect(saveOrchestraSettings({ enabled: false, volume: 0.3 })).toBe(true);
    expect(loadOrchestraSettings()).toEqual({ enabled: false, volume: 0.3 });
    localStorage.removeItem(ORCHESTRA_STORAGE_KEY);
  });

  it('rótulo em porcentagem', () => {
    expect(volumeLabel(0.426)).toBe('43%');
  });
});
