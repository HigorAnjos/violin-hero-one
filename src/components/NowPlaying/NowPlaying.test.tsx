import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { describe, expect, it } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { holdText, placeLine } from './nowPlaying';
import { NowPlaying } from './NowPlaying';

describe('holdText', () => {
  it('em tempos arredondados ao meio', () => {
    expect(holdText(0.5)).toBe('meio tempo');
    expect(holdText(0.2)).toBe('meio tempo');
    expect(holdText(1)).toBe('1 tempo');
    expect(holdText(1.5)).toBe('1 tempo e meio');
    expect(holdText(2)).toBe('2 tempos');
    expect(holdText(2.5)).toBe('2 tempos e meio');
  });
});

describe('placeLine', () => {
  it('corda e dedo, ou corda solta', () => {
    expect(placeLine(2, 3)).toBe('corda Lá · 3º dedo');
    expect(placeLine(3, 0)).toBe('corda Mi solta');
  });
});

describe('NowPlaying', () => {
  it('a nota da vez com corda, dedo e duração, e a próxima', () => {
    render(
      <ThemeProvider theme={cadernoTheme}>
        <NowPlaying now={{ midi: 74, string: 2, finger: 3, beats: 2 }} next={{ midi: 66, string: 1, finger: 2, beats: 1 }} />
      </ThemeProvider>
    );
    const panel = screen.getByRole('region', { name: 'Nota atual' });
    expect(panel).toHaveTextContent('Ré5');
    expect(panel).toHaveTextContent('corda Lá · 3º dedo · segure 2 tempos');
    expect(panel).toHaveTextContent('Próxima: Fá♯4 · corda Ré · 2º dedo');
  });

  it('sem nota, o fim da música', () => {
    render(
      <ThemeProvider theme={cadernoTheme}>
        <NowPlaying now={null} next={null} />
      </ThemeProvider>
    );
    expect(screen.getByRole('region', { name: 'Nota atual' })).toHaveTextContent('Fim da música');
  });
});
