import { afterEach, describe, expect, it } from 'vitest';
import { loadMetronome, METRONOME_STORAGE_KEY, saveMetronome } from './metronome';

describe('metronome prefs', () => {
  afterEach(() => localStorage.clear());

  it('desligado sem nada guardado; guarda e devolve o volume, preso a 0–1', () => {
    expect(loadMetronome()).toBe(0);
    saveMetronome(0.4);
    expect(loadMetronome()).toBe(0.4);
    saveMetronome(3);
    expect(loadMetronome()).toBe(1);
    localStorage.setItem(METRONOME_STORAGE_KEY, 'lixo');
    expect(loadMetronome()).toBe(0);
  });
});
