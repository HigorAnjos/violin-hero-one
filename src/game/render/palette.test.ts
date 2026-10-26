import { describe, expect, it } from 'vitest';
import { THEMES, cadernoTheme } from '../../assets/styles/themes';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { sheetPalette, strings3dPalette, toTint, trackPalette } from './palette';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

describe('toTint', () => {
  it('lê hex de 6 e de 3 dígitos', () => {
    expect(toTint('#6b4bd8')).toEqual({ color: 0x6b4bd8, alpha: 1 });
    expect(toTint('#fff')).toEqual({ color: 0xffffff, alpha: 1 });
  });

  it('lê o rgba do brilho das cordas', () => {
    expect(toTint('rgba(11, 143, 168, 0.25)')).toEqual({ color: 0x0b8fa8, alpha: 0.25 });
    expect(toTint('rgb(1, 2, 3)')).toEqual({ color: 0x010203, alpha: 1 });
  });

  it('recusa o que não é cor', () => {
    expect(() => toTint('azul')).toThrow();
  });
});

describe('trackPalette', () => {
  it('Caderno: trilhas G D A E com as cores e letras do tema', () => {
    const p = trackPalette(cadernoTheme);
    const s = cadernoTheme.game.strings;
    expect(p.lanes.map((l) => l.letter)).toEqual(['G', 'D', 'A', 'E']);
    expect(p.lanes.map((l) => hex(l.main))).toEqual([s.G.main, s.D.main, s.A.main, s.E.main]);
    expect(p.lanes.map((l) => hex(l.onNote))).toEqual([s.G.text, s.D.text, s.A.text, s.E.text]);
    expect(hex(p.track)).toBe(cadernoTheme.game.track);
    expect(hex(p.hitLine)).toBe(cadernoTheme.game.hitLine);
    expect(hex(p.trackLine)).toBe(cadernoTheme.game.trackLine);
    expect(hex(p.target)).toBe(cadernoTheme.colors.surface);
  });

  it('Palco: julgamentos e brilho vêm do tema escuro', () => {
    const p = trackPalette(palcoTheme);
    const g = palcoTheme.game;
    expect(hex(p.judgments.perfect)).toBe(g.judgments.perfect);
    expect(hex(p.judgments.miss)).toBe(g.judgments.miss);
    expect(hex(p.track)).toBe(g.track);
    expect(p.lanes[2].glow).toEqual(toTint(g.strings.A.glow));
    expect(p.lanes[2].glow.alpha).toBeLessThan(1);
    expect(hex(p.muted)).toBe(palcoTheme.colors.textMuted);
  });

  it.each(THEMES.map((t) => [t.id, t] as const))('%s: as 4 cordas têm cores diferentes', (_id, theme) => {
    const p = trackPalette(theme);
    expect(new Set(p.lanes.map((l) => l.main)).size).toBe(4);
  });
});

describe('sheetPalette', () => {
  it('Caderno: papel, pauta e tinta do caderno; cordas G D A E', () => {
    const p = sheetPalette(cadernoTheme);
    const t = cadernoTheme;
    expect(hex(p.paper)).toBe(t.game.track);
    expect(hex(p.line)).toBe(t.colors.textMuted);
    expect(hex(p.ink)).toBe(t.colors.text);
    expect(p.strings.map(hex)).toEqual([t.game.strings.G.main, t.game.strings.D.main, t.game.strings.A.main, t.game.strings.E.main]);
    expect(hex(p.needle)).toBe(t.colors.info.main);
  });

  it('Palco: tinta clara sobre o palco escuro, julgamentos do tema', () => {
    const p = sheetPalette(palcoTheme);
    const t = palcoTheme;
    expect(hex(p.paper)).toBe(t.game.track);
    expect(hex(p.ink)).toBe(t.colors.text);
    expect(hex(p.judgments.miss)).toBe(t.game.judgments.miss);
    expect(hex(p.needleText)).toBe(t.colors.info.text);
    expect(p.ink).not.toBe(sheetPalette(cadernoTheme).ink);
  });

  it.each(THEMES.map((t) => [t.id, t] as const))('%s: as 4 cordas da partitura são as da pista', (_id, theme) => {
    expect(sheetPalette(theme).strings).toEqual(trackPalette(theme).lanes.map((l) => l.main));
  });
});

describe('strings3dPalette', () => {
  it('Caderno: cordas G D A E com cor e letra do tema, chão do caderno', () => {
    const p = strings3dPalette(cadernoTheme);
    const t = cadernoTheme;
    const s = t.game.strings;
    expect(p.strings.map((l) => l.letter)).toEqual(['G', 'D', 'A', 'E']);
    expect(p.strings.map((l) => hex(l.main))).toEqual([s.G.main, s.D.main, s.A.main, s.E.main]);
    expect(p.strings.map((l) => hex(l.onNote))).toEqual([s.G.text, s.D.text, s.A.text, s.E.text]);
    expect(hex(p.floor)).toBe(t.game.track);
    expect(hex(p.grid)).toBe(t.game.trackLine);
    expect(hex(p.border)).toBe(t.colors.primary.main);
    expect(hex(p.muted)).toBe(t.colors.textMuted);
    expect(hex(p.ink)).toBe(t.colors.text);
  });

  it('Palco: neon sobre o chão escuro, mesmas cordas da pista', () => {
    const p = strings3dPalette(palcoTheme);
    const t = palcoTheme;
    expect(hex(p.floor)).toBe(t.game.track);
    expect(hex(p.ink)).toBe(t.colors.text);
    expect(hex(p.strings[3].main)).toBe(t.game.strings.E.main);
    expect(p.strings[2].glow).toEqual(toTint(t.game.strings.A.glow));
    expect(p.floor).not.toBe(strings3dPalette(cadernoTheme).floor);
  });

  it.each(THEMES.map((t) => [t.id, t] as const))('%s: as cordas 3D são as da pista', (_id, theme) => {
    expect(strings3dPalette(theme).strings).toEqual(trackPalette(theme).lanes);
  });
});
