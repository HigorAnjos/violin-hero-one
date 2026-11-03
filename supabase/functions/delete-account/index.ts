// Edge Function delete-account: exclusão de conta (exigência do Google Play e da App Store). O app não tem a chave de
// serviço, e só ela apaga um usuário do auth: por isso a exclusão passa por aqui. Dois pedidos:
//   - sem corpo: "Apagar minha conta" de Configurações › Conta (violinhero.delete_my_account);
//   - { student_id }: o professor apaga um aluno da turma dele (violinhero.remove_student).
// Passos:
//   1. a função do banco roda COMO quem pede (a sessão dele): apaga os dados do schema, põe os usuários de auth dos
//      alunos na fila violinhero.auth_deletions e devolve o áudio de entregas e a fila (migração 0022);
//   2. o áudio sai do bucket submissions (se falhar, ele já está na audio_trash e a limpeza diária apaga);
//   3. cada aluno da fila sai do auth e da fila; se um falhar, a resposta é 500 e nada mais sai (o próprio jogador
//      continua com sessão para rodar de novo, e a fila devolve o aluno que ficou);
//   4. só então, em "Apagar minha conta", o próprio jogador sai do auth (o que restar no schema vai em cascata).
// Conta de aluno de turma é recusada no passo 1 (403 student): quem apaga é o professor.
//
// POST com Authorization: Bearer <token da sessão>.
// Resposta: 200 { deleted: true }; 401 sem sessão; 403 { error: { code: "student" } }; 404 { error: { code:
// "not_found" } } (aluno de outro professor ou inexistente); 403 { error: { code: "not_teacher" } }; 500 { error }.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O corpo é opcional: vazio (apagar a própria conta) ou { student_id }. */
async function studentOf(req: Request): Promise<string | null | undefined> {
  const text = await req.text();
  if (!text.trim()) return null;
  try {
    const body = JSON.parse(text) as { student_id?: unknown };
    if (body.student_id === undefined) return null;
    return typeof body.student_id === 'string' && UUID.test(body.student_id) ? body.student_id : undefined;
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: { code: 'method', message: 'Use POST.' } });
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { error: { code: 'unauthorized', message: 'Sem sessão.' } });
  try {
    const studentId = await studentOf(req);
    if (studentId === undefined) return json(400, { error: { code: 'bad_request', message: 'student_id inválido.' } });
    const url = env('SUPABASE_URL');
    const asPlayer = createClient(url, env('SUPABASE_ANON_KEY'), {
      ...options,
      global: { headers: { Authorization: authorization } },
      db: { schema: 'violinhero' },
    });
    const { data: who, error: authError } = await asPlayer.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (authError || !who.user) return json(401, { error: { code: 'unauthorized', message: 'Sessão inválida.' } });

    const { data, error } = studentId
      ? await asPlayer.rpc('remove_student', { p_member_id: studentId })
      : await asPlayer.rpc('delete_my_account');
    if (error?.code === 'PT403') return json(403, { error: { code: 'student', message: 'Conta de aluno: quem apaga é o professor.' } });
    if (error?.code === 'PT404') return json(404, { error: { code: 'not_found', message: 'Aluno não encontrado.' } });
    if (error?.code === '28000') return json(403, { error: { code: 'not_teacher', message: 'Só o professor da turma apaga o aluno.' } });
    if (error) throw error;
    const { audio, students } = data as { audio: string[]; students: string[] };

    const server = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { ...options, db: { schema: 'violinhero' } });
    if (audio.length) {
      const removed = await server.storage.from('submissions').remove(audio);
      if (removed.error) console.error('delete-account: áudio fica para a limpeza diária', removed.error);
      else await server.rpc('audio_purged', { p_paths: audio });
    }
    for (const id of students) {
      const { error: deleteError } = await server.auth.admin.deleteUser(id);
      // Já apagado numa tentativa anterior: segue
      if (deleteError && deleteError.status !== 404) throw deleteError;
      const done = await server.from('auth_deletions').delete().eq('user_id', id);
      if (done.error) throw done.error;
    }
    if (!studentId) {
      const { error: deleteError } = await server.auth.admin.deleteUser(who.user.id);
      if (deleteError && deleteError.status !== 404) throw deleteError;
    }
    return json(200, { deleted: true });
  } catch (error) {
    console.error('delete-account', error);
    return json(500, { error: { code: 'server', message: 'Não foi possível apagar agora. Tente de novo.' } });
  }
});
