import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ThemeProvider } from 'styled-components';
import { cadernoTheme, THEMES, type Theme } from '../../assets/styles/themes';
import { StringLegend } from './StringLegend';

const renderWithTheme = (theme: Theme = cadernoTheme) =>
  render(
    <ThemeProvider theme={theme}>
      <StringLegend />
    </ThemeProvider>
  );

describe('StringLegend', () => {
  it('mostra as quatro cordas da mais grave para a mais aguda, com letra e nome', () => {
    renderWithTheme();
    const items = within(screen.getByRole('list', { name: 'Cordas do violino' })).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('aria-label'))).toEqual(['Sol (G)', 'Ré (D)', 'Lá (A)', 'Mi (E)']);
    expect(items.map((li) => li.textContent)).toEqual(['GSol', 'DRé', 'ALá', 'EMi']);
  });

  it.each(THEMES.map((t) => [t.id, t] as const))('pinta cada nota com a cor da corda no tema %s', (_id, theme) => {
    renderWithTheme(theme);
    for (const letter of ['G', 'D', 'A', 'E'] as const) {
      expect(screen.getByTestId(`string-note-${letter}`)).toHaveStyle({
        backgroundColor: theme.game.strings[letter].main,
        color: theme.game.strings[letter].text,
      });
    }
  });
});
