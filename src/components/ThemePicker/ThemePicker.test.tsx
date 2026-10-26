import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SPECIAL_THEMES, THEME_STORAGE_KEY, THEMES, getTheme } from '../../assets/styles/themes';
import { ThemeChoiceProvider } from '../../shell/ThemeChoice';
import { ThemePicker } from './ThemePicker';

const renderPicker = () =>
  render(
    <ThemeChoiceProvider>
      <ThemePicker />
    </ThemeChoiceProvider>
  );

afterEach(() => localStorage.clear());

describe('ThemePicker', () => {
  it('catálogo e especiais em grupos separados, com o Caderno marcado', () => {
    renderPicker();
    const catalog = screen.getByRole('radiogroup', { name: 'Temas' });
    const specials = screen.getByRole('radiogroup', { name: 'Temas especiais' });
    expect(within(catalog).getAllByRole('radio')).toHaveLength(THEMES.length);
    expect(within(specials).getAllByRole('radio').map((r) => r.textContent)).toEqual(SPECIAL_THEMES.map((t) => t.name));
    expect(within(catalog).getByRole('radio', { name: /Caderno de música/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(specials).getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('cada miniatura é pintada com as cores do próprio tema', () => {
    const { container } = renderPicker();
    for (const theme of [...THEMES, ...SPECIAL_THEMES]) {
      const svg = container.querySelector<SVGSVGElement>(`svg[data-thumbnail="${theme.id}"]`)!;
      expect(svg.style.background).not.toBe('');
      const strokes = [...svg.querySelectorAll('line')].map((l) => l.getAttribute('stroke'));
      for (const s of ['G', 'D', 'A', 'E'] as const) expect(strokes).toContain(theme.game.strings[s].main);
    }
  });

  it('8-Bits com nota quadrada e Neon com brilho na miniatura', () => {
    const { container } = renderPicker();
    const notes = (id: string) => [...container.querySelectorAll(`svg[data-thumbnail="${id}"] rect[stroke]`)].map((r) => r.getAttribute('rx'));
    expect(notes('8-bits').every((rx) => rx === '0')).toBe(true);
    expect(notes('caderno').every((rx) => rx !== '0')).toBe(true);
    const glow = (id: string) => container.querySelectorAll(`svg[data-thumbnail="${id}"] [stroke-opacity], svg[data-thumbnail="${id}"] [fill-opacity]`).length;
    expect(glow('neon')).toBeGreaterThan(glow('caderno'));
  });

  it('escolher troca o tema na hora e guarda; o especial desmarca o catálogo', async () => {
    renderPicker();
    await userEvent.click(screen.getByRole('radio', { name: /^Palco/ }));
    expect(document.documentElement.dataset.theme).toBe('palco');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('palco');
    await userEvent.click(screen.getByRole('radio', { name: /8-Bits/ }));
    expect(document.documentElement.dataset.theme).toBe(getTheme('8-bits').id);
    expect(within(screen.getByRole('radiogroup', { name: 'Temas' })).getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('setas andam dentro do grupo e marcam', async () => {
    renderPicker();
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: /Caderno de música/ })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: /^Palco/ })).toHaveAttribute('aria-checked', 'true');
  });
});
