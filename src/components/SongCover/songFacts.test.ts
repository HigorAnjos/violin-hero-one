import { describe, expect, it } from 'vitest';
import { FIXED_SONGS } from '../../game/notation/songs';
import { durationLabel, keyLabel, noteCount, offlineTag, songMeta, stringShares } from './songFacts';

describe('ficha da música', () => {
  it('selo de quem toca sem internet', () => {
    expect(offlineTag({ embedded: true, saved: false }, false)).toBe('No app');
    expect(offlineTag({ embedded: true, saved: true }, false)).toBe('No app');
    expect(offlineTag({ embedded: false, saved: true }, false)).toBe('Baixada');
    expect(offlineTag({ embedded: false, saved: false }, false)).toBeNull();
    // Sem internet a estante inteira é do app ou baixada: só a baixada fica marcada
    expect(offlineTag({ embedded: true, saved: false }, true)).toBeNull();
    expect(offlineTag({ embedded: false, saved: true }, true)).toBe('Baixada');
  });

  it('tom em português', () => {
    expect(keyLabel('D major')).toBe('Ré maior');
    expect(keyLabel('F# minor')).toBe('Fá♯ menor');
    expect(keyLabel('Bb major')).toBe('Si♭ maior');
    expect(keyLabel('modal')).toBe('modal');
  });

  it('duração e linha de detalhes', () => {
    expect(durationLabel(70)).toBe('1:10');
    expect(durationLabel(5.6)).toBe('0:06');
    expect(songMeta({ composer: 'Tradicional', bpm: 90, durationSeconds: 70 })).toBe('Tradicional · 90 BPM · 1:10');
    expect(songMeta({ composer: ' ', bpm: 60, durationSeconds: 32 })).toBe('60 BPM · 0:32');
  });

  it('cordas usadas somam 100% e só contam ataques', () => {
    for (const { song } of FIXED_SONGS) {
      const shares = stringShares(song);
      expect(shares.map((s) => s.letter)).toEqual(['G', 'D', 'A', 'E']);
      expect(shares.reduce((a, s) => a + s.percent, 0)).toBe(100);
      expect(noteCount(song)).toBeGreaterThan(0);
    }
  });

  it('escala de Ré: só Ré e Lá', () => {
    const scale = FIXED_SONGS.find((s) => s.id === 'escala-re-maior')!.song;
    const shares = Object.fromEntries(stringShares(scale).map((s) => [s.letter, s.percent]));
    expect(shares.G).toBe(0);
    expect(shares.D + shares.A + shares.E).toBe(100);
  });
});
