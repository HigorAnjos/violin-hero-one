import { describe, it, expect } from 'vitest';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { renderScreen } from '../../shell/testing';
import { OrchestraBackdrop } from './OrchestraBackdrop';

describe('OrchestraBackdrop', () => {
  it('decorativa: fica fora da leitura e pinta cada seção com a cor do tema', () => {
    const { container } = renderScreen(<OrchestraBackdrop />, { theme: palcoTheme });
    expect(container.querySelector('[aria-hidden="true"] svg')).toBeInTheDocument();
    const fills = new Set([...container.querySelectorAll('svg g[fill]')].map((g) => g.getAttribute('fill')));
    for (const color of Object.values(palcoTheme.game.orchestra)) expect(fills).toContain(color);
  });
});
