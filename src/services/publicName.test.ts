import { describe, expect, it, vi } from 'vitest';
import type { ProfileClient } from './profile';
import { myPublicName, rankingName } from './publicName';

function fakeClient(result: { data: unknown; error: unknown }) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result) };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return { client: { auth: {}, from: vi.fn().mockReturnValue(query) } as unknown as ProfileClient, query };
}

describe('nome público', () => {
  it('bicho + número, como violinhero.ranking_name; sem bicho, Violinista', () => {
    expect(rankingName('fox', 1234)).toBe('Raposa 1234');
    expect(rankingName('penguin', 9999)).toBe('Pinguim 9999');
    expect(rankingName('cat', 1000)).toBe('Gato 1000');
    expect(rankingName(null, 4321)).toBe('Violinista 4321');
  });

  it('lê só o bicho e o número do próprio perfil, nunca o apelido', async () => {
    const { client, query } = fakeClient({ data: { animal: 'cat', nickname_tag: 4821 }, error: null });
    expect(await myPublicName(client, { status: 'signed-in', userId: 'u1', anonymous: false })).toBe('Gato 4821');
    expect(query.select).toHaveBeenCalledWith('animal, nickname_tag');
    expect(query.eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('sem sessão, sem perfil ou com erro: sem nome', async () => {
    expect(await myPublicName(null, { status: 'offline' })).toBeNull();
    expect(await myPublicName(fakeClient({ data: null, error: null }).client, { status: 'signed-in', userId: 'u1', anonymous: true })).toBeNull();
    expect(await myPublicName(fakeClient({ data: null, error: { code: 'x' } }).client, { status: 'signed-in', userId: 'u1', anonymous: true })).toBeNull();
  });
});
