// Aplica as migrações pendentes de supabase/migrations/ em ordem, cada uma em transação,
// registrando em violinhero.schema_migrations (independente do CLI da Supabase). Depois, as de
// supabase/storage/ (bucket e policies do Storage), registradas como storage/<arquivo>, só quando o
// Storage existe: no Supabase local sem o container do Storage elas ficam para quando ele subir.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', quiet: true });
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const dir = join(root, 'migrations');
const storageDir = join(root, 'storage');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL vazio: copie .env.example para .env.local e preencha.');
  process.exit(1);
}

// O Postgres do `supabase start` (127.0.0.1:54322) não aceita SSL; o da nuvem exige
const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(process.env.DATABASE_URL);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('create schema if not exists violinhero');
  await client.query(`create table if not exists violinhero.schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await client.query('select name from violinhero.schema_migrations')).rows.map((r) => r.name));
  // No Supabase local o CLI aplica as migrações no start e registra a versão (prefixo do arquivo)
  const cli = await client.query(`select to_regclass('supabase_migrations.schema_migrations') is not null as exists`);
  const cliDone = cli.rows[0].exists
    ? new Set((await client.query('select version from supabase_migrations.schema_migrations')).rows.map((r) => r.version))
    : new Set();
  const sqlIn = (d) => readdirSync(d).filter((f) => f.endsWith('.sql')).sort();
  const files = sqlIn(dir);
  for (const f of files) if (cliDone.has(f.split('_')[0])) done.add(f);
  const pending = files.map((f) => ({ name: f, path: join(dir, f) }));
  const storage = await client.query(`select to_regclass('storage.objects') is not null as exists`);
  if (storage.rows[0].exists) pending.push(...sqlIn(storageDir).map((f) => ({ name: `storage/${f}`, path: join(storageDir, f) })));
  else console.log('Storage ausente neste banco: supabase/storage fica para quando ele existir.');
  let applied = 0;
  for (const { name: f, path } of pending) {
    if (done.has(f)) continue;
    process.stdout.write(`→ ${f} ... `);
    try {
      await client.query('begin');
      await client.query(readFileSync(path, 'utf8'));
      await client.query('insert into violinhero.schema_migrations (name) values ($1)', [f]);
      await client.query('commit');
      console.log('ok');
      applied++;
    } catch (e) {
      await client.query('rollback');
      console.log('FALHOU');
      throw e;
    }
  }
  console.log(applied ? `${applied} migração(ões) aplicada(s).` : 'Nada a aplicar.');
} finally {
  await client.end();
}
