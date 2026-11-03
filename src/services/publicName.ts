import { useQuery, useQueryClient } from '@tanstack/react-query';
import { progressKeys } from './progress';
import { ANIMALS, type Animal, type ProfileClient } from './profile';
import { ensureSession, type SessionState } from './session';
import { supabase } from './supabase';

const ANIMAL_NAME: Record<Animal, string> = { fox: 'Raposa', penguin: 'Pinguim', cat: 'Gato' };

/**
 * O nome público do jogador: a mesma regra de violinhero.ranking_name (bicho + número de 5 dígitos), nunca o apelido
 * digitado. Todo perfil tem bicho: o servidor sorteia um para quem não escolheu (0021).
 */
export function rankingName(animal: Animal, tag: number): string {
  return `${ANIMAL_NAME[animal]} ${tag}`;
}

/** O nome do ranking e dos desafios do próprio jogador (lê só o próprio perfil); sem sessão, null. */
export async function myPublicName(client: ProfileClient | null, session: SessionState): Promise<string | null> {
  if (!client || session.status !== 'signed-in') return null;
  const { data, error } = await client.from('profiles').select('animal, nickname_tag').eq('id', session.userId).maybeSingle();
  if (error || !data) return null;
  const row = data as { animal: string | null; nickname_tag: number };
  // Perfil sem bicho só num banco sem a 0021: sem nome, em vez de um que o ranking não mostra
  if (!ANIMALS.includes(row.animal as Animal)) return null;
  return rankingName(row.animal as Animal, row.nickname_tag);
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
