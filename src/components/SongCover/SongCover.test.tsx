import { describe, expect, it } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { CATALOG_ORDER } from '../../game/notation/catalog';
import { renderScreen } from '../../shell/testing';
import { coverSeed, SongCover } from './SongCover';

describe('SongCover', () => {
  it('a mesma música sempre tem a mesma capa; o catálogo não sai todo igual', () => {
    expect(coverSeed('greensleeves')).toBe(coverSeed('greensleeves'));
    const covers = new Set(CATALOG_ORDER.map((id) => renderScreen(<SongCover id={id} />).container.innerHTML));
    expect(covers.size).toBeGreaterThan(5);
  });

  it.each([cadernoTheme, palcoTheme])('desenha com as cordas do tema $id, escondida do leitor', (theme) => {
    const { container } = renderScreen(<SongCover id="aleluia" />, { theme });
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    const strings = Object.values(theme.game.strings).map((s) => s.main);
    expect(strings.some((color) => svg.innerHTML.includes(color))).toBe(true);
  });
});
