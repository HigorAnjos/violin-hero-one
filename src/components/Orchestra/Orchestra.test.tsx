import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { renderScreen } from '../../shell/testing';
import { Orchestra } from './Orchestra';
import { isLit, stageRows } from './stage';

const litSections = (container: HTMLElement) =>
  [...container.querySelectorAll('g[data-section][data-lit]')].map((g) => g.getAttribute('data-section'));

describe('stageRows', () => {
  it('senta os naipes em arcos simétricos, como no design', () => {
    const rows = stageRows();
    expect(rows.map((r) => [r.section, r.seats.length])).toEqual([
      ['strings', 16],
      ['woodwinds', 13],
      ['brass', 12],
      ['percussion', 7],
    ]);
    for (const { seats } of rows) {
      const first = seats[0];
      const last = seats[seats.length - 1];
      expect(first.x - 640).toBeCloseTo(640 - last.x, 0);
      expect(first.y).toBeCloseTo(last.y, 0);
    }
    expect(rows[0].seats[0]).toEqual({ x: expect.closeTo(881.4, -1), y: expect.closeTo(290.2, -1) });
  });

  it('acende os naipes na ordem de entrada', () => {
    expect(isLit(0, 'strings')).toBe(false);
    expect(isLit(1, 'strings')).toBe(true);
    expect(isLit(3, 'brass')).toBe(true);
    expect(isLit(3, 'percussion')).toBe(false);
  });
});

describe('Orchestra', () => {
  it('diz quantos naipes tocam e acende só esses', () => {
    const { container } = renderScreen(<Orchestra level={3} />);
    expect(screen.getByRole('img', { name: 'Orquestra ao fundo tocando junto: cordas, madeiras e metais' })).toBeInTheDocument();
    expect(litSections(container)).toEqual(['strings', 'woodwinds', 'brass']);
  });

  it('parada: nada aceso e o maestro à vista', () => {
    const { container } = renderScreen(<Orchestra level={0} maestro />);
    expect(litSections(container)).toEqual([]);
    expect(container.querySelector('[data-maestro]')).toBeInTheDocument();
  });

  it('decorativa fica fora da leitura de tela', () => {
    const { container } = renderScreen(<Orchestra level={4} decorative />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([cadernoTheme, palcoTheme])('pinta cada naipe com a cor do tema $name', (theme) => {
    const { container } = renderScreen(<Orchestra level={4} />, { theme });
    for (const [section, color] of Object.entries(theme.game.orchestra)) {
      const group = container.querySelector(`g[data-section="${section}"]`);
      expect(group?.innerHTML).toContain(color);
    }
  });
});
