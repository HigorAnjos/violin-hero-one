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
const ALLOWED_FUNCTIONS = ['authenticated violinhero.get_song(text,violinhero.chart_level)'];

/** Chart mínimo e válido do formato Song v1, com o id e o nível da linha. */
function chartOf(id, level = 'easy', extra = {}) {
  return {
    formatVersion: 1, id, title: 'Teste', composer: '', key: 'D major', bpm: 60,
    timeSignature: { beats: 4, unit: 4 }, level,
    measures: [{ beats: 4, notes: [{ beat: 0, beats: 4, midi: 62, string: 1, finger: 0 }] }],
    ...extra,
  };
}

/** Música gravada como o servidor (sem RLS): do catálogo quando owner é null, importada senão. */
async function serverSong(c, { owner = null, levels = ['easy'] } = {}) {
  const id = owner ? randomUUID() : `t-${randomUUID().slice(0, 8)}`;
  await c.query(
    `insert into ${S}.songs (id, title, bpm, time_beats, time_unit, duration_seconds, origin, owner_id, visibility)
     values ($1, 'Teste', 60, 4, 4, 4, $2, $3, $4)`,
    [id, owner ? 'imported' : 'catalog', owner, owner ? 'private' : 'public']);
  for (const level of levels) {
    await c.query(`insert into ${S}.song_charts (song_id, level, format_version, chart) values ($1, $2, 1, $3)`,
      [id, level, JSON.stringify(chartOf(id, level))]);
  }
  await c.query(`insert into ${S}.song_sources (song_id, format, file_name, content) values ($1, 'musicxml', 'a.musicxml', '<score-partwise/>')`, [id]);
  return id;
}

const getSong = (c, uid, id, level = 'easy') => as(c, uid, `select * from ${S}.get_song($1, $2)`, [id, level]);

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
const rlsDenied = (promise) => assert.rejects(promise, /row-level security/);

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

  describe('músicas', () => {
    it('jogador anônimo lê o catálogo e get_song devolve ficha, chart e hash', async () => {
      const u = await newUser(c);
      const id = await serverSong(c);
      const list = await as(c, u, `select id, origin, visibility from ${S}.songs where id = $1`, [id]);
      assert.deepEqual(list.rows, [{ id, origin: 'catalog', visibility: 'public' }]);
      const { rows } = await getSong(c, u, id);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].title, 'Teste');
      assert.equal(rows[0].level, 'easy');
      assert.equal(rows[0].format_version, 1);
      assert.deepEqual(rows[0].chart, chartOf(id));
      assert.match(rows[0].hash, /^[0-9a-f]{64}$/);
    });

    it('hash não depende da ordem das chaves e muda quando o chart muda', async () => {
      const id = await serverSong(c);
      const before = (await c.query(`select hash from ${S}.song_charts where song_id = $1`, [id])).rows[0].hash;
      const reordered = Object.fromEntries(Object.entries(chartOf(id)).reverse());
      await c.query(`update ${S}.song_charts set chart = $2 where song_id = $1`, [id, JSON.stringify(reordered)]);
      const same = (await c.query(`select hash from ${S}.song_charts where song_id = $1`, [id])).rows[0].hash;
      assert.equal(same, before);
      await c.query(`update ${S}.song_charts set chart = $2 where song_id = $1`, [id, JSON.stringify(chartOf(id, 'easy', { bpm: 72 }))]);
      const changed = (await c.query(`select hash from ${S}.song_charts where song_id = $1`, [id])).rows[0].hash;
      assert.notEqual(changed, before);
    });

    it('get_song de nível que a música não tem, ou de música que não existe, não devolve nada', async () => {
      const u = await newUser(c);
      const id = await serverSong(c);
      assert.deepEqual((await getSong(c, u, id, 'hard')).rows, []);
      assert.deepEqual((await getSong(c, u, 'nao-existe')).rows, []);
    });

    it('dono anônimo lê a sua importada pela tabela e por get_song', async () => {
      const dono = await newUser(c);
      const id = await serverSong(c, { owner: dono });
      assert.equal((await as(c, dono, `select id from ${S}.songs where id = $1`, [id])).rows.length, 1);
      assert.equal((await as(c, dono, `select level from ${S}.song_charts where song_id = $1`, [id])).rows.length, 1);
      assert.equal((await as(c, dono, `select format from ${S}.song_sources where song_id = $1`, [id])).rows.length, 1);
      assert.equal((await getSong(c, dono, id)).rows.length, 1);
    });

    it('dono anônimo importa: cria a ficha (privada, dele) e o original', async () => {
      const dono = await newUser(c);
      const { rows } = await as(c, dono,
        `insert into ${S}.songs (title, bpm, time_beats, time_unit, duration_seconds, origin)
         values ('Minha', 90, 3, 4, 12, 'imported') returning id, owner_id, visibility`);
      assert.deepEqual(rows.map((r) => [r.owner_id, r.visibility]), [[dono, 'private']]);
      await as(c, dono, `insert into ${S}.song_sources (song_id, format, file_name, content) values ($1, 'musicxml', 'm.musicxml', '<x/>')`, [rows[0].id]);
      const upd = await as(c, dono, `update ${S}.songs set title = 'Minha 2' where id = $1`, [rows[0].id]);
      assert.equal(upd.rowCount, 1);
    });

    for (const anonymous of [true, false]) {
      const who = anonymous ? 'anônimo' : 'com conta';
      it(`outro jogador (${who}) NÃO lê a importada alheia: nem ficha, nem chart, nem original, nem get_song`, async () => {
        const dono = await newUser(c);
        const outro = await newUser(c, { anonymous });
        const id = await serverSong(c, { owner: dono });
        assert.deepEqual((await as(c, outro, `select id from ${S}.songs where id = $1`, [id])).rows, []);
        assert.deepEqual((await as(c, outro, `select level from ${S}.song_charts where song_id = $1`, [id])).rows, []);
        assert.deepEqual((await as(c, outro, `select format from ${S}.song_sources where song_id = $1`, [id])).rows, []);
        assert.deepEqual((await getSong(c, outro, id)).rows, []);
      });

      it(`outro jogador (${who}) NÃO escreve na importada alheia`, async () => {
        const dono = await newUser(c);
        const outro = await newUser(c, { anonymous });
        const id = await serverSong(c, { owner: dono });
        assert.equal((await as(c, outro, `update ${S}.songs set title = 'invasor' where id = $1`, [id])).rowCount, 0);
        assert.equal((await as(c, outro, `delete from ${S}.songs where id = $1`, [id])).rowCount, 0);
        assert.equal((await as(c, outro, `update ${S}.song_sources set content = '<invasor/>' where song_id = $1`, [id])).rowCount, 0);
        assert.equal((await as(c, outro, `delete from ${S}.song_sources where song_id = $1`, [id])).rowCount, 0);
        const { rows } = await c.query(`select s.title, o.content from ${S}.songs s join ${S}.song_sources o on o.song_id = s.id where s.id = $1`, [id]);
        assert.deepEqual(rows, [{ title: 'Teste', content: '<score-partwise/>' }]);
      });
    }

    it('jogador NÃO cria música em nome de outro nem já pública, nem põe original na música alheia', async () => {
      const a = await newUser(c);
      const b = await newUser(c);
      const values = `'X', 60, 4, 4, 4, 'imported'`;
      await denied(as(c, a, `insert into ${S}.songs (title, bpm, time_beats, time_unit, duration_seconds, origin, owner_id) values (${values}, $1)`, [b]));
      await denied(as(c, a, `insert into ${S}.songs (title, bpm, time_beats, time_unit, duration_seconds, origin, visibility) values (${values}, 'public')`));
      const id = await serverSong(c, { owner: b, levels: [] });
      await c.query(`delete from ${S}.song_sources where song_id = $1`, [id]);
      await rlsDenied(as(c, a, `insert into ${S}.song_sources (song_id, format, file_name, content) values ($1, 'musicxml', 'a', '<x/>')`, [id]));
    });

    it('dono NÃO torna a importada pública nem a passa para outro', async () => {
      const dono = await newUser(c);
      const id = await serverSong(c, { owner: dono });
      await denied(as(c, dono, `update ${S}.songs set visibility = 'public' where id = $1`, [id]));
      await denied(as(c, dono, `update ${S}.songs set owner_id = $2 where id = $1`, [id, await newUser(c)]));
      await denied(as(c, dono, `update ${S}.songs set origin = 'catalog' where id = $1`, [id]));
    });

    it('ninguém do app escreve no catálogo nem lê o original dele', async () => {
      const u = await newUser(c, { anonymous: false });
      const id = await serverSong(c);
      await rlsDenied(as(c, u, `insert into ${S}.songs (title, bpm, time_beats, time_unit, duration_seconds, origin) values ('X', 60, 4, 4, 4, 'catalog')`));
      assert.equal((await as(c, u, `update ${S}.songs set title = 'invasor' where id = $1`, [id])).rowCount, 0);
      assert.equal((await as(c, u, `delete from ${S}.songs where id = $1`, [id])).rowCount, 0);
      assert.deepEqual((await as(c, u, `select song_id from ${S}.song_sources where song_id = $1`, [id])).rows, []);
      assert.equal((await as(c, u, `update ${S}.song_sources set content = '<x/>' where song_id = $1`, [id])).rowCount, 0);
      assert.equal((await c.query(`select title from ${S}.songs where id = $1`, [id])).rows[0].title, 'Teste');
    });

    it('ninguém do app escreve em song_charts, nem na própria importada', async () => {
      const dono = await newUser(c);
      const id = await serverSong(c, { owner: dono });
      const chart = JSON.stringify(chartOf(id, 'hard'));
      await denied(as(c, dono, `insert into ${S}.song_charts (song_id, level, format_version, chart) values ($1, 'hard', 1, $2)`, [id, chart]));
      await denied(as(c, dono, `update ${S}.song_charts set chart = $2 where song_id = $1`, [id, chart]));
      await denied(as(c, dono, `delete from ${S}.song_charts where song_id = $1`, [id]));
    });

    it('duas músicas do catálogo NÃO empatam na estante (checado no fim da transação)', async () => {
      const a = await serverSong(c);
      const b = await serverSong(c);
      await c.query(`update ${S}.songs set catalog_position = 900 where id = any($1)`, [[a, b]]);
      await assert.rejects(c.query('set constraints all immediate'), /songs_catalog_position_key/);
    });

    it('seed reordena a estante e tira dela a música que saiu dos arquivos', async () => {
      const { loadCatalog, seedCatalog } = await import('./seed-songs.mjs');
      const entries = await loadCatalog();
      // Checa a unicidade como no commit e volta ao modo adiado do seed
      const commitCheck = () => c.query('set constraints all immediate; set constraints all deferred');
      await seedCatalog(c, [...entries].reverse());
      await commitCheck();
      const [fora, ...ficam] = entries;
      await seedCatalog(c, ficam);
      await commitCheck();
      const { rows } = await c.query(
        `select id, catalog_position from ${S}.songs where origin = 'catalog' and id = any($1) order by catalog_position nulls first`,
        [entries.map((e) => e.sheet.id)]);
      assert.deepEqual(rows.map((r) => [r.id, r.catalog_position]), [[fora.sheet.id, null], ...ficam.map((e, i) => [e.sheet.id, i])]);
    });

    it('sem login (anon) NÃO lê, NÃO escreve e NÃO chama get_song', async () => {
      const id = await serverSong(c);
      for (const table of ['songs', 'song_charts', 'song_sources']) await denied(as(c, null, `select * from ${S}.${table}`));
      await denied(as(c, null, `insert into ${S}.songs (title, bpm, time_beats, time_unit, duration_seconds, origin) values ('X', 60, 4, 4, 4, 'imported')`));
      await denied(as(c, null, `delete from ${S}.song_charts where song_id = $1`, [id]));
      await denied(getSong(c, null, id));
    });

    it('chart que não bate com a linha (id, nível ou versão) é recusado', async () => {
      const id = await serverSong(c, { levels: [] });
      const insert = (level, chart, version = 1) =>
        c.query(`insert into ${S}.song_charts (song_id, level, format_version, chart) values ($1, $2, $3, $4)`, [id, level, version, JSON.stringify(chart)]);
      await assert.rejects(c.query('savepoint x').then(() => insert('medium', chartOf(id, 'easy'))), /song_charts_matches_row/);
      await c.query('rollback to savepoint x');
      await assert.rejects(insert('easy', chartOf('outra')), /song_charts_matches_row/);
      await c.query('rollback to savepoint x');
      await assert.rejects(insert('easy', chartOf(id), 2), /song_charts_matches_row/);
    });

    it('seed do catálogo é idempotente: a segunda rodada não muda nada e as músicas abrem por get_song', async () => {
      const { loadCatalog, seedCatalog } = await import('./seed-songs.mjs');
      const entries = await loadCatalog();
      assert.ok(entries.length >= 3);
      await seedCatalog(c, entries);
      assert.deepEqual(await seedCatalog(c, entries), { songs: 0, song_sources: 0, song_charts: 0 });
      const u = await newUser(c);
      for (const { sheet, charts } of entries) {
        for (const level of Object.keys(charts)) {
          const { rows } = await getSong(c, u, sheet.id, level);
          assert.equal(rows.length, 1, `${sheet.id} ${level}`);
          assert.deepEqual(rows[0].chart, JSON.parse(JSON.stringify(charts[level])));
        }
      }
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
