// Testes de banco: o que cada perfil consegue e, principalmente, o que NÃO consegue ver.
// Cada cenário roda dentro de uma transação revertida (ROLLBACK): não deixa resíduo.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', quiet: true });
// Na máquina, sem banco, os testes se pulam; na CI isso seria um verde falso
if (process.env.CI && !process.env.DATABASE_URL) throw new Error('DATABASE_URL vazio na CI: os testes de banco não rodariam.');
const S = 'violinhero';
const ZERO = '00000000-0000-0000-0000-000000000000';

/**
 * Funções de violinhero que o app chama, por papel ("papel assinatura", como em regprocedure).
 * Função nova só entra aqui junto com o GRANT dela na migração; o resto fica só para o servidor.
 */
const ALLOWED_FUNCTIONS = [];

// ---------- helpers ----------
async function newUser(c, { anonymous = true } = {}) {
  const id = randomUUID();
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, is_anonymous) values ($1, $2, 'authenticated', 'authenticated', $3, $4)`,
    [id, ZERO, anonymous ? null : `p-${id}@t.test`, anonymous]);
  return id;
}

/** Roda `sql` como o papel do PostgREST: authenticated com o usuário no JWT, ou anon sem JWT. */
async function as(c, uid, sql, params = []) {
  await c.query('savepoint sp');
  try {
    if (uid) {
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
      await c.query('set local role authenticated');
    } else {
      await c.query('set local role anon');
    }
    const res = await c.query(sql, params);
    await c.query('release savepoint sp');
    return res;
  } catch (e) {
    await c.query('rollback to savepoint sp');
    throw e;
  } finally {
    await c.query('reset role');
  }
}

const denied = (promise) => assert.rejects(promise, /permission denied/);

describe('violinhero (transação revertida)', { skip: !process.env.DATABASE_URL && 'DATABASE_URL vazio' }, () => {
  let c;
  before(async () => {
    // O Postgres do `supabase start` (127.0.0.1:54322) não aceita SSL; o da nuvem exige
    const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(process.env.DATABASE_URL);
    c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false } });
    await c.connect();
  });
  after(async () => { await c?.end(); });
  beforeEach(async () => { await c.query('begin'); });
  afterEach(async () => { await c.query('rollback'); });

  describe('profiles', () => {
    it('login anônimo cria o perfil sozinho, com Lá 442', async () => {
      const u = await newUser(c);
      const { rows } = await as(c, u, `select id, is_anonymous, a4_hz from ${S}.profiles`);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, u);
      assert.equal(rows[0].is_anonymous, true);
      assert.equal(Number(rows[0].a4_hz), 442);
    });

    it('criar conta depois mantém o mesmo perfil e só desliga o anônimo', async () => {
      const u = await newUser(c);
      await as(c, u, `update ${S}.profiles set nickname = 'Ana' where id = $1`, [u]);
      await c.query(`update auth.users set is_anonymous = false, email = $2 where id = $1`, [u, `ana-${u}@t.test`]);
      const { rows } = await as(c, u, `select nickname, is_anonymous from ${S}.profiles`);
      assert.deepEqual(rows, [{ nickname: 'Ana', is_anonymous: false }]);
    });

    it('jogador NÃO vê o perfil de outro', async () => {
      const a = await newUser(c);
      const b = await newUser(c, { anonymous: false });
      const { rows } = await as(c, a, `select id from ${S}.profiles where id = $1`, [b]);
      assert.deepEqual(rows, []);
    });

    it('jogador NÃO altera o perfil de outro (update não acha a linha)', async () => {
      const a = await newUser(c);
      const b = await newUser(c);
      const res = await as(c, a, `update ${S}.profiles set nickname = 'invasor' where id = $1`, [b]);
      assert.equal(res.rowCount, 0);
      const { rows } = await c.query(`select nickname from ${S}.profiles where id = $1`, [b]);
      assert.equal(rows[0].nickname, null);
    });

    it('jogador NÃO se marca como não anônimo nem troca o próprio id', async () => {
      const a = await newUser(c);
      await denied(as(c, a, `update ${S}.profiles set is_anonymous = false where id = $1`, [a]));
      await denied(as(c, a, `update ${S}.profiles set id = $2 where id = $1`, [a, randomUUID()]));
    });

    it('jogador NÃO insere nem apaga perfil', async () => {
      const a = await newUser(c);
      await denied(as(c, a, `insert into ${S}.profiles (id) values ($1)`, [randomUUID()]));
      await denied(as(c, a, `delete from ${S}.profiles where id = $1`, [a]));
    });

    it('sem login (anon) NÃO enxerga o schema', async () => {
      await newUser(c);
      await denied(as(c, null, `select * from ${S}.profiles`));
    });

    it('apelido com espaço nas pontas é recusado', async () => {
      const a = await newUser(c);
      await assert.rejects(as(c, a, `update ${S}.profiles set nickname = ' Ana ' where id = $1`, [a]), /check constraint/);
    });

    it('função nova no schema nasce executável pelo servidor (service_role)', async () => {
      await c.query(`create function ${S}.tmp_probe() returns int language sql security definer as 'select 1'`);
      await c.query('set local role service_role');
      const { rows } = await c.query(`select ${S}.tmp_probe() as v`);
      await c.query('reset role');
      assert.equal(rows[0].v, 1);
    });

    it('Lá fora de 415–466 Hz é recusado', async () => {
      const a = await newUser(c);
      await assert.rejects(as(c, a, `update ${S}.profiles set a4_hz = 500 where id = $1`, [a]), /check constraint/);
      await as(c, a, `update ${S}.profiles set a4_hz = 440 where id = $1`, [a]);
    });
  });

  describe('funções', () => {
    it('só as funções da lista permitida são executáveis por anon e authenticated', async () => {
      const { rows } = await c.query(
        `select r.rolname as role, p.oid::regprocedure::text as fn
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          cross join (values ('anon'), ('authenticated')) r(rolname)
          where n.nspname = $1 and p.prokind in ('f', 'p')
            and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
          order by 1, 2`,
        [S]);
      const exposed = rows.map((r) => `${r.role} ${r.fn}`);
      assert.deepEqual(exposed, [...ALLOWED_FUNCTIONS].sort());
    });
  });
});
