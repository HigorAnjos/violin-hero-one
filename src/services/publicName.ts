import { useQuery, useQueryClient } from '@tanstack/react-query';
import { progressKeys } from './progress';
import type { ProfileClient } from './profile';
import { ensureSession, type SessionState } from './session';
import { supabase } from './supabase';

const ANIMAL_NAME: Record<string, string> = { fox: 'Raposa', penguin: 'Pinguim', cat: 'Gato' };

/** O nome público do jogador: a mesma regra de violinhero.ranking_name (bicho + número), nunca o apelido digitado. */
export function rankingName(animal: string | null, tag: number): string {
  return `${(animal && ANIMAL_NAME[animal]) || 'Violinista'} ${tag}`;
}

/** O nome do ranking e dos desafios do próprio jogador (lê só o próprio perfil); sem sessão, null. */
export async function myPublicName(client: ProfileClient | null, session: SessionState): Promise<string | null> {
  if (!client || session.status !== 'signed-in') return null;
  const { data, error } = await client.from('profiles').select('animal, nickname_tag').eq('id', session.userId).maybeSingle();
  if (error || !data) return null;
  const row = data as { animal: string | null; nickname_tag: number };
  return rankingName(row.animal, row.nickname_tag);
}

/** Debaixo de progressKeys.all: troca de conta refaz o nome junto. */
export const publicNameKey = [...progressKeys.all, 'public-name'] as const;

export function useMyPublicName(client: ProfileClient | null = supabase): string | null {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: publicNameKey,
    queryFn: async () =>
      myPublicName(client, await queryClient.fetchQuery({ queryKey: ['session'], queryFn: () => ensureSession(client), staleTime: Infinity })),
    retry: false,
    networkMode: 'always',
  });
  return data ?? null;
}
