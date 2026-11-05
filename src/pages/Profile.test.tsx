import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BADGES } from '../game/engine';
import { CATALOG_ORDER } from '../game/notation/catalog';
import { shiftDay } from '../services/history';
import { todayInBrazil } from '../services/progress';
import { fakeCatalogClient } from '../services/testing';
import { loadLocalProgress, type Progress } from '../shell/progress';
import { renderScreen } from '../shell/testing';
import { goalFor, minuteBars, Profile } from './Profile';

// A estante: sem banco, as embutidas; com o catálogo falso, as músicas, os exercícios e as do jogador
const db = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('../services/supabase', () => ({
  get supabase() {
    return db.client;
  },
}));

// Sem Supabase no teste o hook só tem o aparelho; aqui ele pode devolver um progresso pronto
let fake: Progress | null = null;
vi.mock('../shell/progress', async (original) => {
  const real = await original<typeof import('../shell/progress')>();
  return { ...real, useProgress: () => fake ?? real.loadLocalProgress() };
});

afterEach(() => {
  fake = null;
  db.client = null;
  localStorage.clear();
});

const today = todayInBrazil();
const at = (daysAgo: number) => `${shiftDay(today, daysAgo)}T15:00:00Z`;

function withHistory(): Progress {
  return {
    ...loadLocalProgress(),
    nickname: 'Lia',
    animal: 'fox',
    level: 'beginner',
    records: [
      { songId: 'ode-a-alegria', level: 'medium', score: 9000, accuracy: 95 },
      { songId: 'escala-re-maior', level: 'easy', score: 5000, accuracy: 99 },
    ],
    badges: ['primeira-musica', 'combo-25'],
    streakDays: 12,
    history: {
      days: [
        { day: shiftDay(today, 1), seconds: 42 * 60, marked: true },
        { day: shiftDay(today, 2), seconds: 100 * 60, marked: true },
        { day: shiftDay(today, 20), seconds: 999 * 60, marked: true },
      ],
      plays: [
        { playedAt: at(24), stringCents: [11, 10, 14, 20] },
        { playedAt: at(1), stringCents: [3, -2, 8, 12] },
      ],
    },
  };
}

describe('Profile', () => {
  it('aparelho novo, sem servidor: nome padrão, nada conquistado e convite para tocar com internet', () => {
    renderScreen(<Profile />);
    expect(screen.getByRole('heading', { name: 'Violinista' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Selos conquistados' })).toHaveAttribute('aria-valuenow', '0');
    expect(within(screen.getByRole('region', { name: 'Sequência' })).getByText('—')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Minutos por dia' })).getByText(/quando você toca com internet/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Afinação por corda' })).getByText(/^Toque com internet .* semana a semana/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Conquistas' })).getAllByRole('img', { name: /bloqueado/ })).toHaveLength(BADGES.length);
    expect(screen.getByText('Toque uma música até o fim')).toBeInTheDocument();
  });

  it('com o histórico do servidor e nenhuma afinação medida: falta tocar, não falta internet', () => {
    fake = { ...withHistory(), history: { days: [], plays: [] } };
    renderScreen(<Profile />);
    const strings = within(screen.getByRole('region', { name: 'Afinação por corda' }));
    expect(strings.getByText('Toque uma música e a afinação de cada corda aparece aqui, semana a semana.')).toBeInTheDocument();
    expect(strings.queryByText(/internet/)).not.toBeInTheDocument();
  });

  it('músicas aprendidas contam como a Biblioteca: as músicas e as importadas, sem os exercícios', async () => {
    db.client = fakeCatalogClient({ own: [{ id: 'importada-1', title: 'Minha importada', origin: 'imported' }] }).client;
    fake = {
      ...withHistory(),
      records: [
        { songId: 'ode-a-alegria', level: 'medium', score: 9000, accuracy: 95 },
        { songId: 'importada-1', level: 'hard', score: 9000, accuracy: 90 },
        { songId: 'staccato-la-maior', level: 'medium', score: 9000, accuracy: 99 },
      ],
    };
    renderScreen(<Profile />);
    // As 10 músicas do catálogo (antes dos exercícios) e a importada
    const musics = CATALOG_ORDER.indexOf('staccato-la-maior') + 1;
    const learned = within(screen.getByRole('region', { name: 'Músicas aprendidas' }));
    expect(await learned.findByText(`de ${musics}`)).toBeInTheDocument();
    expect(learned.getByText(/^2/)).toBeInTheDocument();
  });

  it('com histórico: sequência com os 7 dias, semana, músicas aprendidas, afinação e as 4 cordas', () => {
    fake = withHistory();
    renderScreen(<Profile />);
    expect(screen.getByRole('heading', { name: 'Lia' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Raposa' })).toBeInTheDocument();
    expect(screen.getByText('Estou começando')).toBeInTheDocument();

    const streak = within(screen.getByRole('region', { name: 'Sequência' }));
    expect(streak.getByText('12 dias')).toBeInTheDocument();
    expect(streak.getByRole('img', { name: 'Tocou em 2 dos últimos 7 dias' })).toBeInTheDocument();
    expect(streak.getByText('Toque hoje para manter')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Prática na semana' })).getByText('2h 22min')).toBeInTheDocument();
    // Ode no Médio a 95% conta; a escala no Fácil não
    expect(within(screen.getByRole('region', { name: 'Músicas aprendidas' })).getByText(/^1/)).toBeInTheDocument();
    const tuning = within(screen.getByRole('region', { name: 'Afinação média' }));
    expect(tuning.getByText('±6 ¢')).toBeInTheDocument();
    expect(tuning.getByText('Era ±14 ¢ há um mês')).toBeInTheDocument();

    expect(screen.getByRole('img', { name: /hoje 0, maior dia 100 minutos/ })).toBeInTheDocument();
    const strings = within(screen.getByRole('region', { name: 'Afinação por corda' }));
    expect(within(strings.getByRole('group', { name: 'Corda Sol' })).getByText('11 → 3 ¢')).toBeInTheDocument();
    expect(within(strings.getByRole('group', { name: 'Corda Mi' })).getByText('20 → 12 ¢')).toBeInTheDocument();
    expect(strings.getByText(/A corda Mi ainda é a que mais escapa/)).toBeInTheDocument();
    expect(screen.getByText('Toque uma música inteira sem errar nenhuma nota')).toBeInTheDocument();
  });

  it('só prática hoje: os minutos somam, mas o dia não acende a sequência (quem decide é o servidor)', () => {
    const base = withHistory();
    fake = { ...base, history: { ...base.history!, days: [...base.history!.days, { day: today, seconds: 10 * 60, marked: false }] } };
    renderScreen(<Profile />);
    const streak = within(screen.getByRole('region', { name: 'Sequência' }));
    expect(streak.getByRole('img', { name: 'Tocou em 2 dos últimos 7 dias' })).toBeInTheDocument();
    expect(streak.getByText('Toque hoje para manter')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Prática na semana' })).getByText('2h 32min')).toBeInTheDocument();
  });

  it('minutos por dia na escala dos minutos inteiros: máximo 0 não enche barra nenhuma', () => {
    // Só 20 s hoje: 0 min, nenhuma barra cheia (antes a de hoje enchia com "maior: 0 min")
    expect(minuteBars([...Array(13).fill(0), 20])).toEqual({ minutes: Array(14).fill(0), tallest: 0, heights: Array(14).fill(0) });
    expect(minuteBars(Array(14).fill(0)).heights.every((h) => h === 0)).toBe(true);
    const { tallest, heights } = minuteBars([...Array(12).fill(0), 600, 300]);
    expect(tallest).toBe(10);
    expect(heights.slice(-2)).toEqual([100, 50]);
  });

  it('só segundos hoje: a barra de hoje fica vazia e o rótulo diz maior: 0 min', () => {
    const base = withHistory();
    fake = { ...base, history: { ...base.history!, days: [{ day: today, seconds: 20, marked: false }] } };
    renderScreen(<Profile />);
    const card = screen.getByRole('region', { name: 'Minutos por dia' });
    expect(within(card).getByRole('img', { name: /hoje 0, maior dia 0 minutos/ })).toBeInTheDocument();
    const bars = card.querySelectorAll<HTMLElement>('[role="img"] i');
    expect([...bars].map((b) => b.style.height)).toEqual(Array(14).fill('0%'));
    expect(bars[13]).toHaveAttribute('data-empty');
  });

  it('metas no imperativo para cada selo', () => {
    expect(BADGES.map(goalFor)).toEqual([
      'Toque uma música até o fim',
      'Toque uma música inteira sem errar nenhuma nota',
      'Acerte 25 notas seguidas',
      'Acerte 50 notas seguidas',
      'Acerte 100 notas seguidas',
      'Termine uma música com afinação média de até 10 ¢',
    ]);
  });

  it('Menu, Ranking, Configurações e Tocar', async () => {
    renderScreen(<Profile />);
    expect(screen.getByRole('link', { name: 'Ranking' })).toHaveAttribute('href', '/ranking');
    await userEvent.click(screen.getByRole('link', { name: 'Configurações' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/configuracoes');
    expect(screen.getByRole('link', { name: /Menu/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Tocar' })).toHaveAttribute('href', expect.stringMatching(/^\/tocar/));
  });

  it('Conquistas leva à coleção de selos', () => {
    fake = withHistory();
    renderScreen(<Profile />);
    expect(screen.getByRole('link', { name: `Ver todos os selos: 2 de ${BADGES.length}` })).toHaveAttribute('href', '/selos');
  });
});
