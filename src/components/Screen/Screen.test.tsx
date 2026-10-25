import { screen } from '@testing-library/react';
import styled from 'styled-components';
import { describe, it, expect } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { clampLines, SongKicker } from './Screen';

const OneLine = styled.span`
  ${clampLines(1)}
`;

const LONG = 'Concerto para Violino em Mi Menor, Op. 64 — Allegro molto appassionato';

describe('clampLines', () => {
  it('uma linha: reticências, sem quebra e encolhe dentro de flex/grid', () => {
    renderScreen(<OneLine>{LONG}</OneLine>);
    expect(screen.getByText(LONG)).toHaveStyle({ minWidth: '0px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
  });

  it('o rótulo da música quebra em até duas linhas e mantém o texto inteiro para o leitor de tela', () => {
    renderScreen(<SongKicker>{LONG}</SongKicker>);
    const kicker = screen.getByText(LONG);
    expect(kicker).toHaveStyle({ minWidth: '0px', overflow: 'hidden', whiteSpace: 'normal', maxWidth: '100%' });
    expect(kicker).toHaveTextContent(LONG);
  });
});
