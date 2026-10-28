import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cadernoTheme, type Theme } from '../assets/styles/themes';
import { palcoTheme } from '../assets/styles/themes/palco';
import { neonTheme } from '../assets/styles/themes/specials';
import { ProgressError } from '../services/progress';
import type { Ranking as RankingData, RankingQuery, RankingRow } from '../services/ranking';
import { renderScreen } from '../shell/testing';
import { Ranking } from './Ranking';

// O cenário sem servidor não deve consultar o Supabase configurado no .env.local da worktree.
vi.mock('../services/supabase', () => ({ supabase: null }));

// Sem Supabase no teste os hooks só dariam "offline"; aqui eles devolvem o que cada cenário pede
type Fake = { data?: RankingData; error?: Error };
let fake: Fake | null = null;
let last: { songId: string; level: 'easy' | 'medium' | 'hard' } | null = null;
const asked: (RankingQuery | null)[] = [];
vi.mock('../services/ranking', async (original) => {
  const real = await original<typeof import('../services/ranking')>();
  return {
    ...real,
    useRanking: (query: RankingQuery | null, ...rest: unknown[]) => {
      asked.push(query);
      if (!fake) return real.useRanking(query, ...(rest as []));
      return { data: query ? fake.data : undefined, error: query ? (fake.error ?? null) : null, refetch: vi.fn() };
    },
    useLastRankedPlay: () => ({ isPending: false, data: last }),
  };
});

let compact = false;
beforeEach(() => {
  compact = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: compact, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
});

afterEach(() => {
  fake = null;
  last = null;
  asked.length = 0;
  vi.unstubAllGlobals();
  localStorage.clear();
});

const row = (rank: number, name: string, points: number, me = false): RankingRow => ({ rank, name, points, accuracy: 90 + (rank % 10) / 2, me });

const TOP: RankingRow[] = [
  row(1, 'Gato 4821', 9800),
  row(2, 'Raposa 1200', 9100),
  row(3, 'Pinguim 3003', 8700),
  row(4, 'Violinista 5555', 8000),
  row(5, 'Raposa 7777', 7600, true),
];

// A estante (cache no IndexedDB) e a sessão sem servidor respondem assíncronas: com a máquina carregada, 1 s não basta
const SLOW = { timeout: 5000 };

const account = (rows: RankingRow[]): Fake => ({ data: { rows, anonymous: false } });
const lastQuery = () => asked.filter(Boolean).at(-1);
const location = () => screen.getByTestId('location').textContent;
const positions = () =>
  within(screen.getByRole('table', { name: /^Ranking/ }))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0].textContent);

describe('Ranking', () => {
  it('sem servidor: abre na semana da primeira música da estante, no Fácil, e diz que precisa de internet', async () => {
    renderScreen(<Ranking />, { path: '/ranking' });
    expect(screen.getByRole('heading', { name: 'Ranking' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Escala de Ré maior' }, SLOW);
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Geral' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('combobox', { name: 'Música' })).toHaveDisplayValue('Escala de Ré maior');
    expect(screen.getByRole('combobox', { name: 'Nível' })).toHaveDisplayValue('Fácil');
    expect(await screen.findByText(/Sem conexão\. O ranking precisa de internet/, undefined, SLOW)).toBeInTheDocument();
    expect(lastQuery()).toEqual({ songId: 'escala-re-maior', level: 'easy', period: 'week' });
  });

  it('pódio 2º-1º-3º, a lista a partir do 4º e a linha do jogador destacada no lugar dela', () => {
    fake = account(TOP);
    renderScreen(<Ranking />, { path: '/ranking?musica=ode-a-alegria&nivel=medio' });
    expect(screen.getByRole('link', { name: 'Menu' })).toHaveAttribute('href', '/');
    const podium = within(screen.getByRole('list', { name: 'Pódio' }));
    expect(podium.getAllByRole('listitem').map((li) => li.querySelector('b')?.textContent)).toEqual(['2º', '1º', '3º']);
    expect(podium.getByText('Gato 4821')).toBeInTheDocument();
    expect(podium.getByText('9.800')).toBeInTheDocument();
    expect(positions()).toEqual(['4', '5']);
    const me = screen.getByRole('row', { current: true });
    expect(within(me).getByText(/Raposa 7777/)).toBeInTheDocument();
    expect(within(me).getByText(/você/)).toBeInTheDocument();
    expect(within(me).getByText('7.600')).toBeInTheDocument();
    // Com conta e no topo: sem convite e sem linha extra
    expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Sua posição' })).not.toBeInTheDocument();
    expect(lastQuery()).toEqual({ songId: 'ode-a-alegria', level: 'medium', period: 'week' });
  });

  it('fora do topo: a linha do jogador vem no rodapé, com a posição dele', () => {
    fake = account([...TOP.slice(0, 4), row(31, 'Gato 1111', 300, true)]);
    renderScreen(<Ranking />, { path: '/ranking?musica=ode-a-alegria' });
    const mine = within(screen.getByRole('table', { name: 'Sua posição' }));
    expect(mine.getByRole('row', { current: true })).toHaveTextContent(/^31.*Gato 1111 · você/);
    expect(positions()).toEqual(['4']);
  });

  it('convidado vê a lista e o convite para criar conta, que volta para este ranking', () => {
    fake = { data: { rows: TOP.map((r) => ({ ...r, me: false })), anonymous: true } };
    renderScreen(<Ranking />, { path: '/ranking?musica=ode-a-alegria&nivel=dificil&periodo=geral' });
    expect(screen.getByText(/Você está jogando sem conta/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/conta?motivo=ranking&depois=%2Franking%3Fmusica%3Dode-a-alegria%26nivel%3Ddificil%26periodo%3Dgeral&voltar=%2Franking%3Fmusica%3Dode-a-alegria%26nivel%3Ddificil%26periodo%3Dgeral'
    );
    expect(screen.queryByRole('row', { current: true })).not.toBeInTheDocument();
  });

  it('com conta e sem partida neste ranking: chama para tocar a música', () => {
    fake = account(TOP.slice(0, 2).map((r) => ({ ...r, me: false })));
    renderScreen(<Ranking />, { path: '/ranking?musica=ode-a-alegria&nivel=medio' });
    expect(screen.getByText(/Você ainda não está neste ranking\. Toque esta música no Médio até o fim/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tocar' })).toHaveAttribute('href', '/tocar?musica=ode-a-alegria');
  });

  it.each([
    ['week', 'semana', /Ninguém entrou no ranking desta semana no Fácil ainda\. A semana começa na segunda\./],
    ['all', 'geral', /Ninguém entrou neste ranking no Fácil ainda/],
  ])('vazio (%s): o aviso do período', (_period, slug, text) => {
    fake = account([]);
    renderScreen(<Ranking />, { path: `/ranking?musica=ode-a-alegria&periodo=${slug}` });
    expect(screen.getByRole('status')).toHaveTextContent(text);
    expect(screen.queryByRole('list', { name: 'Pódio' })).not.toBeInTheDocument();
  });

  it('nível que a música não tem e erro do servidor têm aviso próprio; carregando também', async () => {
    fake = { error: new ProgressError('not-found') };
    const { unmount } = renderScreen(<Ranking />, { path: '/ranking?musica=ode-a-alegria&nivel=dificil' });
    expect(screen.getByRole('status')).toHaveTextContent('Esta música não tem o nível Difícil. Escolha outro nível.');
    unmount();
    fake = { error: new ProgressError('server') };
    const second = renderScreen(<Ranking />, { path: '/ranking?musica=ode-a-alegria' });
    expect(screen.getByRole('status')).toHaveTextContent(/Não foi possível carregar o ranking agora/);
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    second.unmount();
    fake = {};
    renderScreen(<Ranking />, { path: '/ranking?musica=ode-a-alegria' });
    expect(screen.getByRole('status')).toHaveTextContent('Carregando o ranking…');
  });

  it('sem música no endereço, abre a última partida jogada (música e nível)', async () => {
    fake = account(TOP);
    last = { songId: 'brilha-brilha-estrelinha', level: 'hard' };
    renderScreen(<Ranking />, { path: '/ranking' });
    await screen.findByRole('option', { name: 'Brilha Brilha Estrelinha' }, SLOW);
    expect(lastQuery()).toEqual({ songId: 'brilha-brilha-estrelinha', level: 'hard', period: 'week' });
    expect(screen.getByRole('combobox', { name: 'Música' })).toHaveDisplayValue('Brilha Brilha Estrelinha');
    expect(screen.getByRole('combobox', { name: 'Nível' })).toHaveDisplayValue('Difícil');
  });

  it('trocar período, música e nível vai para o endereço e pede o ranking certo', async () => {
    fake = account(TOP);
    const user = userEvent.setup();
    renderScreen(<Ranking />, { path: '/ranking?musica=ode-a-alegria' });
    await screen.findByRole('option', { name: 'Escala de Ré maior' }, SLOW);
    await user.click(screen.getByRole('button', { name: 'Geral' }));
    expect(location()).toBe('/ranking?musica=ode-a-alegria&nivel=facil&periodo=geral');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Nível' }), 'Médio');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Música' }), 'Escala de Ré maior');
    expect(location()).toBe('/ranking?musica=escala-re-maior&nivel=medio&periodo=geral');
    expect(lastQuery()).toEqual({ songId: 'escala-re-maior', level: 'medium', period: 'all' });
  });

  it('mostra só nome gerado, posição, precisão e pontos: nada de apelido digitado nem e-mail', () => {
    localStorage.setItem('vh:profile', JSON.stringify({ nickname: 'Lia Souza', animal: 'fox', level: 'beginner' }));
    fake = account(TOP);
    renderScreen(<Ranking />, { path: '/ranking?musica=ode-a-alegria' });
    expect(screen.queryByText(/Lia Souza/)).not.toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  describe.each([
    ['Caderno', cadernoTheme],
    ['Palco', palcoTheme],
    ['Neon', neonTheme],
  ] as [string, Theme][])('tema %s', (_name, theme) => {
    it('1280×720: pódio, lista e os selos ao lado', () => {
      fake = account(TOP);
      renderScreen(<Ranking />, { path: '/ranking?musica=ode-a-alegria', theme });
      expect(screen.getByRole('list', { name: 'Pódio' })).toBeInTheDocument();
      expect(screen.getByRole('complementary', { name: 'Seus selos' })).toBeInTheDocument();
      expect(screen.getByText(/Próximo:/)).toBeInTheDocument();
      expect(positions()).toEqual(['4', '5']);
    });

    it('844×390: sem pódio nem painel de selos, todas as posições na lista', () => {
      compact = true;
      fake = account(TOP);
      renderScreen(<Ranking />, { path: '/ranking?musica=ode-a-alegria', theme });
      expect(screen.queryByRole('list', { name: 'Pódio' })).not.toBeInTheDocument();
      expect(screen.queryByRole('complementary', { name: 'Seus selos' })).not.toBeInTheDocument();
      expect(positions()).toEqual(['1', '2', '3', '4', '5']);
      expect(screen.getByRole('row', { current: true })).toHaveTextContent(/Raposa 7777 · você/);
    });
  });
});
