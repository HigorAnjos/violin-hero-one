import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { ODE } from '../game/engine/testing';
import { attacks, type Song } from '../game/notation/song';
import {
  backoff,
  createPlaySync,
  indexedDbPlayQueueStore,
  memoryPlayQueueStore,
  playFitsChart,
  PlaySyncError,
  RETRY_BASE_MS,
  type PlayQueueStore,
  type PlaySyncDeps,
} from './playQueue';
import { ProgressError, type PlayOutcome, type PlayPayload } from './progress';
import type { SessionState } from './session';
import { SongError } from './songs';

const NOTES = attacks(ODE).length;

function payload(clientId: string, change: Partial<PlayPayload> = {}): PlayPayload {
  return {
    client_id: clientId,
    song_id: 'ode-a-alegria',
    level: 'easy',
    mode: 'arcade',
    finished: true,
    no_fail: false,
    looped: false,
    speed: 1,
    score: NOTES * 100,
    accuracy: 100,
    counts: { perfect: NOTES, great: 0, good: 0, miss: 0 },
    max_combo: NOTES,
    mean_abs_cents: 2,
    string_cents: [1, 2, null, null],
    duration_ms: 20_000,
    played_at: '2026-10-26T12:00:00.000Z',
    ...change,
  };
}

const outcome = (id: string, duplicate = false): PlayOutcome => ({
  playId: `p-${id}`,
  accuracy: 100,
  record: { previous: null, improved: true },
  badges: ['primeira-musica'],
  streak: null,
  duplicate,
});

/** Servidor de mentira: guarda as partidas por client_id e devolve duplicate no reenvio. */
function setup({ store = memoryPlayQueueStore() as PlayQueueStore, user = 'u1' as string | null, chart = { hash: 'h1', song: ODE as Song } } = {}) {
  let net = true;
  let t = 1_000;
  let session: SessionState = { status: 'signed-in', userId: user ?? 'u1', anonymous: true };
  const server = new Set<string>();
  const submit = vi.fn(async (_s: SessionState, p: PlayPayload) => {
    if (!net) throw new ProgressError('offline');
    const duplicate = server.has(p.client_id);
    server.add(p.client_id);
    return outcome(p.client_id, duplicate);
  });
  const log = vi.fn();
  const deps: PlaySyncDeps = {
    store,
    user: () => user,
    session: async () => session,
    submit,
    chart: vi.fn(async () => chart),
    online: () => net,
    now: () => t,
    log,
  };
  const sync = createPlaySync(deps);
  return {
    sync,
    store,
    submit,
    log,
    deps,
    server,
    setOnline: (v: boolean) => (net = v),
    tick: (ms: number) => (t += ms),
    setSession: (s: SessionState) => (session = s),
    setUser: (u: string | null) => (user = u),
  };
}

describe('playFitsChart', () => {
  it('partida inteira: julga cada ataque uma vez; interrompida, no máximo todos', () => {
    expect(playFitsChart(payload('a'), ODE)).toBe(true);
    expect(playFitsChart(payload('a', { counts: { perfect: NOTES - 1, great: 0, good: 0, miss: 0 } }), ODE)).toBe(false);
    expect(playFitsChart(payload('a', { finished: false, counts: { perfect: 3, great: 0, good: 0, miss: 0 } }), ODE)).toBe(true);
    expect(playFitsChart(payload('a', { finished: false, counts: { perfect: NOTES + 1, great: 0, good: 0, miss: 0 } }), ODE)).toBe(false);
    expect(playFitsChart(payload('a', { mode: 'practice', counts: { perfect: NOTES * 3, great: 0, good: 0, miss: 0 } }), ODE)).toBe(true);
  });
});

describe('fila de partidas', () => {
  it('sem rede, as partidas esperam; com rede, sobe tudo e esvazia a fila', async () => {
    const t = setup();
    t.setOnline(false);
    await t.sync.enqueue({ payload: payload('a'), chartHash: 'h1', checkChart: false });
    await t.sync.enqueue({ payload: payload('b'), chartHash: 'h1', checkChart: false });
    await t.sync.flush();
    expect(t.submit).not.toHaveBeenCalled();
    expect(await t.sync.pending('u1')).toBe(2);
    t.setOnline(true);
    await t.sync.flush();
    expect([...t.server]).toEqual(['a', 'b']);
    expect(await t.sync.pending('u1')).toBe(0);
    expect(t.sync.outcome('a')).toEqual(outcome('a'));
    expect(t.sync.nextDelay()).toBeNull();
  });

  it('reenvio com o mesmo client_id: o servidor devolve duplicate e a partida sai da fila', async () => {
    const t = setup();
    t.server.add('a');
    await t.sync.enqueue({ payload: payload('a'), chartHash: 'h1', checkChart: false });
    await t.sync.flush();
    expect(t.submit).toHaveBeenCalledTimes(1);
    expect(t.submit.mock.calls[0][1].client_id).toBe('a');
    expect(t.sync.outcome('a')?.duplicate).toBe(true);
    expect(await t.sync.pending('u1')).toBe(0);
  });

  it('dois flush ao mesmo tempo não mandam a mesma partida duas vezes', async () => {
    const t = setup();
    await t.sync.enqueue({ payload: payload('a'), chartHash: 'h1', checkChart: false });
    await Promise.all([t.sync.flush(), t.sync.flush()]);
    expect(t.submit).toHaveBeenCalledTimes(1);
  });

  it('recusa definitiva (partida impossível, antiga demais) sai da fila com log, sem travar as outras', async () => {
    const t = setup();
    t.submit.mockRejectedValueOnce(new ProgressError('rejected', { message: 'partida inválida: antiga demais' }));
    await t.sync.enqueue({ payload: payload('a'), chartHash: 'h1', checkChart: false });
    t.tick(1);
    await t.sync.enqueue({ payload: payload('b'), chartHash: 'h1', checkChart: false });
    await t.sync.flush();
    expect(await t.sync.pending('u1')).toBe(0);
    expect([...t.server]).toEqual(['b']);
    expect(t.log).toHaveBeenCalledWith(expect.stringContaining('recusada'), expect.any(ProgressError));
  });

  it('erro passageiro do servidor: recuo que dobra a cada tentativa e respeita a espera', async () => {
    const t = setup();
    t.submit.mockRejectedValueOnce(new ProgressError('server')).mockRejectedValueOnce(new ProgressError('server'));
    await t.sync.enqueue({ payload: payload('a'), chartHash: 'h1', checkChart: false });
    await t.sync.flush();
    expect(t.sync.nextDelay()).toBe(RETRY_BASE_MS);
    await t.sync.flush();
    expect(t.submit).toHaveBeenCalledTimes(1);
    t.tick(RETRY_BASE_MS);
    await t.sync.flush();
    expect(t.submit).toHaveBeenCalledTimes(2);
    expect(t.sync.nextDelay()).toBe(2 * RETRY_BASE_MS);
    t.tick(2 * RETRY_BASE_MS);
    await t.sync.flush();
    expect(await t.sync.pending('u1')).toBe(0);
  });

  it('sem rede, o recuo da fila inteira cresce até o teto', async () => {
    const t = setup();
    t.setOnline(false);
    await t.sync.enqueue({ payload: payload('a'), chartHash: 'h1', checkChart: false });
    for (let i = 0; i < 3; i++) await t.sync.flush();
    expect(t.sync.nextDelay()).toBe(backoff(3));
    expect(backoff(3)).toBe(4 * RETRY_BASE_MS);
    expect(backoff(50)).toBe(5 * 60_000);
  });

  it('a fila de um usuário só sobe com a sessão dele', async () => {
    const t = setup();
    await t.sync.enqueue({ payload: payload('a'), chartHash: 'h1', checkChart: false });
    t.setSession({ status: 'signed-in', userId: 'outro', anonymous: false });
    await t.sync.flush();
    expect(t.submit).not.toHaveBeenCalled();
    await expect(t.sync.flush('u1', { strict: true })).rejects.toBeInstanceOf(PlaySyncError);
  });

  it('partidas de antes da primeira sessão passam para o primeiro usuário', async () => {
    const t = setup({ user: null });
    await t.sync.enqueue({ payload: payload('a'), chartHash: null, checkChart: false });
    expect(await t.sync.pending('')).toBe(1);
    t.setUser('u1');
    await t.sync.flush();
    expect([...t.server]).toEqual(['a']);
    expect(await t.sync.pending('')).toBe(0);
  });

  it('strict (troca de conta): ignora o recuo e lança com o que ficou', async () => {
    const t = setup();
    t.submit.mockRejectedValue(new ProgressError('server'));
    await t.sync.enqueue({ payload: payload('a'), chartHash: 'h1', checkChart: false });
    await t.sync.flush();
    await expect(t.sync.flush('u1', { strict: true })).rejects.toMatchObject({ left: 1 });
    expect(t.submit).toHaveBeenCalledTimes(2);
  });
});

describe('chart velho', () => {
  it('mesmo hash: manda', async () => {
    const t = setup();
    await t.sync.enqueue({ payload: payload('a'), chartHash: 'h1', checkChart: true });
    await t.sync.flush();
    expect(t.deps.chart).toHaveBeenCalledWith(expect.anything(), 'ode-a-alegria', 'easy');
    expect([...t.server]).toEqual(['a']);
  });

  it('o chart mudou mas a partida cabe nele (a embutida, sem hash): manda', async () => {
    const t = setup({ chart: { hash: 'h2', song: ODE } });
    await t.sync.enqueue({ payload: payload('a'), chartHash: null, checkChart: true });
    await t.sync.flush();
    expect([...t.server]).toEqual(['a']);
  });

  it('o chart mudou e o número de notas não bate: descarta com log, sem travar a fila', async () => {
    const shorter: Song = { ...ODE, measures: ODE.measures.slice(0, 1) };
    const t = setup({ chart: { hash: 'h2', song: shorter } });
    await t.sync.enqueue({ payload: payload('a'), chartHash: 'h1', checkChart: true });
    t.tick(1);
    await t.sync.enqueue({ payload: payload('b'), chartHash: 'h2', checkChart: false });
    await t.sync.flush();
    expect([...t.server]).toEqual(['b']);
    expect(await t.sync.pending('u1')).toBe(0);
    expect(t.log).toHaveBeenCalledWith(expect.stringContaining('o chart mudou'), null);
  });

  it('a música saiu do banco: descarta; sem rede para reler: espera', async () => {
    const t = setup();
    vi.mocked(t.deps.chart).mockRejectedValueOnce(new SongError('server')).mockRejectedValueOnce(new SongError('not-found'));
    await t.sync.enqueue({ payload: payload('a'), chartHash: 'h1', checkChart: true });
    await t.sync.flush();
    expect(await t.sync.pending('u1')).toBe(1);
    await t.sync.flush();
    expect(await t.sync.pending('u1')).toBe(0);
    expect(t.submit).not.toHaveBeenCalled();
  });
});

describe.each([
  ['memória', () => memoryPlayQueueStore()],
  ['IndexedDB', () => indexedDbPlayQueueStore(new IDBFactory())],
])('store da fila (%s)', (_name, makeStore: () => PlayQueueStore) => {
  it('separa por usuário e apaga só o do usuário', async () => {
    const t = setup({ store: makeStore() });
    await t.sync.enqueue({ payload: payload('a'), chartHash: 'h1', checkChart: false });
    t.setUser('u2');
    await t.sync.enqueue({ payload: payload('b'), chartHash: 'h1', checkChart: false });
    expect((await t.store.all('u1')).map((e) => e.clientId)).toEqual(['a']);
    expect((await t.store.all('u2')).map((e) => e.clientId)).toEqual(['b']);
    await t.store.clear('u2');
    expect(await t.sync.pending('u2')).toBe(0);
    expect(await t.sync.pending('u1')).toBe(1);
  });
});
