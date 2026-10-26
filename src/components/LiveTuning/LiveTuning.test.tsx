import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { describe, expect, it } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { tuningBands } from '../Tuner/tuner';
import { liveTrace, liveWord, LiveTuning } from './LiveTuning';

describe('liveWord', () => {
  it('afinado na faixa Perfeito do nível, senão para que lado', () => {
    expect(liveWord(6, tuningBands(50))).toEqual({ word: 'AFINADO', zone: 'perfect' });
    expect(liveWord(23, tuningBands(50))).toEqual({ word: 'ALTO ▴', zone: 'great' });
    expect(liveWord(23, tuningBands(60))).toEqual({ word: 'AFINADO', zone: 'perfect' });
    expect(liveWord(-40, tuningBands(50))).toEqual({ word: 'BAIXO ▾', zone: 'off' });
  });
});

describe('liveTrace', () => {
  it('mais recente à direita; a tolerância ocupa a altura toda', () => {
    const pts = liveTrace(
      [
        { age: 2, cents: 0 },
        { age: 0, cents: 60 },
      ],
      tuningBands(60)
    );
    expect(pts[0]).toEqual({ x: 0, y: 60 });
    expect(pts[1]).toEqual({ x: 342, y: 0 });
  });
});

describe('LiveTuning', () => {
  it('Hz, desvio e palavra', () => {
    render(
      <ThemeProvider theme={cadernoTheme}>
        <LiveTuning trace={[]} liveCents={6} targetHz={590} />
      </ThemeProvider>
    );
    const panel = screen.getByRole('region', { name: 'Afinação ao vivo' });
    expect(panel).toHaveTextContent('+6 ¢');
    expect(panel).toHaveTextContent('AFINADO');
    expect(panel).toHaveTextContent(/592,0 Hz/);
  });

  it('sem som, espera o arco', () => {
    render(
      <ThemeProvider theme={cadernoTheme}>
        <LiveTuning trace={[]} liveCents={null} targetHz={null} />
      </ThemeProvider>
    );
    expect(screen.getByRole('region', { name: 'Afinação ao vivo' })).toHaveTextContent('ESPERANDO O ARCO');
  });
});
