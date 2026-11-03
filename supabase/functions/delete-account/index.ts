// Edge Function delete-account: "Apagar minha conta" de Configurações › Conta (exigência do Google Play e da App Store).
// O app não tem a chave de serviço, e só ela apaga um usuário do auth: por isso a exclusão passa por aqui.
//   1. violinhero.delete_my_account() COMO o jogador (a sessão dele): apaga os dados do schema e devolve o áudio de
//      entregas a tirar do Storage e, se ele dava turma, os usuários dos alunos dela (migração 0022);
//   2. o áudio sai do bucket submissions (se falhar, ele já está na audio_trash e a limpeza diária apaga);
//   3. os alunos e, por último, o próprio jogador saem do auth (o que restar no schema vai em cascata).
// Conta de aluno de turma é recusada no passo 1 (403): quem remove é o professor.
//
// POST sem corpo, com Authorization: Bearer <token da sessão do jogador>.
// Resposta: 200 { deleted: true }; 401 sem sessão; 403 { error: { code: "student" } }; 500 { error } (rodar de novo
// termina: o passo 1 é idempotente e o usuário do auth só sai no fim).
import { createClient } from '@supabase/supabase-js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const options = { auth: { persistSession: false, autoRefreshToken: false } };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} vazio no ambiente da função`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: { code: 'method', message: 'Use POST.' } });
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { error: { code: 'unauthorized', message: 'Sem sessão.' } });
  try {
    const url = env('SUPABASE_URL');
    const asPlayer = createClient(url, env('SUPABASE_ANON_KEY'), {
      ...options,
      global: { headers: { Authorization: authorization } },
      db: { schema: 'violinhero' },
    });
    const { data: who, error: authError } = await asPlayer.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (authError || !who.user) return json(401, { error: { code: 'unauthorized', message: 'Sessão inválida.' } });

    const { data, error } = await asPlayer.rpc('delete_my_account');
    if (error?.code === 'PT403') return json(403, { error: { code: 'student', message: 'Conta de aluno: quem remove é o professor.' } });
    if (error) throw error;
    const { audio, students } = data as { audio: string[]; students: string[] };

    const server = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { ...options, db: { schema: 'violinhero' } });
    if (audio.length) {
      const removed = await server.storage.from('submissions').remove(audio);
      if (removed.error) console.error('delete-account: áudio fica para a limpeza diária', removed.error);
      else await server.rpc('audio_purged', { p_paths: audio });
    }
    for (const id of [...students, who.user.id]) {
      const { error: deleteError } = await server.auth.admin.deleteUser(id);
      // Já apagado numa tentativa anterior: segue
      if (deleteError && deleteError.status !== 404) throw deleteError;
    }
    return json(200, { deleted: true });
  } catch (error) {
    console.error('delete-account', error);
    return json(500, { error: { code: 'server', message: 'Não foi possível apagar a conta agora.' } });
  }
});
