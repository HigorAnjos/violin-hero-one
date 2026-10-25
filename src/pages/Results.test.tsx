import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { playedResult } from '../components/ResultSummary/testing';
import { ODE } from '../game/engine/testing';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { Results } from './Results';

const render = (result = playedResult(), theme = palcoTheme) =>
  renderScreen(<Results />, { path: ROUTES.results, route: ROUTES.results, state: { song: ODE, mode: 'Arcade', result }, theme });

describe('Results', () => {
  it('pontos, estrelas, julgamentos e afinação por corda', () => {
    const result = playedResult();
    render(result);
    expect(screen.getByRole('heading', { name: 'Ode à Alegria' })).toBeInTheDocument();
    expect(screen.getByText('Resultado · Arcade · Fácil')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '5 de 5 estrelas' })).toBeInTheDocument();
    expect(screen.getByText('15/15')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Julgamentos' })).toHaveTextContent('Perfeito');
    expect(screen.getByRole('img', { name: /^Corda E:/ })).toBeInTheDocument();
    expect(screen.getByText('Nenhum trecho abaixo de 90%')).toBeInTheDocument();
  });

  it('selo novo aparece no topo: o mais difícil dos ganhos', () => {
    render({ ...playedResult(), badges: ['primeira-musica', 'combo-25'] });
    expect(screen.getByRole('status', { name: 'Selo conquistado nesta partida: Combo 25' })).toHaveTextContent('SELO NOVO!');
  });

  it('com erros mostra o trecho mais difícil e a corda que mais errou', () => {
    render(playedResult(5, 3));
    expect(screen.getByText(/^Trecho mais difícil · compasso/)).toBeInTheDocument();
    expect(screen.getByText(/^Corda \S+: \d+ notas? perdidas?/)).toBeInTheDocument();
  });

  it('título longo e pontuação de 7 dígitos ficam inteiros no texto, cortados só no visual', () => {
    const title = 'Concerto para Violino em Mi Menor, Op. 64 — Allegro molto appassionato (versão completa)';
    renderScreen(<Results />, {
      path: ROUTES.results,
      route: ROUTES.results,
      state: { song: { ...ODE, title }, mode: 'Arcade', result: { ...playedResult(), score: 9876543 } },
    });
    expect(screen.getByRole('heading', { name: title })).toHaveStyle({ overflow: 'hidden', minWidth: '0px' });
    expect(screen.getByText('9.876.543')).toHaveStyle({ whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
  });

  it('tocar de novo volta pela contagem; sem partida, volta ao início', () => {
    const { unmount } = render();
    expect(screen.getByRole('link', { name: /Tocar de novo/ })).toHaveAttribute('href', ROUTES.countdown);
    unmount();
    renderScreen(<Results />, { path: ROUTES.results, route: ROUTES.results });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });
});
