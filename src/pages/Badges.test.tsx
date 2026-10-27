import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../assets/styles/themes';
import { palcoTheme } from '../assets/styles/themes/palco';
import { pixelTheme } from '../assets/styles/themes/specials';
import { BADGES } from '../game/engine';
import type { Collection } from '../shell/progress';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { Badges, earnedText, missingFor } from './Badges';

// Sem Supabase no teste o hook só tem o aparelho; aqui ele pode devolver uma coleção pronta
let fake: Collection | null = null;
vi.mock('../shell/progress', async (original) => {
  const real = await original<typeof import('../shell/progress')>();
  return { ...real, useBadgeCollection: () => fake ?? real.useBadgeCollection(null) };
});

afterEach(() => {
  fake = null;
  localStorage.clear();
});

const FROM_SERVER: Collection = {
  earned: [
    {
      id: 'primeira-musica',
      source: 'server',
      earned: { id: 'primeira-musica', earnedAt: '2026-10-20T02:30:00Z', play: { songId: 'minueto', songTitle: 'Minueto em Sol', level: 'easy' } },
    },
    { id: 'sem-erros', source: 'device' },
  ],
  bestCombo: 21,
  bestCents: 12.4,
  status: 'server',
};

const cell = (label: string) => screen.getByRole('img', { name: new RegExp(`^Selo ${label}`) }).closest('li')!;

describe('Badges', () => {
  it('partida apagada: o selo continua conquistado, com a data e sem link da partida', () => {
    fake = { ...FROM_SERVER, earned: [{ id: 'primeira-musica', source: 'server', earned: { id: 'primeira-musica', earnedAt: '2026-10-20T15:00:00Z', play: null } }] };
    renderScreen(<Badges />);
    const badge = within(cell('Primeira música'));
    expect(badge.getByText('Ganho em 20/10/2026')).toBeInTheDocument();
    expect(badge.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Selos conquistados' })).toHaveAttribute('aria-valuenow', '1');
  });
  for (const theme of [cadernoTheme, palcoTheme, pixelTheme]) {
    it(`${theme.name}: ganhos com data e partida, a ganhar com o que falta e o progresso`, () => {
      fake = FROM_SERVER;
      renderScreen(<Badges />, { theme });
      expect(screen.getByRole('heading', { name: 'Seus selos' })).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: 'Selos conquistados' })).toHaveAttribute('aria-valuenow', '2');
      expect(screen.getByText(`2 de ${BADGES.length}`)).toBeInTheDocument();
      // Dia de São Paulo: 02:30 UTC do dia 20 ainda é dia 19 lá
      expect(within(cell('Primeira música')).getByText('Ganho em 19/10/2026 · Minueto em Sol (Fácil)')).toBeInTheDocument();
      expect(within(cell('Sem erros')).getByText('Ganho neste aparelho')).toBeInTheDocument();
      expect(within(cell('Combo 25')).getByText('Melhor combo: 21 · faltam 4 notas')).toBeInTheDocument();
      expect(within(cell('Combo 50')).getByRole('progressbar', { name: 'Progresso até Combo 50' })).toHaveAttribute('aria-valuenow', '42');
      expect(within(cell('Afinação de ouro')).getByText('Melhor afinação: ±12,4 ¢ · meta 10 ¢')).toBeInTheDocument();
      expect(screen.getAllByRole('img', { name: /bloqueado/ })).toHaveLength(BADGES.length - 2);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  }

  it('sem servidor: os do aparelho, as metas por escrito e o aviso', async () => {
    localStorage.setItem('vh:badges', JSON.stringify(['combo-25']));
    renderScreen(<Badges />);
    expect(await screen.findByRole('status')).toHaveTextContent('Sem conexão com o servidor: estes são os selos deste aparelho.');
    expect(within(cell('Combo 25')).getByText('Ganho neste aparelho')).toBeInTheDocument();
    expect(within(cell('Combo 50')).getByText('Acerte 50 notas seguidas')).toBeInTheDocument();
    expect(within(cell('Primeira música')).getByText('Toque uma música até o fim')).toBeInTheDocument();
  });

  it('volta ao Perfil e leva a tocar', () => {
    fake = FROM_SERVER;
    renderScreen(<Badges />);
    expect(screen.getByRole('link', { name: /Perfil/ })).toHaveAttribute('href', ROUTES.profile);
    expect(screen.getByRole('link', { name: 'Tocar' })).toHaveAttribute('href', expect.stringContaining(ROUTES.modes));
  });
});

describe('earnedText e missingFor', () => {
  it('música que saiu: a data e o aviso', () => {
    expect(earnedText({ id: 'combo-25', source: 'server', earned: { id: 'combo-25', earnedAt: '2026-10-20T15:00:00Z', play: { songId: 'x', songTitle: null, level: 'hard' } } })).toBe(
      'Ganho em 20/10/2026 · música removida (Difícil)'
    );
  });

  it('afinação melhor que a meta enche a barra; combo sem partida volta à meta por escrito', () => {
    const gold = BADGES.find((b) => b.id === 'afinacao-de-ouro')!;
    expect(missingFor(gold, { bestCombo: null, bestCents: 8 }).progress).toBe(1);
    const combo = BADGES.find((b) => b.id === 'combo-100')!;
    expect(missingFor(combo, { bestCombo: null, bestCents: null })).toEqual({ text: 'Acerte 100 notas seguidas', progress: null });
  });
});
