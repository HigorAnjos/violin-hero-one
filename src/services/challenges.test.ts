import { describe, expect, it, vi } from 'vitest';
import { acceptChallenge, createChallenge, getChallenge, listChallengeablePlays, listMyChallenges } from './challenges';
import type { ProgressClient } from './progress';
import type { SessionState } from './session';

const ACCOUNT: SessionState = { status: 'signed-in', userId: 'u1', anonymous: false };
const GUEST: SessionState = { status: 'signed-in', userId: 'u2', anonymous: true };

const ROW = {
  code: 'Ab3_k9-ZxQ2w',
  song_id: 'ode-a-alegria',
  song_title: 'Ode à Alegria',
  level: 'medium',
  target_score: 4200,
  expires_at: '2026-10-29T12:00:00Z',
  closed: false,
  challenger_name: 'Gato 4821',
  role: 'creator',
  entries: [{ name: 'Raposa 1234', is_me: false, accepted_at: '2026-10-27T13:00:00Z', best_score: 4300, result: 'won' }],
};

function fakeClient({ rpc = { data: ROW as unknown, error: null as unknown }, select = { data: [] as unknown, error: null as unknown } } = {}) {
  const query = {
    select: vi.fn(),
    order: vi.fn(),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(select).then(resolve, reject),
  };
  for (const fn of [query.select, query.order]) fn.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  const rpcFn = vi.fn().mockResolvedValue(rpc);
  return { client: { auth: {}, from, rpc: rpcFn } as unknown as ProgressClient, rpc: rpcFn, from, query };
}

describe('desafios', () => {
  it('cria pela partida e pelo prazo, e devolve o desafio no formato da tela', async () => {
    const { client, rpc } = fakeClient();
    const challenge = await createChallenge(client, ACCOUNT, 'p1', 2);
    expect(rpc).toHaveBeenCalledWith('create_challenge', { p_play_id: 'p1', p_days: 2 });
    expect(challenge).toEqual({
      code: 'Ab3_k9-ZxQ2w',
      songId: 'ode-a-alegria',
      songTitle: 'Ode à Alegria',
      level: 'medium',
      targetScore: 4200,
      expiresAt: '2026-10-29T12:00:00Z',
      closed: false,
      challengerName: 'Gato 4821',
      role: 'creator',
      entries: [{ name: 'Raposa 1234', me: false, acceptedAt: '2026-10-27T13:00:00Z', bestScore: 4300, result: 'won' }],
    });
  });

  it('convidado lê pelo código, mas criar e aceitar pedem conta sem chamar o servidor', async () => {
    const { client, rpc } = fakeClient({ rpc: { data: { ...ROW, role: 'visitor', entries: null }, error: null } });
    expect((await getChallenge(client, GUEST, ROW.code)).entries).toBeNull();
    expect(rpc).toHaveBeenCalledWith('get_challenge', { p_code: ROW.code });
    await expect(createChallenge(client, GUEST, 'p1', 1)).rejects.toMatchObject({ kind: 'needs-account' });
    await expect(acceptChallenge(client, GUEST, ROW.code)).rejects.toMatchObject({ kind: 'needs-account' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('aceita pelo código', async () => {
    const { client, rpc } = fakeClient({ rpc: { data: { ...ROW, role: 'entrant' }, error: null } });
    expect((await acceptChallenge(client, ACCOUNT, ROW.code)).role).toBe('entrant');
    expect(rpc).toHaveBeenCalledWith('accept_challenge', { p_code: ROW.code });
  });

  it('meus desafios e as partidas que viram desafio (os recordes)', async () => {
    const { client, rpc, from, query } = fakeClient({
      rpc: { data: [ROW], error: null },
      select: { data: [{ song_id: 'ode-a-alegria', level: 'hard', score: 900, play_id: 'p9' }], error: null },
    });
    expect((await listMyChallenges(client, ACCOUNT)).map((c) => c.code)).toEqual([ROW.code]);
    expect(rpc).toHaveBeenCalledWith('list_my_challenges', undefined);
    expect(await listChallengeablePlays(client, ACCOUNT)).toEqual([{ playId: 'p9', songId: 'ode-a-alegria', level: 'hard', score: 900 }]);
    expect(from).toHaveBeenCalledWith('records');
    expect(query.order).toHaveBeenCalledWith('updated_at', { ascending: false });
  });

  it.each([
    ['28000', 'needs-account'],
    ['P0002', 'not-found'],
    ['22023', 'refused'],
    ['42501', 'offline'],
    [undefined, 'offline'],
    ['XX000', 'server'],
  ])('erro %s vira %s', async (code, kind) => {
    const { client } = fakeClient({ rpc: { data: null, error: { code, message: 'x' } } });
    await expect(getChallenge(client, ACCOUNT, 'x')).rejects.toMatchObject({ kind });
  });

  it('sem cliente ou sem sessão: offline', async () => {
    const { client, rpc } = fakeClient();
    await expect(getChallenge(null, ACCOUNT, 'x')).rejects.toMatchObject({ kind: 'offline' });
    await expect(listMyChallenges(client, { status: 'offline' })).rejects.toMatchObject({ kind: 'offline' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
