import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { renderScreen } from '../../shell/testing';
import { Badge } from './Badge';

describe('Badge', () => {
  it('selo de combo na cor da corda Sol', () => {
    const { container } = renderScreen(<Badge kind="combo" label="Combo 25" />);
    expect(screen.getByRole('img', { name: 'Selo Combo 25' })).toBeInTheDocument();
    expect(container.querySelector('path')).toHaveAttribute('stroke', cadernoTheme.game.strings.G.main);
  });

  it('bloqueado fica apagado e avisa', () => {
    const { container } = renderScreen(<Badge kind="combo" label="Combo 50" locked />);
    expect(screen.getByRole('img', { name: 'Selo Combo 50, bloqueado' })).toBeInTheDocument();
    expect(container.querySelector('path')).toHaveAttribute('stroke', cadernoTheme.colors.surfaceBorder);
  });
});
