import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLAY_PREFS, loadPlayPrefs, PLAY_PREFS_STORAGE_KEY, savePlayPrefs } from './playPrefs';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('opções de tela da partida', () => {
  it('sem nada guardado: linha de afinação ligada, nomes e modo daltônico desligados; no celular deitado, sem a pauta e com o painel', () => {
    expect(loadPlayPrefs()).toEqual({ tuningLine: true, noteNames: false, colorblind: false, landscapeStaff: false, landscapePanel: true });
  });

  it('guardado antes do botão Pauta (só as três opções): as duas do celular deitado vêm do padrão', () => {
    localStorage.setItem(PLAY_PREFS_STORAGE_KEY, '{"tuningLine":false,"noteNames":true,"colorblind":true}');
    expect(loadPlayPrefs()).toEqual({ tuningLine: false, noteNames: true, colorblind: true, landscapeStaff: false, landscapePanel: true });
  });

  it('botão Pauta e botão Painel: valem cada um por si, e lixo neles vira o padrão', () => {
    savePlayPrefs({ ...DEFAULT_PLAY_PREFS, landscapeStaff: true });
    expect(loadPlayPrefs()).toMatchObject({ landscapeStaff: true, landscapePanel: true });
    savePlayPrefs({ ...DEFAULT_PLAY_PREFS, landscapePanel: false });
    expect(loadPlayPrefs()).toMatchObject({ landscapeStaff: false, landscapePanel: false });
    localStorage.setItem(PLAY_PREFS_STORAGE_KEY, '{"landscapeStaff":1,"landscapePanel":"não"}');
    expect(loadPlayPrefs()).toEqual(DEFAULT_PLAY_PREFS);
  });

  it('guarda e lê de volta', () => {
    savePlayPrefs({ tuningLine: false, noteNames: true, colorblind: true, landscapeStaff: true, landscapePanel: false });
    expect(loadPlayPrefs()).toEqual({ tuningLine: false, noteNames: true, colorblind: true, landscapeStaff: true, landscapePanel: false });
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
