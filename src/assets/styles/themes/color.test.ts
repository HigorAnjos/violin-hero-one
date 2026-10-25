import { describe, it, expect } from 'vitest';
import { contrast, deltaE, ensureContrast, mix, over, readableOn } from './color';

describe('color', () => {
  it('contraste WCAG nos extremos e num par conhecido', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('mix e over misturam em hex de 6 dígitos', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(over('#ff0000', 0.1, '#000000')).toBe('#1a0000');
  });

  it('ensureContrast só mexe quando precisa, e na direção certa', () => {
    expect(ensureContrast('#ffffff', ['#000000'], 4.5)).toBe('#ffffff');
    const fixedOnDark = ensureContrast('#585b70', ['#1e1e2e'], 4.5);
    expect(contrast(fixedOnDark, '#1e1e2e')).toBeGreaterThanOrEqual(4.5);
    const fixedOnLight = ensureContrast('#aaaaaa', ['#ffffff'], 4.5);
    expect(contrast(fixedOnLight, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('deltaE: zero para a mesma cor, grande entre opostos, simétrico', () => {
    expect(deltaE('#6b4bd8', '#6b4bd8')).toBe(0);
    expect(deltaE('#000000', '#ffffff')).toBeCloseTo(100, 0);
    expect(deltaE('#d63a8a', '#0b8fa8')).toBeCloseTo(deltaE('#0b8fa8', '#d63a8a'), 6);
    expect(deltaE('#777777', '#787878')).toBeLessThan(1);
  });

  it('readableOn escolhe o texto mais legível sobre o botão', () => {
    expect(readableOn('#89b4fa')).toBe('#0b0b0f');
    expect(readableOn('#205ea6')).toBe('#ffffff');
  });
});
