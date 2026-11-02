// Roda uma vez a retenção do áudio das entregas: chama a Edge Function purge-submission-audio com a chave de serviço
// (na nuvem quem chama é o pg_cron; o agendamento está no cabeçalho da função). Variáveis: SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY (no Supabase local, as do `npx supabase status -o json`); FUNCTION_URL opcional para a
// função rodando no Deno da máquina.
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const url = process.env.FUNCTION_URL || `${SUPABASE_URL}/functions/v1/purge-submission-audio`;
const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } });
const body = await res.json().catch(() => null);
console.log(res.status, JSON.stringify(body));
process.exit(res.ok ? 0 : 1);
