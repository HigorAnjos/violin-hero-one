import { describe, expect, it } from 'vitest';
import { attacks } from '../notation/song';
import { findFixedSong } from '../notation/songs';
import { WRONG_NOTE_CENTS } from './judge';
import { LEVEL_SETTINGS, PLAYER_LEVELS, levelSettings, levelSummary } from './levels';
import { DEFAULT_TOLERANCE_CENTS, DEFAULT_WINDOWS } from './score';

describe('tabela nível do jogador → ajustes', () => {
  it('cobre os 4 níveis do perfil', () => {
    expect(Object.keys(LEVEL_SETTINGS).sort()).toEqual([...PLAYER_LEVELS].sort());
  });

  it('"já toco algumas músicas" é o jogo de hoje: 50 ¢ e ±70/130/220 ms no andamento da música', () => {
    expect(levelSettings('some_songs')).toMatchObject({
      toleranceCents: DEFAULT_TOLERANCE_CENTS,
      windows: DEFAULT_WINDOWS,
      tempoFactor: 1,
      trackLeadSeconds: 2,
    });
  });

  it('fica mais exigente a cada nível, nunca mais generoso', () => {
    for (let i = 1; i < PLAYER_LEVELS.length; i++) {
      const easier = LEVEL_SETTINGS[PLAYER_LEVELS[i - 1]];
      const harder = LEVEL_SETTINGS[PLAYER_LEVELS[i]];
      expect(harder.toleranceCents).toBeLessThanOrEqual(easier.toleranceCents);
      expect(harder.windows.perfect).toBeLessThanOrEqual(easier.windows.perfect);
      expect(harder.windows.great).toBeLessThanOrEqual(easier.windows.great);
      expect(harder.windows.good).toBeLessThanOrEqual(easier.windows.good);
      expect(harder.tempoFactor).toBeGreaterThanOrEqual(easier.tempoFactor);
      expect(harder.trackLeadSeconds).toBeLessThanOrEqual(easier.trackLeadSeconds);
    }
  });

  it.each(PLAYER_LEVELS)('%s: janelas em ordem e tolerância abaixo de "nota errada"', (level) => {
    const { windows, toleranceCents, tempoFactor } = LEVEL_SETTINGS[level];
    expect(0 < windows.perfect && windows.perfect < windows.great && windows.great < windows.good).toBe(true);
    expect(toleranceCents).toBeGreaterThan(0);
    expect(toleranceCents).toBeLessThan(WRONG_NOTE_CENTS);
    expect(tempoFactor).toBeGreaterThan(0);
    expect(tempoFactor).toBeLessThanOrEqual(1);
  });

  it.each(PLAYER_LEVELS)('%s: a música inicial existe e a janela Bom não alcança a nota seguinte nela', (level) => {
    const s = LEVEL_SETTINGS[level];
    const entry = findFixedSong(s.firstSongId);
    expect(entry).toBeDefined();
    const song = entry!.song;
    const spb = 60 / (song.bpm * s.tempoFactor);
    const notes = attacks(song);
    const closest = Math.min(...notes.slice(1).map((n, i) => (n.at - notes[i].at) * spb));
    expect(s.windows.good / 1000).toBeLessThan(closest);
  });
});

describe('levelSummary', () => {
  it('as linhas do cartão "Você vai começar com", em pt-BR', () => {
    expect(levelSummary('never')).toEqual([
      { label: 'Primeira música', value: 'Escala de Ré maior' },
      { label: 'Andamento', value: '70% da música' },
      { label: 'Afinação', value: 'até 60 ¢ de folga' },
      { label: 'Tempo', value: 'até 280 ms de folga' },
      { label: 'Dificuldade', value: 'Fácil' },
    ]);
    expect(levelSummary('some_songs')[1]).toEqual({ label: 'Andamento', value: 'o da música' });
    expect(levelSummary('years').at(-1)).toEqual({ label: 'Dificuldade', value: 'Difícil' });
  });
});
