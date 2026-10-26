import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { renderScreen } from '../../shell/testing';
import { ViolinArt } from './ViolinArt';

describe('ViolinArt', () => {
  it('é decoração: fora do leitor de tela', () => {
    renderScreen(<ViolinArt />);
    expect(screen.getByTestId('violin-art')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([cadernoTheme, palcoTheme])('pinta com o tema $id: madeira, halo e as cordas', (theme) => {
    const { container } = renderScreen(<ViolinArt />, { theme });
    const html = container.innerHTML;
    for (const color of [theme.art.wood, theme.art.halo, theme.art.ebony, ...Object.values(theme.game.strings).map((s) => s.main)]) {
      expect(html).toContain(color);
    }
  });
});
