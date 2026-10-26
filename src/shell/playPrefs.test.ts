import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLAY_PREFS, loadPlayPrefs, PLAY_PREFS_STORAGE_KEY, savePlayPrefs } from './playPrefs';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('opções de tela da partida', () => {
  it('sem nada guardado: linha de afinação ligada, nomes e modo daltônico desligados', () => {
    expect(loadPlayPrefs()).toEqual({ tuningLine: true, noteNames: false, colorblind: false });
  });

  it('guarda e lê de volta', () => {
    savePlayPrefs({ tuningLine: false, noteNames: true, colorblind: true });
    expect(loadPlayPrefs()).toEqual({ tuningLine: false, noteNames: true, colorblind: true });
  });

  it('lixo no armazenamento vira o padrão, campo a campo', () => {
    localStorage.setItem(PLAY_PREFS_STORAGE_KEY, '{"noteNames":"sim","colorblind":true}');
    expect(loadPlayPrefs()).toEqual({ ...DEFAULT_PLAY_PREFS, colorblind: true });
    localStorage.setItem(PLAY_PREFS_STORAGE_KEY, 'não é json');
    expect(loadPlayPrefs()).toEqual(DEFAULT_PLAY_PREFS);
    localStorage.setItem(PLAY_PREFS_STORAGE_KEY, 'null');
    expect(loadPlayPrefs()).toEqual(DEFAULT_PLAY_PREFS);
  });

  it('sem armazenamento: padrão, sem erro', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => savePlayPrefs({ ...DEFAULT_PLAY_PREFS, noteNames: true })).not.toThrow();
    expect(loadPlayPrefs()).toEqual(DEFAULT_PLAY_PREFS);
  });
});
