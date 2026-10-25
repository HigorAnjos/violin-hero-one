// Sobe o Supabase local (o CLI aplica supabase/migrations no start) e roda os testes de banco
// contra ele. Uso: npm run db:local [-- --stop] — com --stop, derruba os containers no fim.
import { execFileSync, spawnSync } from 'node:child_process';

const supabase = (args, opts = {}) => execFileSync('npx', ['supabase', ...args], { encoding: 'utf8', ...opts });

supabase(['start'], { stdio: 'inherit' });
const { DB_URL } = JSON.parse(supabase(['status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'inherit'] }));
const env = { ...process.env, DATABASE_URL: DB_URL };

let code = 0;
for (const script of ['migrate', 'test:db']) {
  code = spawnSync('npm', ['run', script], { stdio: 'inherit', env }).status ?? 1;
  if (code !== 0) break;
}

if (process.argv.includes('--stop')) supabase(['stop'], { stdio: 'inherit' });
process.exit(code);
