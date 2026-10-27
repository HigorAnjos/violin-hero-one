// Sobe o Supabase local (o CLI aplica supabase/migrations no start e serve as Edge Functions), grava o catálogo e
// roda os testes de banco e da função import-song contra ele. Uso: npm run db:local [-- --stop] — com --stop,
// derruba os containers no fim.
import { execFileSync, spawnSync } from 'node:child_process';

const supabase = (args, opts = {}) => execFileSync('npx', ['supabase', ...args], { encoding: 'utf8', ...opts });

supabase(['start'], { stdio: 'inherit' });
const { DB_URL, API_URL, ANON_KEY, SERVICE_ROLE_KEY } = JSON.parse(supabase(['status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'inherit'] }));
// Sem isso os testes se auto-pulam e o resultado sai verde sem testar nada
if (!DB_URL || !API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('supabase status não trouxe DB_URL, API_URL e as chaves: confira a saída de `npx supabase status -o json`.');
  process.exit(1);
}
// A chave de serviço fica no processo de teste (limpeza dos usuários criados); o app nunca a vê
const env = { ...process.env, DATABASE_URL: DB_URL, SUPABASE_URL: API_URL, SUPABASE_ANON_KEY: ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY };

let code = 0;
for (const script of ['migrate', 'seed:songs', 'test:db', 'test:functions']) {
  code = spawnSync('npm', ['run', script], { stdio: 'inherit', env }).status ?? 1;
  if (code !== 0) break;
}

if (process.argv.includes('--stop')) supabase(['stop'], { stdio: 'inherit' });
process.exit(code);
