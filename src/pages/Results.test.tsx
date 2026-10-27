import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { PlayOutcome } from '../services/progress';
import { palcoTheme } from '../assets/styles/themes/palco';
import { playedResult } from '../components/ResultSummary/testing';
import { ODE } from '../game/engine/testing';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { practiceHardest, Results } from './Results';

// O que o servidor respondeu para a partida 'c1' (a fila de verdade precisa do Supabase)
const server = vi.hoisted(() => ({ outcome: undefined as PlayOutcome | undefined }));
vi.mock('../services/sync', () => ({ usePlayOutcome: (id?: string) => (id === 'c1' ? server.outcome : undefined) }));

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
    const pill = screen.getByRole('link', { name: 'Selo conquistado nesta partida: Combo 25. Ver seus selos' });
    expect(pill).toHaveTextContent('SELO NOVO!');
    expect(pill).toHaveAttribute('href', ROUTES.badges);
  });

  it('sem selo novo, o topo leva à coleção de selos', () => {
    render({ ...playedResult(), badges: [] });
    expect(screen.getByRole('link', { name: 'Seus selos' })).toHaveAttribute('href', ROUTES.badges);
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

  it('recorde: novo, "+X sobre o recorde" ou o recorde a bater', () => {
    const show = (record: object) => renderScreen(<Results />, { path: ROUTES.results, route: ROUTES.results, state: { song: ODE, mode: 'Arcade', result: { ...playedResult(), score: 5200 }, record } });
    let view = show({ previous: null, improved: true });
    expect(screen.getByText('Novo recorde!')).toHaveAttribute('role', 'status');
    view.unmount();
    view = show({ previous: 4000, improved: true });
    expect(screen.getByText('+1.200 sobre o recorde')).toBeInTheDocument();
    view.unmount();
    show({ previous: 6000, improved: false });
    expect(screen.queryByText(/sobre o recorde|Novo recorde/)).not.toBeInTheDocument();
    expect(screen.getByText('Recorde: 6.000')).toBeInTheDocument();
  });

  it('com a resposta do servidor, o recorde e os selos são os que ele confirmou; no reenvio, o recorde local', () => {
    const badge = (label: string) => screen.queryByRole('link', { name: `Selo conquistado nesta partida: ${label}. Ver seus selos` });
    const show = () =>
      renderScreen(<Results />, {
        path: ROUTES.results,
        route: ROUTES.results,
        state: {
          song: ODE,
          mode: 'Arcade',
          result: { ...playedResult(), score: 5200, badges: ['primeira-musica', 'combo-25'] },
          record: { previous: null, improved: true },
          clientId: 'c1',
        },
      });
    // O servidor confirmou só o combo: a primeira música já era da conta (outro aparelho)
    server.outcome = { playId: 'p', accuracy: 100, record: { previous: 6000, improved: false }, badges: ['combo-25'], streak: null, duplicate: false };
    let view = show();
    expect(screen.queryByText('Novo recorde!')).not.toBeInTheDocument();
    expect(screen.getByText('Recorde: 6.000')).toBeInTheDocument();
    expect(badge('Combo 25')).toBeInTheDocument();
    view.unmount();
    // O servidor não confirmou nenhum: nada de selo novo
    server.outcome = { ...server.outcome, badges: [] };
    view = show();
    expect(screen.getByRole('link', { name: 'Seus selos' })).toBeInTheDocument();
    view.unmount();
    // Reenvio: o recorde anterior não vem, vale o local; os selos são os daquela partida
    server.outcome = { ...server.outcome, badges: ['combo-25'], duplicate: true };
    view = show();
    expect(screen.getByText('Novo recorde!')).toBeInTheDocument();
    expect(badge('Combo 25')).toBeInTheDocument();
    view.unmount();
    server.outcome = undefined;
    show();
    expect(badge('Combo 25')).toBeInTheDocument();
  });

  it('o servidor nunca acrescenta um selo que o aparelho já tinha comemorado', () => {
    server.outcome = { playId: 'p', accuracy: 100, record: null, badges: ['primeira-musica', 'combo-25'], streak: null, duplicate: false };
    renderScreen(<Results />, {
      path: ROUTES.results,
      route: ROUTES.results,
      state: { song: ODE, mode: 'Arcade', result: { ...playedResult(), badges: ['primeira-musica'] }, clientId: 'c1' },
    });
    expect(screen.getByRole('link', { name: /Primeira música/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Combo 25/ })).not.toBeInTheDocument();
    server.outcome = undefined;
  });

  it('partida de prática: avisa que não vale selo nem recorde', () => {
    render({ ...playedResult(), laps: [], bestLap: null } as ReturnType<typeof playedResult>);
    expect(screen.getByText('Partida de prática: sem selos e sem recorde.')).toBeInTheDocument();
  });

  it('com trecho difícil, "Praticar compassos" abre a prática nele, a 70%', async () => {
    render(playedResult(5, 3));
    const link = screen.getByRole('link', { name: 'Praticar compassos' });
    await userEvent.click(link);
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.countdown);
    expect(practiceHardest({ from: 2, to: 3 })).toEqual({ loop: { startMeasure: 2, endMeasure: 3 }, speed: 0.7 });
  });

  it('sem trecho difícil, sem "Praticar compassos"', () => {
    renderScreen(<Results />, { path: ROUTES.results, route: ROUTES.results, state: { song: ODE, mode: 'Partitura', result: playedResult() } });
    expect(screen.queryByRole('link', { name: 'Praticar compassos' })).not.toBeInTheDocument();
  });
});
