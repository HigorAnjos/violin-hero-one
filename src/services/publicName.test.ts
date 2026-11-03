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
  it('bicho + número de 5 dígitos, como violinhero.ranking_name', () => {
    expect(rankingName('fox', 12345)).toBe('Raposa 12345');
    expect(rankingName('penguin', 99999)).toBe('Pinguim 99999');
    expect(rankingName('cat', 10000)).toBe('Gato 10000');
  });

  it('lê só o bicho e o número do próprio perfil, nunca o apelido', async () => {
    const { client, query } = fakeClient({ data: { animal: 'cat', nickname_tag: 48213 }, error: null });
    expect(await myPublicName(client, { status: 'signed-in', userId: 'u1', anonymous: false })).toBe('Gato 48213');
    expect(query.select).toHaveBeenCalledWith('animal, nickname_tag');
    expect(query.eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('sem sessão, sem perfil, com erro ou perfil sem bicho (banco sem a 0021): sem nome, nunca "Violinista"', async () => {
    const signedIn = { status: 'signed-in', userId: 'u1', anonymous: true } as const;
    expect(await myPublicName(null, { status: 'offline' })).toBeNull();
    expect(await myPublicName(fakeClient({ data: null, error: null }).client, signedIn)).toBeNull();
    expect(await myPublicName(fakeClient({ data: null, error: { code: 'x' } }).client, signedIn)).toBeNull();
    expect(await myPublicName(fakeClient({ data: { animal: null, nickname_tag: 4821 }, error: null }).client, signedIn)).toBeNull();
    expect(await myPublicName(fakeClient({ data: { animal: 'dragon', nickname_tag: 48213 }, error: null }).client, signedIn)).toBeNull();
  });
});
