import { screen } from '@testing-library/react';
import { beforeAll, describe, it, expect } from 'vitest';
import { playedResult } from '../components/ResultSummary/testing';
import { ODE } from '../game/engine/testing';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { BadgeEarned } from './BadgeEarned';

describe('BadgeEarned', () => {
  // A partida simulada sai do tempo dos testes: sob carga, simular e renderizar juntos passa de 5 s
  beforeAll(() => void playedResult());

  it('mostra o selo novo, os outros ganhos e leva ao resultado', () => {
    const result = { ...playedResult(), badges: ['primeira-musica', 'sem-erros'] as const };
    renderScreen(<BadgeEarned />, { path: ROUTES.badge, route: ROUTES.badge, state: { song: ODE, result: { ...result, badges: [...result.badges] } } });
    expect(screen.getByRole('heading', { name: 'Selo novo: Sem erros' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Selo Sem erros' })).toBeInTheDocument();
    expect(screen.getByText('Primeira música')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver resultado/ })).toHaveAttribute('href', ROUTES.results);
  });

  it('selo de combo mostra quanto falta para o próximo', () => {
    const result = { ...playedResult(), maxCombo: 30, badges: ['combo-25' as const] };
    renderScreen(<BadgeEarned />, { path: ROUTES.badge, route: ROUTES.badge, state: { song: ODE, result } });
    expect(screen.getByText(/Próximo: Combo 50 · faltam 20 notas/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progresso até o Combo 50' })).toHaveAttribute('aria-valuenow', '60');
  });

  it('sem selo novo vai direto ao resultado', () => {
    renderScreen(<BadgeEarned />, { path: ROUTES.badge, route: ROUTES.badge, state: { song: ODE, result: { ...playedResult(), badges: [] } } });
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.results);
  });
});
