import { act, screen } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { playedResult } from '../components/ResultSummary/testing';
import { ODE } from '../game/engine/testing';
import type { PlayOutcome } from '../services/progress';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { BadgeEarned, OUTCOME_WAIT_MS } from './BadgeEarned';

// O que o servidor respondeu para a partida 'c1' (a fila de verdade precisa do Supabase)
const server = vi.hoisted(() => ({ outcome: undefined as PlayOutcome | undefined }));
vi.mock('../services/sync', () => ({ usePlayOutcome: (id?: string) => (id === 'c1' ? server.outcome : undefined) }));

// A partida simulada do beforeAll e a primeira renderização com o selo animado passam dos 5 s sob carga
vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });

const outcome = (badges: PlayOutcome['badges']): PlayOutcome => ({ playId: 'p', accuracy: 100, record: null, badges, streak: null, duplicate: false });

function signedIn() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['session'], { status: 'signed-in', userId: 'u1', anonymous: true });
  return queryClient;
}

describe('BadgeEarned', () => {
  // A partida simulada sai do tempo dos testes: sob carga, simular e renderizar juntos passa de 5 s
  beforeAll(() => void playedResult());
  afterEach(() => {
    server.outcome = undefined;
    vi.useRealTimers();
  });

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

  it('com a resposta do servidor, comemora só o que ele confirmou', () => {
    server.outcome = outcome(['primeira-musica']);
    const result = { ...playedResult(), badges: ['primeira-musica' as const, 'sem-erros' as const] };
    renderScreen(<BadgeEarned />, { path: ROUTES.badge, route: ROUTES.badge, state: { song: ODE, result, clientId: 'c1' }, queryClient: signedIn() });
    expect(screen.getByRole('heading', { name: 'Selo novo: Primeira música' })).toBeInTheDocument();
    expect(screen.queryByText(/Sem erros/)).not.toBeInTheDocument();
  });

  it('o servidor diz que o selo já era da conta: vai ao resultado sem comemorar', () => {
    server.outcome = outcome([]);
    const result = { ...playedResult(), badges: ['sem-erros' as const] };
    renderScreen(<BadgeEarned />, { path: ROUTES.badge, route: ROUTES.badge, state: { song: ODE, result, clientId: 'c1' }, queryClient: signedIn() });
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.results);
  });

  it('com sessão, espera a resposta um instante; sem ela no prazo, comemora o local', () => {
    vi.useFakeTimers();
    const result = { ...playedResult(), badges: ['sem-erros' as const] };
    renderScreen(<BadgeEarned />, { path: ROUTES.badge, route: ROUTES.badge, state: { song: ODE, result, clientId: 'c1' }, queryClient: signedIn() });
    expect(screen.getByRole('status')).toHaveTextContent('Conferindo seus selos…');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(OUTCOME_WAIT_MS));
    expect(screen.getByRole('heading', { name: 'Selo novo: Sem erros' })).toBeInTheDocument();
  });

  it('sem sessão (offline), não espera: comemora o local na hora', () => {
    const result = { ...playedResult(), badges: ['sem-erros' as const] };
    renderScreen(<BadgeEarned />, { path: ROUTES.badge, route: ROUTES.badge, state: { song: ODE, result, clientId: 'c1' } });
    expect(screen.getByRole('heading', { name: 'Selo novo: Sem erros' })).toBeInTheDocument();
  });
});
