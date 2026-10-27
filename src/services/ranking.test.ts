import { describe, expect, it, vi } from 'vitest';
import { ProgressError, type ProgressClient } from './progress';
import { getRanking, lastRankedPlay, RANKING_LIMIT, rankingKeys } from './ranking';
import type { SessionState } from './session';

const ACCOUNT: SessionState = { status: 'signed-in', userId: 'u1', anonymous: false };
const GUEST: SessionState = { status: 'signed-in', userId: 'u2', anonymous: true };
const QUERY = { songId: 'ode-a-alegria', level: 'medium' as const, period: 'week' as const };

function fakeClient({ rpc = { data: [] as unknown, error: null as unknown }, select = { data: null as unknown, error: null as unknown } } = {}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(select).then(resolve, reject),
  };
  for (const fn of [query.select, query.eq, query.order, query.limit, query.maybeSingle]) fn.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  const rpcFn = vi.fn().mockResolvedValue(rpc);
  return { client: { auth: {}, from, rpc: rpcFn } as unknown as ProgressClient, rpc: rpcFn, from, query };
}

describe('getRanking', () => {
  it('pede a música, o nível, o período e o limite, e devolve só nome, posição, pontos, precisão e "você"', async () => {
    const { client, rpc } = fakeClient({
      rpc: {
        data: [
          { rank: 1, ranking_name: 'Gato 4821', points: 5400, accuracy: '98.50', is_me: false },
          { rank: 31, ranking_name: 'Raposa 1234', points: 900, accuracy: '61.00', is_me: true },
        ],
        error: null,
      },
    });
    const ranking = await getRanking(client, ACCOUNT, QUERY);
    expect(rpc).toHaveBeenCalledWith('get_ranking', { p_song_id: 'ode-a-alegria', p_level: 'medium', p_period: 'week', p_limit: RANKING_LIMIT });
    expect(ranking).toEqual({
      anonymous: false,
      rows: [
        { rank: 1, name: 'Gato 4821', points: 5400, accuracy: 98.5, me: false },
        { rank: 31, name: 'Raposa 1234', points: 900, accuracy: 61, me: true },
      ],
    });
  });

  it('convidado: a lista vem, marcada como anônima', async () => {
    const { client } = fakeClient();
    expect(await getRanking(client, GUEST, QUERY)).toEqual({ rows: [], anonymous: true });
  });

  it('sem cliente ou sem sessão: offline, sem chamar o servidor', async () => {
    const { client, rpc } = fakeClient();
    await expect(getRanking(null, ACCOUNT, QUERY)).rejects.toMatchObject({ kind: 'offline' });
    await expect(getRanking(client, { status: 'offline' }, QUERY)).rejects.toMatchObject({ kind: 'offline' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['P0002', 'not-found'],
    ['42501', 'offline'],
    [undefined, 'offline'],
    ['22023', 'server'],
  ])('erro %s vira %s', async (code, kind) => {
    const { client } = fakeClient({ rpc: { data: null, error: { code, message: 'x' } } });
    const error = await getRanking(client, ACCOUNT, QUERY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProgressError);
    expect(error).toMatchObject({ kind });
  });
});

describe('lastRankedPlay', () => {
  it('a última partida que vale ranking, das do próprio jogador', async () => {
    const { client, from, query } = fakeClient({ select: { data: { song_id: 'brilha-brilha', level: 'hard' }, error: null } });
    expect(await lastRankedPlay(client, ACCOUNT)).toEqual({ songId: 'brilha-brilha', level: 'hard' });
    expect(from).toHaveBeenCalledWith('plays');
    expect(query.eq).toHaveBeenCalledWith('counts_for_record', true);
    expect(query.order).toHaveBeenCalledWith('played_at', { ascending: false });
  });

  it('sem partida, ou nível desconhecido: null', async () => {
    expect(await lastRankedPlay(fakeClient().client, ACCOUNT)).toBeNull();
    expect(await lastRankedPlay(fakeClient({ select: { data: { song_id: 'x', level: 'expert' }, error: null } }).client, ACCOUNT)).toBeNull();
  });
});

describe('rankingKeys', () => {
  it('ficam debaixo do progresso: partida enviada e troca de conta refazem o ranking', () => {
    expect(rankingKeys.list(QUERY).slice(0, 2)).toEqual(['progress', 'ranking']);
    expect(rankingKeys.last.slice(0, 2)).toEqual(['progress', 'ranking']);
  });
});
