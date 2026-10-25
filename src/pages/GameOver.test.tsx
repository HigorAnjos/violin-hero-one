import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { playedResult } from '../components/ResultSummary/testing';
import { ODE } from '../game/engine/testing';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { GameOver } from './GameOver';

const failed = () => {
  const result = playedResult(16, 2, false);
  expect(result.status).toBe('failed');
  return result;
};

describe('GameOver', () => {
  it('conta até onde chegou, com a orquestra parada e o que mais errou', () => {
    const result = failed();
    renderScreen(<GameOver />, { path: ROUTES.gameOver, route: ROUTES.gameOver, state: { song: ODE, mode: 'Arcade', result } });
    expect(screen.getByRole('heading', { name: 'A orquestra parou… por hoje!' })).toBeInTheDocument();
    expect(screen.getByText(`compasso ${result.reachedMeasure + 1} de 4`)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Orquestra ao fundo tocando junto: nenhum naipe' })).toBeInTheDocument();
    expect(screen.getByText(/^Corda /)).toBeInTheDocument();
  });

  it('tentar de novo e tocar sem falha voltam pela contagem', () => {
    renderScreen(<GameOver />, { path: ROUTES.gameOver, route: ROUTES.gameOver, state: { song: ODE, result: failed() } });
    expect(screen.getByRole('link', { name: /Tentar de novo/ })).toHaveAttribute('href', ROUTES.countdown);
    expect(screen.getByRole('link', { name: /Tocar sem falha/ })).toHaveAttribute('href', ROUTES.countdown);
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', ROUTES.home);
  });

  it('sem partida no estado volta ao início', () => {
    renderScreen(<GameOver />, { path: ROUTES.gameOver, route: ROUTES.gameOver });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });
});
