import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cadernoTheme, type Theme } from '../assets/styles/themes';
import { palcoTheme } from '../assets/styles/themes/palco';
import { pixelTheme } from '../assets/styles/themes/specials';
import { ChallengeError, type Challenge as ChallengeData, type ChallengeablePlay } from '../services/challenges';
import type { SessionState } from '../services/session';
import { renderScreen } from '../shell/testing';
import { Challenge, ChallengeInvite, deadlineText, resultText } from './Challenge';

// Sem Supabase no teste os hooks só dariam "offline": aqui devolvem o que cada cenário pede
type Query<T> = { data?: T; error?: Error | null };
let session: SessionState = { status: 'signed-in', userId: 'u1', anonymous: false };
let plays: Query<ChallengeablePlay[]> = {};
let one: Query<ChallengeData> = {};
let mine: Query<ChallengeData[]> = { data: [] };
const created: { data?: ChallengeData; error?: Error | null } = {};
const createMutate = vi.fn();
const acceptMutate = vi.fn();

vi.mock('../shell/useAccount', () => ({ useSession: () => session }));
vi.mock('../services/challenges', async (original) => {
  const real = await original<typeof import('../services/challenges')>();
  const query = <T,>(q: Query<T>) => ({ data: q.data, error: q.error ?? null, refetch: vi.fn() });
  return {
    ...real,
    useChallengeablePlays: () => query(plays),
    useChallenge: () => query(one),
    useMyChallenges: () => query(mine),
    useCreateChallenge: () => ({ mutate: createMutate, isPending: false, data: created.data, error: created.error ?? null }),
    useAcceptChallenge: () => ({ mutate: acceptMutate, isPending: false, data: undefined, error: null }),
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
  session = { status: 'signed-in', userId: 'u1', anonymous: false };
  plays = {};
  one = {};
  mine = { data: [] };
  delete created.data;
  delete created.error;
  createMutate.mockReset();
  acceptMutate.mockReset();
  vi.unstubAllGlobals();
});

const IN_TWO_DAYS = new Date(Date.now() + 2 * 86400e3 + 60e3).toISOString();

const challenge = (over: Partial<ChallengeData> = {}): ChallengeData => ({
  code: 'Ab3_k9-ZxQ2w',
  songId: 'ode-a-alegria',
  songTitle: 'Ode à Alegria',
  level: 'medium',
  targetScore: 4200,
  expiresAt: IN_TWO_DAYS,
  closed: false,
  challengerName: 'Gato 4821',
  role: 'visitor',
  entries: null,
  ...over,
});

const PLAYS: ChallengeablePlay[] = [
  { playId: 'p1', songId: 'ode-a-alegria', level: 'medium', score: 4200 },
  { playId: 'p2', songId: 'escala-re-maior', level: 'easy', score: 900 },
];

const THEMES = [
  ['Caderno', cadernoTheme],
  ['Palco', palcoTheme],
  ['8-Bits', pixelTheme],
] as [string, Theme][];

describe('textos do desafio', () => {
  it('prazo restante em dias, horas ou menos de 1 h; no fim, encerrado', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    expect(deadlineText('2026-10-30T13:00:00Z', false, now)).toBe('3 dias restantes');
    expect(deadlineText('2026-10-28T13:00:00Z', false, now)).toBe('1 dia restante');
    expect(deadlineText('2026-10-28T05:00:00Z', false, now)).toBe('17 h restantes');
    expect(deadlineText('2026-10-27T12:30:00Z', false, now)).toBe('menos de 1 h');
    expect(deadlineText('2026-10-27T12:30:00Z', true, now)).toBe('Encerrado');
  });

  it('o resultado visto por quem aceitou e pelo desafiante', () => {
    const entry = { name: 'Raposa 1234', me: false, acceptedAt: '', bestScore: 4300 };
    expect(resultText({ ...entry, result: 'won' }, 'entrant')).toBe('Você venceu!');
    expect(resultText({ ...entry, result: 'won' }, 'creator')).toBe('Passou você');
    expect(resultText({ ...entry, result: 'lost' }, 'creator')).toBe('Você venceu');
    expect(resultText({ ...entry, result: 'lost' }, 'entrant')).toBe('Não foi dessa vez');
    expect(resultText({ ...entry, result: 'tie' }, 'entrant')).toBe('Empate');
    expect(resultText({ ...entry, bestScore: null, result: null }, 'creator')).toBe('Ainda não tocou');
  });
});

describe('Desafiar um amigo (/desafio)', () => {
  it('escolhe o recorde e o prazo e cria o desafio com a partida certa', async () => {
    plays = { data: PLAYS };
    const user = userEvent.setup();
    renderScreen(<Challenge />, { path: '/desafio?partida=p2' });
    expect(screen.getByRole('heading', { name: 'Desafiar um amigo' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Música e nível' })).toHaveValue('p2');
    expect(screen.getByRole('button', { name: '2 dias' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '1 semana' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Música e nível' }), 'p1');
    await user.click(screen.getByRole('button', { name: /Criar desafio/ }));
    expect(createMutate).toHaveBeenCalledWith({ playId: 'p1', days: 7 });
  });

  it('criado: mostra o link completo para mandar e copiar', async () => {
    plays = { data: PLAYS };
    created.data = challenge({ role: 'creator', entries: [] });
    // A área de transferência de mentira é a do userEvent (setup troca a do navegador)
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    renderScreen(<Challenge />, { path: '/desafio' });
    const link = `${window.location.origin}/desafio/Ab3_k9-ZxQ2w`;
    expect(screen.getByRole('textbox', { name: 'Link do desafio' })).toHaveValue(link);
    expect(screen.getByRole('link', { name: 'Ver desafio' })).toHaveAttribute('href', '/desafio/Ab3_k9-ZxQ2w');
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenCalledWith(link);
    expect(await screen.findByText(/Link copiado/)).toBeInTheDocument();
  });

  it('sem conta: pede a conta pelo motivo desafio e volta para cá', () => {
    session = { status: 'signed-in', userId: 'u2', anonymous: true };
    renderScreen(<Challenge />, { path: '/desafio?partida=p1' });
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/conta?motivo=desafio&depois=%2Fdesafio&voltar=%2Fdesafio'
    );
    expect(screen.queryByRole('region', { name: 'Seus desafios' })).not.toBeInTheDocument();
  });

  it('sem recorde: chama para tocar; erro de limite aparece no status', () => {
    plays = { data: [] };
    const { unmount } = renderScreen(<Challenge />, { path: '/desafio' });
    expect(screen.getByText(/Toque uma música até o fim, fora da prática/)).toBeInTheDocument();
    unmount();
    plays = { data: PLAYS };
    created.error = new ChallengeError('refused');
    renderScreen(<Challenge />, { path: '/desafio' });
    expect(screen.getByRole('status')).toHaveTextContent('Esse desafio não pode ser feito agora.');
  });

  it('a lista ao lado: desafio recebido com o nome gerado e o enviado com o resultado', () => {
    plays = { data: PLAYS };
    mine = {
      data: [
        challenge({ role: 'entrant', entries: [{ name: 'Raposa 1234', me: true, acceptedAt: '', bestScore: null, result: null }] }),
        challenge({
          code: 'Zz9_k9-ZxQ2w',
          role: 'creator',
          challengerName: 'Raposa 1234',
          entries: [{ name: 'Pinguim 3003', me: false, acceptedAt: '', bestScore: 4400, result: 'won' }],
        }),
      ],
    };
    renderScreen(<Challenge />, { path: '/desafio' });
    const list = within(screen.getByRole('region', { name: 'Seus desafios' }));
    expect(list.getByText('Gato 4821')).toBeInTheDocument();
    expect(list.getByText('Ainda sem partida que conte')).toBeInTheDocument();
    expect(list.getByText('1 aceitaram')).toBeInTheDocument();
    expect(list.getAllByRole('link', { name: /Abrir/ }).map((a) => a.getAttribute('href'))).toEqual(['/desafio/Ab3_k9-ZxQ2w', '/desafio/Zz9_k9-ZxQ2w']);
  });

  describe.each(THEMES)('tema %s', (_name, theme) => {
    it('1280×720: convite, montar e a lista ao lado', () => {
      plays = { data: PLAYS };
      renderScreen(<Challenge />, { path: '/desafio', theme });
      expect(screen.getByRole('region', { name: 'Convidar por link' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Montar desafio' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Seus desafios' })).toBeInTheDocument();
    });

    it('844×390: sem o painel do convite; montar e a lista continuam', () => {
      compact = true;
      plays = { data: PLAYS };
      renderScreen(<Challenge />, { path: '/desafio', theme });
      expect(screen.queryByRole('region', { name: 'Convidar por link' })).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Montar desafio' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Seus desafios' })).toBeInTheDocument();
    });
  });
});

describe('Link do desafio (/desafio/:codigo)', () => {
  const open = (theme: Theme = cadernoTheme) => renderScreen(<ChallengeInvite />, { path: '/desafio/Ab3_k9-ZxQ2w', route: '/desafio/:codigo', theme });

  it('quem abre vê música, nível, pontos, prazo e o nome gerado; com conta, aceita', async () => {
    one = { data: challenge() };
    const user = userEvent.setup();
    open();
    expect(screen.getByRole('heading', { name: 'Gato 4821 te desafiou' })).toBeInTheDocument();
    const panel = within(screen.getByRole('region', { name: 'Desafio' }));
    expect(panel.getByText('Ode à Alegria')).toBeInTheDocument();
    expect(panel.getByText('4.200')).toBeInTheDocument();
    expect(panel.getByText('2 dias restantes')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Placar do desafio' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Aceitar desafio/ }));
    expect(acceptMutate).toHaveBeenCalledWith('Ab3_k9-ZxQ2w');
  });

  it('convidado: aceitar leva ao pedido de conta, que volta para o link', () => {
    session = { status: 'signed-in', userId: 'u2', anonymous: true };
    one = { data: challenge() };
    open();
    expect(screen.queryByRole('button', { name: /Aceitar desafio/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/conta?motivo=desafio&depois=%2Fdesafio%2FAb3_k9-ZxQ2w&voltar=%2Fdesafio%2FAb3_k9-ZxQ2w'
    );
  });

  it('quem aceitou: tocar agora vai direto à música e ao nível, e o placar mostra a própria linha', () => {
    one = { data: challenge({ role: 'entrant', entries: [{ name: 'Raposa 1234', me: true, acceptedAt: '', bestScore: 3900, result: null }] }) };
    open();
    expect(screen.getByRole('link', { name: /Tocar agora/ })).toHaveAttribute('href', '/tocar/carregando?modo=cordas-3d&musica=ode-a-alegria&nivel=medio');
    const board = within(screen.getByRole('region', { name: 'Placar do desafio' }));
    expect(board.getByText(/Raposa 1234 · você/)).toBeInTheDocument();
    expect(board.getByText('3.900')).toBeInTheDocument();
    expect(board.getByText('Ainda dá para passar')).toBeInTheDocument();
  });

  it('o desafiante vê o resultado de quem aceitou', () => {
    one = {
      data: challenge({
        role: 'creator',
        closed: true,
        entries: [
          { name: 'Raposa 1234', me: false, acceptedAt: '1', bestScore: 4300, result: 'won' },
          { name: 'Pinguim 3003', me: false, acceptedAt: '2', bestScore: 4000, result: 'lost' },
        ],
      }),
    };
    open();
    expect(screen.getByRole('heading', { name: 'Seu desafio' })).toBeInTheDocument();
    const board = within(screen.getByRole('region', { name: 'Placar do desafio' }));
    expect(board.getByText('Passou você')).toBeInTheDocument();
    expect(board.getByText('Você venceu')).toBeInTheDocument();
    expect(screen.getByText('Encerrado')).toBeInTheDocument();
  });

  it('código desconhecido e sem conexão têm aviso próprio', () => {
    one = { error: new ChallengeError('not-found') };
    const { unmount } = open();
    expect(screen.getByRole('status')).toHaveTextContent(/Não encontramos esse desafio/);
    unmount();
    one = { error: new ChallengeError('offline') };
    open();
    expect(screen.getByRole('status')).toHaveTextContent(/Sem conexão/);
  });

  describe.each(THEMES)('tema %s', (_name, theme) => {
    for (const size of ['1280×720', '844×390']) {
      it(`${size}: desafio e placar lado a lado, sem e-mail`, () => {
        compact = size === '844×390';
        one = { data: challenge({ role: 'entrant', entries: [{ name: 'Raposa 1234', me: true, acceptedAt: '', bestScore: null, result: null }] }) };
        open(theme);
        expect(screen.getByRole('region', { name: 'Desafio' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Placar do desafio' })).toBeInTheDocument();
        expect(screen.queryByText(/@/)).not.toBeInTheDocument();
      });
    }
  });
});
