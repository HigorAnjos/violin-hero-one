// Edge Function purge-submission-audio: retenção do áudio das entregas (decisão do Higor, ciclo 5). Apaga do bucket
// submissions, pela API do Storage, o áudio revisado há mais de 30 dias, o de entrega nunca revisada 30 dias depois do
// prazo da tarefa, o trocado por outro e o arquivo que nenhuma entrega cita há 48 h (violinhero.audio_to_purge), e só
// então tira os caminhos do banco (violinhero.audio_purged). Apagar a linha de
// storage.objects direto deixaria o arquivo para trás. Idempotente: rodar de novo sem nada vencido não faz nada.
//
// Só a chave de serviço chama (Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>); deploy com --no-verify-jwt --use-api.
//
// Agendamento na nuvem, uma vez, no SQL editor (pg_cron + pg_net, com a chave guardada no Vault):
//   select vault.create_secret('<chave de serviço>', 'violinhero_service_key');
//   select cron.schedule('violinhero-purge-audio', '17 6 * * *', $$
//     select net.http_post(
//       url := 'https://<project-ref>.supabase.co/functions/v1/purge-submission-audio',
//       headers := jsonb_build_object('Authorization', 'Bearer ' ||
//         (select decrypted_secret from vault.decrypted_secrets where name = 'violinhero_service_key')))
//   $$);
// Local: npm run purge:audio (scripts/purge-audio.mjs chama esta função com a chave do `supabase status`).
//
// Resposta: 200 { purged } (quantos arquivos saíram); 401 sem a chave; 500 { error } se o Storage ou o banco falharem
// (o que não saiu do Storage continua na lista para a próxima rodada).
import { createClient } from '@supabase/supabase-js';

const BATCH = 100;
const MAX_BATCHES = 20;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} vazio no ambiente da função`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  try {
    const key = env('SUPABASE_SERVICE_ROLE_KEY');
    if (req.headers.get('Authorization') !== `Bearer ${key}`) return json(401, { error: 'Só o agendamento chama.' });
    const server = createClient(env('SUPABASE_URL'), key, {
      db: { schema: 'violinhero' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let purged = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
      const { data, error } = await server.rpc('audio_to_purge', { p_limit: BATCH });
      if (error) throw error;
      const paths = ((data ?? []) as { path: string }[]).map((r) => r.path);
      if (!paths.length) break;
      const removed = await server.storage.from('submissions').remove(paths);
      if (removed.error) throw removed.error;
      const done = await server.rpc('audio_purged', { p_paths: paths });
      if (done.error) throw done.error;
      // Conta o que saiu do Storage (o órfão não está em entrega nem na fila do banco)
      purged += paths.length;
      if (paths.length < BATCH) break;
    }
    return json(200, { purged });
  } catch (error) {
    console.error('purge-submission-audio', error);
    return json(500, { error: 'Falha ao apagar o áudio vencido.' });
  }
});
