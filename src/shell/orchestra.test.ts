import { afterEach, describe, it, expect } from 'vitest';
import { loadOrchestraPrefs, orchestraLevel, ORCHESTRA_STORAGE_KEY, saveOrchestraPrefs } from './orchestra';

describe('orchestraLevel', () => {
  it('a energia de início põe cordas, madeiras e metais; a percussão entra com 12 seguidas', () => {
    expect(orchestraLevel({ energy: 0.6, combo: 0 })).toBe(3);
    expect(orchestraLevel({ energy: 0.6, combo: 12 })).toBe(4);
    expect(orchestraLevel({ energy: 0.3, combo: 20 })).toBe(2);
    expect(orchestraLevel({ energy: 0.1, combo: 0 })).toBe(1);
    expect(orchestraLevel({ energy: 0, combo: 0 })).toBe(0);
  });

  it('não pisca na borda: um naipe só sai 0,05 abaixo de onde entrou', () => {
    expect(orchestraLevel({ energy: 0.48, combo: 0 }, 3)).toBe(3);
    expect(orchestraLevel({ energy: 0.48, combo: 0 })).toBe(2);
    expect(orchestraLevel({ energy: 0.44, combo: 0 }, 3)).toBe(2);
  });
});

describe('preferências da orquestra', () => {
  afterEach(() => localStorage.clear());

  it('grava e lê a resposta do fone na chave do synth', () => {
    expect(loadOrchestraPrefs()).toEqual({ enabled: true, volume: 0.5, headphones: false });
    saveOrchestraPrefs({ enabled: true, volume: 0.7, headphones: true });
    expect(JSON.parse(localStorage.getItem(ORCHESTRA_STORAGE_KEY) ?? '')).toEqual({ enabled: true, volume: 0.7, headphones: true });
    expect(loadOrchestraPrefs().headphones).toBe(true);
  });

  it('lixo no armazenamento vira o padrão', () => {
    localStorage.setItem(ORCHESTRA_STORAGE_KEY, '{"volume":9,"headphones":"sim"}');
    expect(loadOrchestraPrefs()).toEqual({ enabled: true, volume: 0.5, headphones: false });
  });
});
