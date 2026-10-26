import { describe, it, expect } from 'vitest';
import { THEMES, SPECIAL_THEMES, getTheme, DEFAULT_THEME } from './index';
import { base } from './base';
import { CADERNO } from './caderno';
import { OMARCHY_PALETTES } from './omarchy';
import { contrast, deltaE, over } from './color';
import type { StringName } from './types';

// Fundo translúcido rgba(r, g, b, a) pintado sobre o cartão, como o usuário vê
const solidOver = (rgbaColor: string, surface: string) => {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(rgbaColor);
  if (!m) return rgbaColor;
  const hex = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
  return over(hex, Number(m[4]), surface);
};

const AA = 4.5;
const UI = 3;
/** Abaixo disso duas cordas começam a parecer a mesma cor. */
const MIN_STRING_DISTANCE = 25;
const STRINGS: StringName[] = ['G', 'D', 'A', 'E'];

describe('catálogo de temas', () => {
  it('Caderno é o padrão e vem primeiro; ids únicos', () => {
    expect(DEFAULT_THEME.id).toBe('caderno');
    expect(THEMES[0]).toBe(DEFAULT_THEME);
    expect(THEMES.slice(0, 2).map((t) => t.id)).toEqual(['caderno', 'palco']);
    expect(new Set([...THEMES, ...SPECIAL_THEMES].map((t) => t.id)).size).toBe(THEMES.length + SPECIAL_THEMES.length);
  });

  it('paletas do Omarchy entram no catálogo, claras antes das escuras', () => {
    expect(THEMES.length).toBe(2 + OMARCHY_PALETTES.length);
    expect(OMARCHY_PALETTES.length).toBeGreaterThanOrEqual(10);
    const modes = THEMES.slice(2).map((t) => t.mode);
    expect(modes).toEqual([...modes].sort((a, b) => (a === b ? 0 : a === 'light' ? -1 : 1)));
  });

  it('id inválido ou vazio cai no Caderno', () => {
    expect(getTheme('nao-existe')).toBe(DEFAULT_THEME);
    expect(getTheme(null)).toBe(DEFAULT_THEME);
    expect(getTheme('')).toBe(DEFAULT_THEME);
    expect(getTheme('__proto__')).toBe(DEFAULT_THEME);
    expect(getTheme('palco').name).toBe('Palco');
    expect(getTheme('8-bits').special).toBe('pixel');
  });

  it('cores das cordas no Caderno são as do produto, sem ajuste', () => {
    const s = DEFAULT_THEME.game.strings;
    expect([s.G.main, s.D.main, s.A.main, s.E.main]).toEqual(['#6b4bd8', '#d63a8a', '#0b8fa8', '#b87800']);
    expect(s).toMatchObject(Object.fromEntries(STRINGS.map((n) => [n, { main: CADERNO.strings[n] }])));
  });

  it('especiais ficam fora do catálogo de cor', () => {
    for (const t of SPECIAL_THEMES) {
      expect(t.special).toBeDefined();
      expect(THEMES).not.toContain(t);
    }
    expect(THEMES.every((t) => !t.special)).toBe(true);
  });

  it('8-Bits: fonte pixel, cantos retos e notas quadradas; o resto do catálogo não', () => {
    const pixel = getTheme('8-bits');
    expect(pixel.fonts.display).toMatch(/^'Pixelify Sans'/);
    expect(pixel.fonts.ui).toMatch(/^'Pixelify Sans'/);
    expect(pixel.fonts.music).toBe(base.fonts.music);
    expect(Object.values(pixel.borderRadius).every((r) => r === '0')).toBe(true);
    expect(pixel.game.noteShape).toBe('square');
    expect(THEMES.every((t) => t.game.noteShape === 'round')).toBe(true);
  });

  it('Neon: brilho nas notas e na pista; o resto do catálogo sem brilho extra', () => {
    const neon = getTheme('neon');
    expect(neon.special).toBe('neon');
    expect(neon.game.glow).toBeGreaterThan(0);
    expect(neon.game.noteShape).toBe('round');
    expect(THEMES.every((t) => t.game.glow === 0)).toBe(true);
  });
});

describe.each(THEMES.map((t) => [t.id, t] as const))('estrutura do tema %s', (_id, theme) => {
  it('idêntica: só a cor muda', () => {
    expect(theme.fonts).toEqual(base.fonts);
    expect(theme.fonts.music).toMatch(/^'Noto Music'/);
    expect(theme.spacing).toEqual(base.spacing);
    expect(theme.borderRadius).toEqual(base.borderRadius);
  });
});

describe.each([...THEMES, ...SPECIAL_THEMES].map((t) => [t.id, t] as const))('tema %s', (_id, theme) => {
  const c = theme.colors;
  const g = theme.game;

  it('cores base em #rrggbb (há código que concatena transparência no fim)', () => {
    const solid = [c.background, c.surface, c.surfaceHover, c.surfaceBorder, c.text, c.textMuted, c.primary.main, g.track, g.hitLine];
    for (const color of [...solid, ...STRINGS.map((n) => g.strings[n].main)]) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('texto e texto secundário legíveis (AA) no cartão e na página', () => {
    for (const bg of [c.surface, c.background]) {
      expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(AA);
      expect(contrast(c.textMuted, bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('primária legível como texto e botão primário com texto legível', () => {
    expect(contrast(c.primary.main, c.surface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.primary.text, c.primary.main)).toBeGreaterThanOrEqual(AA);
  });

  it('foco (borda primária) visível contra a página (3:1)', () => {
    expect(contrast(c.primary.main, c.background)).toBeGreaterThanOrEqual(UI);
  });

  it.each(['danger', 'warning', 'success', 'info'] as const)('%s: legível em qualquer fundo', (tone) => {
    const t = c[tone];
    expect(contrast(t.main, c.surface)).toBeGreaterThanOrEqual(UI);
    for (const bg of [c.surface, c.background, solidOver(t.surface, c.surface)]) {
      expect(contrast(t.text, bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('cada corda se destaca da pista (3:1) e a letra é legível sobre a nota', () => {
    for (const name of STRINGS) {
      const s = g.strings[name];
      expect(contrast(s.main, g.track)).toBeGreaterThanOrEqual(UI);
      expect(contrast(s.text, s.main)).toBeGreaterThanOrEqual(UI);
    }
  });

  it('as 4 cordas são distantes entre si', () => {
    for (let i = 0; i < STRINGS.length; i++) {
      for (let j = i + 1; j < STRINGS.length; j++) {
        const [a, b] = [g.strings[STRINGS[i]].main, g.strings[STRINGS[j]].main];
        expect(deltaE(a, b), `${STRINGS[i]} × ${STRINGS[j]}`).toBeGreaterThanOrEqual(MIN_STRING_DISTANCE);
      }
    }
  });

  it('linha de acerto e julgamentos visíveis sobre a pista', () => {
    expect(contrast(g.hitLine, g.track)).toBeGreaterThanOrEqual(UI);
    for (const color of Object.values(g.judgments)) {
      expect(contrast(color, g.track)).toBeGreaterThanOrEqual(UI);
    }
  });
});
