// Testes de banco: o que cada perfil consegue e, principalmente, o que NÃO consegue ver.
// Cada cenário roda dentro de uma transação revertida (ROLLBACK): não deixa resíduo.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import dotenv from 'dotenv';
import pg from 'pg';

/** Os casos dos selos que badges.test.ts também roda (badgesFor): uma regra só dos dois lados. */
const BADGE_CASES = JSON.parse(readFileSync(new URL('../src/game/engine/badgeCases.json', import.meta.url), 'utf8')).cases;

dotenv.config({ path: '.env.local', quiet: true });
// Na máquina, sem banco, os testes se pulam; na CI isso seria um verde falso
if (process.env.CI && !process.env.DATABASE_URL) throw new Error('DATABASE_URL vazio na CI: os testes de banco não rodariam.');
const S = 'violinhero';
const ZERO = '00000000-0000-0000-0000-000000000000';

/**
 * Funções de violinhero que o app chama, por papel ("papel assinatura", como em regprocedure).
 * Função nova só entra aqui junto com o GRANT dela na migração; o resto fica só para o servidor.
 */
const ALLOWED_FUNCTIONS = [
  'authenticated violinhero.accept_challenge(text)',
  'authenticated violinhero.accept_guardian_invite(text)',
  'authenticated violinhero.add_student(uuid,text)',
  'authenticated violinhero.can_read_submission_audio(text)',
  'authenticated violinhero.can_upload_submission_audio(text)',
  'authenticated violinhero.close_class(uuid)',
  'authenticated violinhero.create_assignment(uuid,text,violinhero.chart_level,violinhero.play_mode,timestamp with time zone,text,text)',
  'authenticated violinhero.create_challenge(uuid,integer)',
  'authenticated violinhero.create_class(text)',
  'authenticated violinhero.create_guardian_invite(uuid)',
  'authenticated violinhero.ensure_my_profile()',
  'authenticated violinhero.get_assignment(uuid)',
  'authenticated violinhero.get_challenge(text)',
  'authenticated violinhero.get_class(uuid)',
  'authenticated violinhero.get_my_assignments()',
  'authenticated violinhero.get_my_class()',
  'authenticated violinhero.get_my_plan()',
  'authenticated violinhero.get_ranking(text,violinhero.chart_level,text,integer)',
  'authenticated violinhero.get_song(text,violinhero.chart_level)',
  'authenticated violinhero.get_student_progress(uuid)',
  'authenticated violinhero.list_class_assignments(uuid)',
  'authenticated violinhero.list_my_challenges()',
  'authenticated violinhero.list_my_children()',
  'authenticated violinhero.list_my_classes()',
  'authenticated violinhero.reset_student_pin(uuid)',
  'authenticated violinhero.review_submission(uuid,integer,text,text)',
  'authenticated violinhero.set_student_active(uuid,boolean)',
  'authenticated violinhero.submit_assignment(uuid,uuid,text,integer)',
  'authenticated violinhero.submit_play(jsonb)',
];

/** Chart mínimo e válido do formato Song v1, com o id e o nível da linha. */
function chartOf(id, level = 'easy', extra = {}) {
  return {
    formatVersion: 1, id, title: 'Teste', composer: '', key: 'D major', bpm: 60,
    timeSignature: { beats: 4, unit: 4 }, level,
    measures: [{ beats: 4, notes: [{ beat: 0, beats: 4, midi: 62, string: 1, finger: 0 }] }],
    ...extra,
  };
}

/** `notes` semínimas em compassos de 4 (a 60 bpm, uma por segundo); a última ligada à anterior com `tie`. */
function measuresOf(notes, { tie = false } = {}) {
  const measures = [];
  for (let i = 0; i < notes; i++) {
    if (i % 4 === 0) measures.push({ beats: 4, notes: [] });
    const note = { beat: i % 4, beats: 1, midi: 62, string: 1, finger: 0 };
    if (tie && i === notes - 1 && i > 0) note.tie = true;
    measures.at(-1).notes.push(note);
  }
  return measures;
}

/** Música gravada como o servidor (sem RLS): do catálogo quando owner é null, importada senão. */
async function serverSong(c, { owner = null, levels = ['easy'], notes = null, tie = false } = {}) {
  const id = owner ? randomUUID() : `t-${randomUUID().slice(0, 8)}`;
  await c.query(
    `insert into ${S}.songs (id, title, bpm, time_beats, time_unit, duration_seconds, origin, owner_id, visibility)
     values ($1, 'Teste', 60, 4, 4, 4, $2, $3, $4)`,
    [id, owner ? 'imported' : 'catalog', owner, owner ? 'private' : 'public']);
  for (const level of levels) {
    await c.query(`insert into ${S}.song_charts (song_id, level, format_version, chart) values ($1, $2, 1, $3)`,
      [id, level, JSON.stringify(chartOf(id, level, notes ? { measures: measuresOf(notes, { tie }) } : {}))]);
  }
  await c.query(`insert into ${S}.song_sources (song_id, format, file_name, content) values ($1, 'musicxml', 'a.musicxml', '<score-partwise/>')`, [id]);
  return id;
}

const getSong = (c, uid, id, level = 'easy') => as(c, uid, `select * from ${S}.get_song($1, $2)`, [id, level]);

const POINTS = { perfect: 100, great: 70, good: 40, miss: 0 };

/** Pontos de uma partida tocada na ordem dada, como score.ts (×1 nos 10 primeiros seguidos, até ×4). */
function scoreOf(sequence) {
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  for (const j of sequence) {
    if (j === 'miss') { combo = 0; continue; }
    score += POINTS[j] * Math.min(4, 1 + Math.floor(combo / 10));
    maxCombo = Math.max(maxCombo, ++combo);
  }
  return { score, maxCombo };
}

/** Partida coerente, como o app manda depois de buildResult; `sequence` é a ordem dos julgamentos. */
function playOf(songId, { sequence = ['perfect'], ...overrides } = {}) {
  const counts = { perfect: 0, great: 0, good: 0, miss: 0 };
  for (const j of sequence) counts[j]++;
  const total = sequence.length;
  const hits = total - counts.miss;
  const earned = counts.perfect * 100 + counts.great * 70 + counts.good * 40;
  const { score, maxCombo } = scoreOf(sequence);
  return {
    client_id: randomUUID(), song_id: songId, level: 'easy', mode: 'arcade',
    finished: true, no_fail: false, looped: false, speed: 1, score, max_combo: maxCombo,
    accuracy: total ? (100 * earned) / (100 * total) : 0,
    counts, mean_abs_cents: hits ? 14.5 : null, string_cents: [null, hits ? 3.25 : null, null, null],
    duration_ms: 1000 * total + 500, played_at: new Date().toISOString(),
    ...overrides,
  };
}

const submit = (c, uid, play) => as(c, uid, `select ${S}.submit_play($1) as r`, [JSON.stringify(play)]).then((res) => res.rows[0].r);
const invalid = (promise, message) => assert.rejects(promise, (e) => e.code === '22023', message);
const notFound = (promise) => assert.rejects(promise, (e) => e.code === 'P0002');
const PROGRESS_TABLES = ['plays', 'records', 'badges_earned', 'play_days', 'streaks'];

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

/** Roda `sql` como as Edge Functions (service_role: ignora RLS, mas não GRANT). */
async function asServer(c, sql, params = []) {
  await c.query('savepoint srv');
  try {
    await c.query('set local role service_role');
    const res = await c.query(sql, params);
    await c.query('release savepoint srv');
    return res;
  } catch (e) {
    await c.query('rollback to savepoint srv');
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

    it('dono NÃO grava música direto (nem ficha, nem original, nem renomeia): só a Edge Function, por import_song', async () => {
      const dono = await newUser(c);
      await denied(as(c, dono,
        `insert into ${S}.songs (title, bpm, time_beats, time_unit, duration_seconds, origin) values ('Minha', 90, 3, 4, 12, 'imported')`));
      const id = await serverSong(c, { owner: dono });
      await denied(as(c, dono, `update ${S}.songs set title = 'Minha 2' where id = $1`, [id]));
      await denied(as(c, dono, `update ${S}.song_sources set content = '<x/>' where song_id = $1`, [id]));
      await c.query(`delete from ${S}.song_sources where song_id = $1`, [id]);
      await denied(as(c, dono, `insert into ${S}.song_sources (song_id, format, file_name, content) values ($1, 'musicxml', 'm.musicxml', '<x/>')`, [id]));
    });

    it('dono apaga a própria música: ficha, charts e original saem juntos', async () => {
      const dono = await newUser(c);
      const id = await serverSong(c, { owner: dono });
      assert.equal((await as(c, dono, `delete from ${S}.songs where id = $1`, [id])).rowCount, 1);
      const left = await c.query(
        `select (select count(*) from ${S}.song_charts where song_id = $1)::int + (select count(*) from ${S}.song_sources where song_id = $1)::int as n`, [id]);
      assert.equal(left.rows[0].n, 0);
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
        await denied(as(c, outro, `update ${S}.songs set title = 'invasor' where id = $1`, [id]));
        assert.equal((await as(c, outro, `delete from ${S}.songs where id = $1`, [id])).rowCount, 0);
        await denied(as(c, outro, `update ${S}.song_sources set content = '<invasor/>' where song_id = $1`, [id]));
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
      await denied(as(c, a, `insert into ${S}.song_sources (song_id, format, file_name, content) values ($1, 'musicxml', 'a', '<x/>')`, [id]));
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
      await denied(as(c, u, `insert into ${S}.songs (title, bpm, time_beats, time_unit, duration_seconds, origin) values ('X', 60, 4, 4, 4, 'catalog')`));
      await denied(as(c, u, `update ${S}.songs set title = 'invasor' where id = $1`, [id]));
      assert.equal((await as(c, u, `delete from ${S}.songs where id = $1`, [id])).rowCount, 0);
      assert.deepEqual((await as(c, u, `select song_id from ${S}.song_sources where song_id = $1`, [id])).rows, []);
      await denied(as(c, u, `update ${S}.song_sources set content = '<x/>' where song_id = $1`, [id]));
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
          assert.equal(rows[0].category, sheet.category, `${sheet.id} ${level}`);
        }
      }
    });

    it('seed grava a categoria do MusicXML: os exercícios técnicos vêm como exercicio, as músicas como musica', async () => {
      const { loadCatalog, seedCatalog } = await import('./seed-songs.mjs');
      const entries = await loadCatalog();
      await seedCatalog(c, entries);
      const { rows } = await c.query(`select id, category from ${S}.songs where id = any($1)`, [entries.map((e) => e.sheet.id)]);
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.category]));
      assert.equal(entries.filter((e) => e.sheet.category === 'exercicio').length, 9);
      for (const { sheet } of entries) assert.equal(byId[sheet.id], sheet.category, sheet.id);
      // trocar a categoria no arquivo muda só a linha da ficha
      const [first] = entries;
      const flipped = { ...first, sheet: { ...first.sheet, category: first.sheet.category === 'musica' ? 'exercicio' : 'musica' } };
      assert.deepEqual(await seedCatalog(c, [flipped, ...entries.slice(1)]), { songs: 1, song_sources: 0, song_charts: 0 });
    });

    it('exercício só no catálogo, e ninguém do app escreve a categoria', async () => {
      const dono = await newUser(c);
      const id = await serverSong(c, { owner: dono });
      assert.equal((await getSong(c, dono, id)).rows[0].category, 'musica');
      await c.query('savepoint cat');
      await assert.rejects(c.query(`update ${S}.songs set category = 'exercicio' where id = $1`, [id]), /songs_category_catalog/);
      await c.query('rollback to savepoint cat');
      await denied(as(c, dono, `update ${S}.songs set category = 'exercicio' where id = $1`, [id]));
      await denied(as(c, dono,
        `insert into ${S}.songs (title, bpm, time_beats, time_unit, duration_seconds, origin, category) values ('X', 60, 4, 4, 4, 'imported', 'musica')`));
      const catalogo = await serverSong(c);
      await c.query(`update ${S}.songs set category = 'exercicio' where id = $1`, [catalogo]);
      assert.equal((await getSong(c, dono, catalogo)).rows[0].category, 'exercicio');
    });
  });

  describe('partidas', () => {
    it('anônimo envia a partida e lê o que ela rendeu: partida, recorde, selos, dia e sequência', async () => {
      const u = await newUser(c);
      const id = await serverSong(c, { notes: 4 });
      const play = playOf(id, { sequence: ['perfect', 'great', 'good', 'perfect'] });
      const r = await submit(c, u, play);
      assert.equal(r.duplicate, false);
      assert.equal(r.accuracy, 77.5);
      assert.deepEqual(r.record, { previous: null, improved: true });
      assert.deepEqual(r.badges, ['primeira-musica', 'sem-erros']);
      assert.equal(r.streak.current_days, 1);
      const { rows: [p] } = await as(c, u, `select * from ${S}.plays`);
      assert.equal(p.id, r.play_id);
      assert.deepEqual([p.score, p.perfect, p.great, p.good, p.miss, p.max_combo], [310, 2, 1, 1, 0, 4]);
      assert.deepEqual(p.string_cents.map((v) => (v === null ? null : Number(v))), [null, 3.25, null, null]);
      assert.equal(p.chart_hash, (await c.query(`select hash from ${S}.song_charts where song_id = $1`, [id])).rows[0].hash);
      assert.deepEqual((await as(c, u, `select score, play_id from ${S}.records`)).rows, [{ score: 310, play_id: r.play_id }]);
      assert.equal((await as(c, u, `select badge_id from ${S}.badges_earned`)).rows.length, 2);
      assert.deepEqual((await as(c, u, `select seconds, plays from ${S}.play_days`)).rows, [{ seconds: 4, plays: 1 }]);
      assert.equal((await as(c, u, `select best_days from ${S}.streaks`)).rows[0].best_days, 1);
      // Afinação de ouro: até 10 ¢ de média acertando 90% ou mais; o selo só vem na primeira vez
      const gold = await submit(c, u, playOf(id, { sequence: Array(4).fill('perfect'), mean_abs_cents: 9.5 }));
      assert.deepEqual(gold.badges, ['afinacao-de-ouro']);
      assert.deepEqual((await submit(c, u, playOf(id, { mean_abs_cents: 9.5, sequence: Array(4).fill('perfect') }))).badges, []);
    });

    it('reenvio do mesmo client_id devolve a mesma partida e não conta de novo', async () => {
      const u = await newUser(c);
      const id = await serverSong(c);
      const play = playOf(id, { mean_abs_cents: 4 });
      const first = await submit(c, u, play);
      assert.deepEqual(first.badges, ['primeira-musica', 'sem-erros', 'afinacao-de-ouro']);
      const again = await submit(c, u, play);
      assert.equal(again.duplicate, true);
      assert.equal(again.play_id, first.play_id);
      // Os mesmos selos, na mesma ordem (a de BADGES), sem gravar outra linha
      assert.deepEqual(again.badges, first.badges);
      assert.deepEqual(again.streak, first.streak);
      assert.equal((await c.query(`select count(*)::int as n from ${S}.badges_earned where user_id = $1`, [u])).rows[0].n, 3);
      assert.equal((await c.query(`select count(*)::int as n from ${S}.plays where user_id = $1`, [u])).rows[0].n, 1);
      assert.equal((await c.query(`select plays from ${S}.play_days where user_id = $1`, [u])).rows[0].plays, 1);
      // O mesmo client_id de outro jogador é outra partida
      assert.equal((await submit(c, await newUser(c), play)).duplicate, false);
    });

    for (const anonymous of [true, false]) {
      const who = anonymous ? 'anônimo' : 'com conta';
      it(`outro jogador (${who}) NÃO lê partida, recorde, selo, dia nem sequência alheios`, async () => {
        const dono = await newUser(c);
        const outro = await newUser(c, { anonymous });
        await submit(c, dono, playOf(await serverSong(c)));
        for (const table of PROGRESS_TABLES) {
          assert.equal((await c.query(`select count(*)::int as n from ${S}.${table} where user_id = $1`, [dono])).rows[0].n > 0, true, table);
          assert.deepEqual((await as(c, outro, `select * from ${S}.${table}`)).rows, [], table);
        }
      });
    }

    it('ninguém do app escreve direto em plays, records, badges_earned, play_days ou streaks, nem nas próprias linhas', async () => {
      const u = await newUser(c);
      const id = await serverSong(c);
      const { play_id } = await submit(c, u, playOf(id));
      await denied(as(c, u, `insert into ${S}.plays (user_id, client_id, song_id, level, chart_hash, mode, finished, score, accuracy,
        perfect, great, good, miss, max_combo, string_cents, duration_ms, played_at, week)
        values ($1, $2, $3, 'easy', 'x', 'arcade', true, 999999, 100, 1, 0, 0, 0, 1, '{null,null,null,null}', 1, now(), current_date)`,
      [u, randomUUID(), id]));
      await denied(as(c, u, `update ${S}.plays set score = 999999 where user_id = $1`, [u]));
      await denied(as(c, u, `delete from ${S}.plays where user_id = $1`, [u]));
      await denied(as(c, u, `insert into ${S}.records (user_id, song_id, level, score, accuracy, play_id) values ($1, $2, 'hard', 1, 1, $3)`, [u, id, play_id]));
      await denied(as(c, u, `insert into ${S}.badges_earned (user_id, badge_id, play_id) values ($1, 'combo-100', $2)`, [u, play_id]));
      await denied(as(c, u, `insert into ${S}.streaks (user_id, current_days, best_days, last_day) values ($1, 99, 99, current_date)`, [u]));
      for (const table of ['records', 'play_days', 'streaks']) {
        await denied(as(c, u, `update ${S}.${table} set user_id = user_id where user_id = $1`, [u]));
        await denied(as(c, u, `delete from ${S}.${table} where user_id = $1`, [u]));
      }
      await denied(as(c, u, `delete from ${S}.badges_earned where user_id = $1`, [u]));
    });

    it('partida forjada é recusada: pontos acima do máximo, fora do mínimo, precisão, combo e notas incoerentes', async () => {
      const u = await newUser(c);
      const id = await serverSong(c, { notes: 12 });
      const twelve = Array(12).fill('perfect');
      const ok = playOf(id, { sequence: twelve });
      assert.equal(ok.score, 1400);
      const forged = [
        { ...ok, score: 1410 },                                   // um nada acima do teto
        { ...ok, score: 1395 },                                   // não fecha em dezenas
        { ...ok, score: 1100 },                                   // abaixo de 12 Perfeitos a ×1
        { ...ok, accuracy: 99 },                                  // precisão que as contagens não dão
        { ...ok, max_combo: 13 },                                 // combo maior que os acertos
        { ...ok, max_combo: 5 },                                  // 12 acertos sem erro dão combo 12
        { ...ok, counts: { ...ok.counts, perfect: 13 } },         // mais notas que o chart
        { ...ok, finished: true, counts: { ...ok.counts, perfect: 11 }, score: 1200, max_combo: 11 }, // terminou sem julgar todas
        { ...ok, score: 1400.5 },                                 // não inteiro
        { ...ok, counts: { ...ok.counts, miss: -1 } },
        { ...ok, mean_abs_cents: null },                          // acertou e não mediu afinação
        { ...ok, string_cents: [0, 0, 0] },                       // 3 cordas
        { ...ok, string_cents: [null, 300, null, null] },         // outra nota, não desafino
        { ...ok, looped: true },                                  // laço fora da prática
        { ...ok, speed: 0.7 },                                    // velocidade fora da prática
        { ...ok, mode: 'karaoke' },
        { ...ok, played_at: new Date(Date.now() - 40 * 86400e3).toISOString() },
        { ...ok, counts: 'tudo perfeito' },
      ];
      for (const play of forged) await invalid(submit(c, u, play), JSON.stringify(play));
      // Sem acerto não há afinação
      const allMiss = playOf(id, { sequence: Array(12).fill('miss') });
      await invalid(submit(c, u, { ...allMiss, string_cents: [0, null, null, null] }));
      await invalid(submit(c, u, { ...allMiss, mean_abs_cents: 3 }));
      assert.equal((await submit(c, u, allMiss)).badges.length, 1);
      assert.equal((await submit(c, u, ok)).duplicate, false);
      assert.equal((await c.query(`select count(*)::int as n from ${S}.plays where user_id = $1`, [u])).rows[0].n, 2);
    });

    it('o teto de pontos é o do motor: 25 Perfeitos dão 4500 e o selo de combo 25; um Erro no meio tira o teto', async () => {
      const u = await newUser(c);
      const id = await serverSong(c, { notes: 25 });
      const perfect = playOf(id, { sequence: Array(25).fill('perfect') });
      assert.equal(perfect.score, 4500);
      assert.deepEqual((await submit(c, u, perfect)).badges, ['primeira-musica', 'sem-erros', 'combo-25']);
      const broken = playOf(id, { sequence: [...Array(12).fill('perfect'), 'miss', ...Array(12).fill('perfect')] });
      await invalid(submit(c, u, { ...broken, score: broken.score + 10 }));
      assert.equal((await submit(c, u, broken)).record.improved, false);
    });

    it('ligada não é ataque: o chart de 4 notas com 1 ligada pede 3 julgamentos', async () => {
      const u = await newUser(c);
      const id = await serverSong(c, { notes: 4, tie: true });
      await invalid(submit(c, u, playOf(id, { sequence: Array(4).fill('perfect') })));
      await submit(c, u, playOf(id, { sequence: Array(3).fill('perfect') }));
    });

    it('música inexistente, nível que ela não tem e importada alheia dão o mesmo "não encontrada"', async () => {
      const u = await newUser(c);
      const dono = await newUser(c);
      await notFound(submit(c, u, playOf('nao-existe')));
      await notFound(submit(c, u, playOf(await serverSong(c), { level: 'hard' })));
      await notFound(submit(c, u, playOf(await serverSong(c, { owner: dono }))));
      // A própria importada vale
      await submit(c, dono, playOf(await serverSong(c, { owner: dono })));
    });

    it('partida interrompida guarda o que foi julgado, sem recorde, sem selo de fim e sem ranking', async () => {
      const u = await newUser(c);
      const id = await serverSong(c, { notes: 30 });
      const r = await submit(c, u, playOf(id, { finished: false, sequence: Array(26).fill('perfect') }));
      assert.equal(r.record, null);
      assert.deepEqual(r.badges, ['combo-25']);
      const { rows } = await as(c, u, `select ranking_points, counts_for_record from ${S}.plays`);
      assert.deepEqual(rows, [{ ranking_points: 0, counts_for_record: false }]);
    });

    it('recorde só sobe: pontuação menor não troca o recorde e devolve o anterior', async () => {
      const u = await newUser(c);
      const id = await serverSong(c, { notes: 4 });
      const best = await submit(c, u, playOf(id, { sequence: Array(4).fill('perfect') }));
      const worse = await submit(c, u, playOf(id, { sequence: ['perfect', 'miss', 'good', 'good'] }));
      assert.deepEqual(worse.record, { previous: 400, improved: false });
      assert.deepEqual((await as(c, u, `select score, play_id from ${S}.records`)).rows, [{ score: 400, play_id: best.play_id }]);
      assert.deepEqual(worse.badges, []);
    });

    it('prática (com laço e devagar) entra no histórico e no tempo do dia, mas não vale recorde, selo nem ranking', async () => {
      const u = await newUser(c);
      const id = await serverSong(c, { notes: 4 });
      // 30 s num chart de 1 nota por segundo: cabem 30 + um compasso, além disso é forjada
      const practice = (n) => playOf(id, { mode: 'practice', looped: true, speed: 0.5, duration_ms: 30000, sequence: Array(n).fill('perfect') });
      await invalid(submit(c, u, practice(35)));
      const r = await submit(c, u, practice(30));
      assert.equal(r.record, null);
      assert.deepEqual(r.badges, []);
      const { rows } = await as(c, u, `select practice, looped, speed, ranking_points from ${S}.plays`);
      assert.deepEqual(rows, [{ practice: true, looped: true, speed: '0.50', ranking_points: 0 }]);
      assert.deepEqual((await as(c, u, `select * from ${S}.records`)).rows, []);
      assert.deepEqual((await as(c, u, `select seconds from ${S}.play_days`)).rows, [{ seconds: 30 }]);
    });

    it('partida comum que virou prática (combo zera na virada) vale como prática e não como partida normal', async () => {
      const u = await newUser(c);
      const id = await serverSong(c, { notes: 20 });
      // 10 Perfeitos antes da virada e 10 na prática, que começa do combo zero: 2000 pontos, combo máximo 10
      const converted = { ...playOf(id, { sequence: Array(20).fill('perfect') }), score: 2000, max_combo: 10 };
      await invalid(submit(c, u, converted));
      const r = await submit(c, u, { ...converted, mode: 'practice', speed: 0.7, duration_ms: 25000 });
      assert.equal(r.record, null);
      assert.deepEqual(r.badges, []);
      // Duas quebras sem erro, nem na prática
      await invalid(submit(c, u, { ...converted, mode: 'practice', speed: 0.7, duration_ms: 25000, client_id: randomUUID(), max_combo: 6, score: 2000 }));
    });

    describe('selos: casos compartilhados com o motor (badgeCases.json)', () => {
      for (const k of BADGE_CASES) {
        it(k.name, async () => {
          const u = await newUser(c);
          const { perfect, great, good, miss } = k.counts;
          const hits = perfect + great + good;
          const total = hits + miss;
          const id = await serverSong(c, { notes: k.chartNotes ?? total });
          // Pontos no mínimo das contagens (×1 sempre cabe no teto); a prática leva tempo de sobra
          const play = {
            ...playOf(id, { sequence: [] }),
            mode: k.practice ? 'practice' : 'arcade',
            finished: k.finished,
            counts: k.counts,
            score: 100 * perfect + 70 * great + 40 * good,
            max_combo: k.maxCombo,
            accuracy: total ? (100 * perfect + 70 * great + 40 * good) / total : 0,
            mean_abs_cents: k.meanAbsCents,
            string_cents: [null, hits ? 3.25 : null, null, null],
            duration_ms: 1000 * total + 60000,
          };
          assert.deepEqual((await submit(c, u, play)).badges, k.badges);
          const { rows } = await as(c, u, `select badge_id from ${S}.badges_earned order by earned_at, badge_id`);
          assert.deepEqual(rows.map((r) => r.badge_id).sort(), [...k.badges].sort());
        });
      }
    });

    it('partida forjada (recusada) não deixa selo, dia nem sequência', async () => {
      const u = await newUser(c);
      const id = await serverSong(c, { notes: 30 });
      const ok = playOf(id, { sequence: Array(30).fill('perfect'), mean_abs_cents: 2 });
      for (const play of [{ ...ok, score: ok.score + 10 }, { ...ok, max_combo: 31 }, { ...ok, accuracy: 50 }]) {
        await invalid(submit(c, u, play));
      }
      for (const table of PROGRESS_TABLES) {
        assert.equal((await c.query(`select count(*)::int as n from ${S}.${table} where user_id = $1`, [u])).rows[0].n, 0, table);
      }
    });

    it('prática não dá selo nem marca dia de sequência; o tempo do dia soma', async () => {
      const u = await newUser(c);
      const id = await serverSong(c, { notes: 30 });
      const practice = playOf(id, { mode: 'practice', speed: 0.5, duration_ms: 60000, sequence: Array(30).fill('perfect'), mean_abs_cents: 2 });
      const r = await submit(c, u, practice);
      assert.deepEqual(r.badges, []);
      assert.equal(r.streak, null);
      assert.deepEqual((await as(c, u, `select seconds, plays from ${S}.play_days`)).rows, [{ seconds: 60, plays: 0 }]);
      assert.deepEqual((await as(c, u, `select * from ${S}.streaks`)).rows, []);
      assert.deepEqual((await as(c, u, `select * from ${S}.badges_earned`)).rows, []);
      // O reenvio da prática também não traz sequência
      assert.equal((await submit(c, u, practice)).streak, null);
      // A partida normal do mesmo dia marca
      const s = (await submit(c, u, playOf(id, { sequence: Array(30).fill('perfect') }))).streak;
      assert.deepEqual([s.current_days, s.best_days], [1, 1]);
    });

    it('partida sem nota julgada não marca dia', async () => {
      const u = await newUser(c);
      const id = await serverSong(c, { notes: 4 });
      const r = await submit(c, u, playOf(id, { finished: false, sequence: [] }));
      assert.equal(r.streak, null);
      assert.deepEqual((await as(c, u, `select plays from ${S}.play_days`)).rows, [{ plays: 0 }]);
    });

    it('sequência: dias seguidos somam, um buraco zera a atual e mantém a melhor, dia fora de ordem recalcula', async () => {
      const u = await newUser(c);
      const id = await serverSong(c);
      // Meio-dia em São Paulo, n dias atrás
      const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10) + 'T15:00:00Z';
      const on = (n) => submit(c, u, playOf(id, { played_at: daysAgo(n) }));
      await on(6);
      await on(5);
      let s = (await on(4)).streak;
      assert.deepEqual([s.current_days, s.best_days], [3, 3]);
      s = (await on(1)).streak;
      assert.deepEqual([s.current_days, s.best_days], [1, 3]);
      // A fila offline entrega os dias 2 e 3 depois: a atual cresce e, fechado o buraco, emenda com a de antes
      s = (await on(2)).streak;
      assert.deepEqual([s.current_days, s.best_days], [2, 3]);
      s = (await on(3)).streak;
      assert.deepEqual([s.current_days, s.best_days], [6, 6]);
      assert.equal(s.last_day, daysAgo(1).slice(0, 10));
      // Duas no mesmo dia: o tempo soma, a sequência não
      s = (await on(1)).streak;
      assert.equal(s.current_days, 6);
      assert.equal((await as(c, u, `select plays from ${S}.play_days where day = $1`, [daysAgo(1).slice(0, 10)])).rows[0].plays, 2);
    });

    it('hora no futuro vira agora; o dia é o de São Paulo', async () => {
      const u = await newUser(c);
      const id = await serverSong(c);
      await submit(c, u, playOf(id, { played_at: new Date(Date.now() + 86400e3).toISOString() }));
      const { rows } = await as(c, u, `select played_at <= now() as ok from ${S}.plays`);
      assert.deepEqual(rows, [{ ok: true }]);
      const { rows: [d] } = await c.query(`select ${S}.local_day('2026-10-27T02:30:00Z')::text as day`);
      assert.equal(d.day, '2026-10-26');
    });

    it('ranking: pontos pesados pelo nível, semana a partir de segunda e apelido de bicho + número', async () => {
      const u = await newUser(c);
      const id = await serverSong(c, { levels: ['easy', 'hard'] });
      await submit(c, u, playOf(id));
      await submit(c, u, playOf(id, { level: 'hard' }));
      const { rows } = await c.query(
        `select level, ranking_points, extract(isodow from week)::int as dow, ${S}.local_day(played_at) - week as since
           from ${S}.plays where user_id = $1 order by level`, [u]);
      assert.deepEqual(rows.map((r) => [r.level, r.ranking_points, r.dow]), [['easy', 100, 1], ['hard', 150, 1]]);
      for (const r of rows) assert.ok(r.since >= 0 && r.since < 7);
      await as(c, u, `update ${S}.profiles set animal = 'fox' where id = $1`, [u]);
      const { rows: [p] } = await c.query(`select ${S}.ranking_name(animal, nickname_tag) as name, nickname_tag from ${S}.profiles where id = $1`, [u]);
      assert.match(p.name, /^Raposa \d{4}$/);
      assert.ok(p.nickname_tag >= 1000 && p.nickname_tag <= 9999);
      await denied(as(c, u, `update ${S}.profiles set nickname_tag = 1234 where id = $1`, [u]));
    });

    it('sem login (anon) NÃO envia partida, NÃO pede perfil e NÃO lê progresso', async () => {
      const id = await serverSong(c);
      await denied(as(c, null, `select ${S}.submit_play($1)`, [JSON.stringify(playOf(id))]));
      await denied(as(c, null, `select ${S}.ensure_my_profile()`));
      for (const table of PROGRESS_TABLES) await denied(as(c, null, `select * from ${S}.${table}`));
    });
  });

  describe('ranking', () => {
    const ranking = (uid, id, { period = 'all', limit = 20, level = 'easy' } = {}) =>
      as(c, uid, `select * from ${S}.get_ranking($1, $2, $3, $4)`, [id, level, period, limit]);
    const rowsOf = async (...args) => (await ranking(...args)).rows.map((r) => [r.rank, r.ranking_name, r.points, r.is_me]);
    /** Conta (não anônima) com bicho, apelido digitado e o nome público que o ranking mostra. */
    async function account(animal = 'fox', nickname = 'Segredo') {
      const id = await newUser(c, { anonymous: false });
      await c.query(`update ${S}.profiles set animal = $2, nickname = $3 where id = $1`, [id, animal, nickname]);
      const { rows: [p] } = await c.query(`select ${S}.ranking_name(animal, nickname_tag) as name from ${S}.profiles where id = $1`, [id]);
      return { id, name: p.name };
    }
    const FOUR = { sequence: Array(4).fill('perfect') };
    const TWO = { sequence: ['perfect', 'perfect', 'miss', 'miss'] };

    it('uma linha por conta com a melhor partida (não a soma), nome gerado e empate para quem chegou primeiro', async () => {
      const id = await serverSong(c, { notes: 4 });
      const [a, b, d] = [await account('fox'), await account('cat'), await account('penguin')];
      await submit(c, a.id, playOf(id, TWO));
      await submit(c, a.id, playOf(id, FOUR));
      await submit(c, a.id, playOf(id, TWO));
      await submit(c, b.id, playOf(id, FOUR));
      await submit(c, d.id, playOf(id, TWO));
      // Na mesma transação now() não anda: b chegou antes de a
      await c.query(`update ${S}.plays set created_at = now() - interval '1 minute' where user_id = $1`, [b.id]);
      assert.deepEqual(await rowsOf(a.id, id), [[1, b.name, 400, false], [2, a.name, 400, true], [3, d.name, 200, false]]);
      assert.match(a.name, /^Raposa \d{4}$/);
      assert.equal(Number((await ranking(d.id, id)).rows[2].accuracy), 50);
    });

    it('NÃO devolve user_id, e-mail, apelido digitado, partidas nem afinação de ninguém', async () => {
      const id = await serverSong(c);
      const other = await account('cat', 'NomeDigitado');
      const me = await account('fox', 'MeuApelido');
      await submit(c, other.id, playOf(id));
      await submit(c, me.id, playOf(id));
      const res = await ranking(me.id, id);
      assert.deepEqual(res.fields.map((f) => f.name), ['rank', 'ranking_name', 'points', 'accuracy', 'is_me']);
      const seen = JSON.stringify(res.rows);
      for (const secret of [other.id, me.id, `p-${other.id}@t.test`, 'NomeDigitado', 'MeuApelido', '3.25', '14.5']) {
        assert.ok(!seen.includes(secret), `ranking mostrou ${secret}`);
      }
      // E a tabela continua fechada: só as próprias partidas
      const { rows } = await as(c, me.id, `select user_id from ${S}.plays`);
      assert.deepEqual(rows.map((r) => r.user_id), [me.id]);
    });

    it('anônimo NÃO aparece (mas vê o ranking); ao virar conta (mesmo id) entra com as partidas de antes', async () => {
      const id = await serverSong(c);
      const conta = await account();
      const anon = await newUser(c);
      await submit(c, conta.id, playOf(id));
      await submit(c, anon, playOf(id));
      assert.deepEqual(await rowsOf(anon, id), [[1, conta.name, 100, false]]);
      await c.query(`update ${S}.plays set created_at = now() - interval '1 minute' where user_id = $1`, [conta.id]);
      await c.query(`update auth.users set is_anonymous = false, email = $2 where id = $1`, [anon, `r-${anon}@t.test`]);
      assert.deepEqual((await rowsOf(anon, id)).map((r) => r[3]), [false, true]);
    });

    it('prática, partida interrompida e partida forjada recusada NÃO entram', async () => {
      const id = await serverSong(c, { notes: 4 });
      const u = await account();
      await submit(c, u.id, playOf(id, { mode: 'practice', looped: true, speed: 0.5, sequence: Array(8).fill('perfect'), duration_ms: 30000 }));
      await submit(c, u.id, playOf(id, { finished: false, sequence: ['perfect', 'perfect'] }));
      await invalid(submit(c, u.id, { ...playOf(id, FOUR), score: 999990 }));
      assert.deepEqual(await rowsOf(u.id, id), []);
      assert.deepEqual(await rowsOf(u.id, id, { period: 'week' }), []);
    });

    it('semana: vira na segunda 00:00 de Brasília; partida da semana passada fica só no geral', async () => {
      const { rows: [w] } = await c.query(
        `select ${S}.ranking_week('2026-10-26T02:59:59Z')::text as sunday, ${S}.ranking_week('2026-10-26T03:00:00Z')::text as monday`);
      assert.deepEqual(w, { sunday: '2026-10-19', monday: '2026-10-26' });
      const id = await serverSong(c);
      const [old, now] = [await account('cat'), await account('fox')];
      await submit(c, old.id, playOf(id, { played_at: new Date(Date.now() - 8 * 86400e3).toISOString() }));
      await submit(c, now.id, playOf(id));
      const { rows } = await c.query(`select count(*)::int as n from ${S}.plays where week <> ${S}.ranking_week(played_at)`);
      assert.equal(rows[0].n, 0);
      assert.deepEqual((await rowsOf(now.id, id, { period: 'week' })).map((r) => r[1]), [now.name]);
      assert.deepEqual((await rowsOf(now.id, id)).map((r) => r[1]).sort(), [old.name, now.name].sort());
    });

    it('fora do topo, a linha do próprio jogador vem no fim; ninguém de fora do topo além dele', async () => {
      const id = await serverSong(c, { notes: 4 });
      const [a, b, me] = [await account('fox'), await account('cat'), await account('penguin')];
      await submit(c, a.id, playOf(id, FOUR));
      await submit(c, b.id, playOf(id, { sequence: ['perfect', 'perfect', 'perfect', 'miss'] }));
      await submit(c, me.id, playOf(id, TWO));
      assert.deepEqual(await rowsOf(me.id, id, { limit: 1 }), [[1, a.name, 400, false], [3, me.name, 200, true]]);
      assert.deepEqual((await rowsOf(a.id, id, { limit: 1 })).map((r) => r[0]), [1]);
    });

    it('nível pesa os pontos e cada nível tem o seu ranking', async () => {
      const id = await serverSong(c, { levels: ['easy', 'hard'] });
      const u = await account();
      await submit(c, u.id, playOf(id, { level: 'hard' }));
      assert.deepEqual(await rowsOf(u.id, id), []);
      assert.deepEqual((await rowsOf(u.id, id, { level: 'hard' })).map((r) => r[2]), [150]);
    });

    it('importada (alheia ou a própria), música ou nível inexistente dão o mesmo "não encontrada"; período inválido é recusado', async () => {
      const dono = await account();
      const u = await account('cat');
      const own = await serverSong(c, { owner: dono.id });
      await submit(c, dono.id, playOf(own));
      // música do jogador é privada e fica fora do ranking, até para o dono (0009)
      await notFound(ranking(dono.id, own));
      await notFound(ranking(u.id, own));
      await notFound(ranking(u.id, 'nao-existe'));
      await notFound(ranking(u.id, await serverSong(c), { level: 'hard' }));
      await invalid(ranking(u.id, await serverSong(c), { period: 'month' }));
    });

    it('sem login (anon) NÃO chama get_ranking', async () => {
      const id = await serverSong(c);
      await denied(as(c, null, `select * from ${S}.get_ranking($1, 'easy', 'all', 20)`, [id]));
    });
  });

  describe('desafios', () => {
    const call = (uid, sql, params) => as(c, uid, sql, params).then((res) => res.rows[0].r);
    const create = (uid, playId, days = 2) => call(uid, `select ${S}.create_challenge($1, $2) as r`, [playId, days]);
    const read = (uid, code) => call(uid, `select ${S}.get_challenge($1) as r`, [code]);
    const accept = (uid, code) => call(uid, `select ${S}.accept_challenge($1) as r`, [code]);
    const mine = (uid) => call(uid, `select ${S}.list_my_challenges() as r`);
    const needsAccount = (promise) => assert.rejects(promise, (e) => e.code === '28000');
    /** Conta (não anônima) com bicho e apelido digitado; `name` é o nome público. */
    async function account(animal = 'fox', nickname = 'Segredo') {
      const id = await newUser(c, { anonymous: false });
      await c.query(`update ${S}.profiles set animal = $2, nickname = $3 where id = $1`, [id, animal, nickname]);
      const { rows: [p] } = await c.query(`select ${S}.ranking_name(animal, nickname_tag) as name from ${S}.profiles where id = $1`, [id]);
      return { id, name: p.name };
    }
    const FOUR = { sequence: Array(4).fill('perfect') };
    const THREE = { sequence: ['perfect', 'perfect', 'perfect', 'miss'] };
    const TWO = { sequence: ['perfect', 'perfect', 'miss', 'miss'] };
    /** Desafio de `who` com 300 pontos a bater numa música de 4 notas (ou a dada). */
    async function challengeOf(who, { song = null, days = 2 } = {}) {
      const songId = song ?? (await serverSong(c, { notes: 4, levels: ['easy', 'hard'] }));
      const play = await submit(c, who.id, playOf(songId, THREE));
      return { songId, play: play.play_id, challenge: await create(who.id, play.play_id, days) };
    }
    /**
     * O prazo acaba agora. Na transação now() não anda: o desafio passa a ter sido criado ontem, o aceite uma hora
     * atrás e as partidas que chegaram "agora" um minuto atrás (dentro do prazo); as enviadas depois ficam fora.
     */
    async function close(code) {
      const { rows: [{ id }] } = await c.query(
        `update ${S}.challenges set created_at = now() - interval '1 day', expires_at = now() - interval '1 second' where code = $1 returning id`, [code]);
      await c.query(`update ${S}.challenge_entries set accepted_at = now() - interval '1 hour' where challenge_id = $1 and accepted_at = now()`, [id]);
      await c.query(`update ${S}.plays set created_at = now() - interval '1 minute' where created_at = now()`);
    }

    it('o link mostra só música, nível, pontos, prazo e o nome gerado: nada de user_id, e-mail, apelido nem partida', async () => {
      const a = await account('cat', 'NomeDigitado');
      const { songId, play, challenge } = await challengeOf(a, { days: 3 });
      assert.match(challenge.code, /^[A-Za-z0-9_-]{12}$/);
      const visitor = await newUser(c);
      const seen = await read(visitor, challenge.code);
      assert.deepEqual(Object.keys(seen).sort(),
        ['challenger_name', 'closed', 'code', 'entries', 'expires_at', 'level', 'role', 'song_id', 'song_title', 'target_score']);
      assert.deepEqual([seen.song_id, seen.song_title, seen.level, seen.target_score, seen.challenger_name, seen.role, seen.entries, seen.closed],
        [songId, 'Teste', 'easy', 300, a.name, 'visitor', null, false]);
      const days = (new Date(seen.expires_at) - new Date((await c.query('select now() as n')).rows[0].n)) / 86400e3;
      assert.equal(Math.round(days), 3);
      const text = JSON.stringify(seen);
      for (const secret of [a.id, `p-${a.id}@t.test`, 'NomeDigitado', play, '14.5', '3.25']) {
        assert.ok(!text.includes(secret), `get_challenge mostrou ${secret}`);
      }
    });

    it('o código NÃO lista desafios: quem não é parte não lê challenges nem challenge_entries, nem sabendo o código', async () => {
      const a = await account();
      const b = await account('cat');
      const { challenge } = await challengeOf(a);
      await accept(b.id, challenge.code);
      for (const outsider of [await newUser(c), (await account('penguin')).id]) {
        assert.deepEqual((await as(c, outsider, `select code from ${S}.challenges`)).rows, []);
        assert.deepEqual((await as(c, outsider, `select code from ${S}.challenges where code = $1`, [challenge.code])).rows, []);
        assert.deepEqual((await as(c, outsider, `select challenge_id from ${S}.challenge_entries`)).rows, []);
        assert.equal((await read(outsider, challenge.code)).entries, null);
      }
      // As partes leem o desafio, mas não o id do desafiante nem a partida dele
      assert.equal((await as(c, a.id, `select code from ${S}.challenges`)).rows.length, 1);
      assert.equal((await as(c, b.id, `select code from ${S}.challenges`)).rows.length, 1);
      await denied(as(c, b.id, `select creator_id from ${S}.challenges`));
      await denied(as(c, b.id, `select play_id from ${S}.challenges`));
      // Aceites: cada um só o próprio; o desafiante NÃO lê o user_id de quem aceitou
      assert.deepEqual((await as(c, b.id, `select user_id from ${S}.challenge_entries`)).rows, [{ user_id: b.id }]);
      assert.deepEqual((await as(c, a.id, `select user_id from ${S}.challenge_entries`)).rows, []);
      // Escrever é só das funções
      await denied(as(c, a.id, `update ${S}.challenges set target_score = 0`));
      await denied(as(c, b.id, `insert into ${S}.challenge_entries (challenge_id, user_id) select id, $1 from ${S}.challenges`, [b.id]));
      await denied(as(c, b.id, `delete from ${S}.challenge_entries`));
    });

    it('código desconhecido não encontra nada; sem login (anon) NÃO chama nenhuma função nem lê as tabelas', async () => {
      const a = await account();
      const { play, challenge } = await challengeOf(a);
      await notFound(read(a.id, 'naoexiste123'));
      await notFound(accept((await account('cat')).id, 'naoexiste123'));
      await denied(as(c, null, `select ${S}.get_challenge($1)`, [challenge.code]));
      await denied(as(c, null, `select ${S}.accept_challenge($1)`, [challenge.code]));
      await denied(as(c, null, `select ${S}.create_challenge($1, 2)`, [play]));
      await denied(as(c, null, `select ${S}.list_my_challenges()`));
      await denied(as(c, null, `select code from ${S}.challenges`));
    });

    it('aceitar sem conta (anônimo) é recusado; criar também; o próprio desafiante e desafio encerrado não aceitam', async () => {
      const a = await account();
      const { songId, challenge } = await challengeOf(a);
      const guest = await newUser(c);
      await needsAccount(accept(guest, challenge.code));
      const guestPlay = await submit(c, guest, playOf(songId, FOUR));
      await needsAccount(create(guest, guestPlay.play_id));
      // Só os aceites deste desafio: o Supabase local é o mesmo do e2e, que deixa os dele na tabela
      const entries = await c.query(
        `select count(*)::int as n from ${S}.challenge_entries e join ${S}.challenges ch on ch.id = e.challenge_id where ch.code = $1`,
        [challenge.code]
      );
      assert.equal(entries.rows[0].n, 0);
      await invalid(accept(a.id, challenge.code));
      await close(challenge.code);
      await invalid(accept((await account('cat')).id, challenge.code));
    });

    it('quem aceitou vê só a própria linha; outro que aceitou NÃO lê a dele; o desafiante vê todos', async () => {
      const a = await account();
      const [b, d] = [await account('cat', 'Bia'), await account('penguin', 'Davi')];
      const { challenge } = await challengeOf(a);
      const accepted = await accept(b.id, challenge.code);
      assert.equal(accepted.role, 'entrant');
      assert.deepEqual(accepted.entries.map((e) => [e.name, e.is_me]), [[b.name, true]]);
      // Aceitar de novo devolve o mesmo, sem segunda linha
      assert.equal((await accept(b.id, challenge.code)).entries.length, 1);
      await accept(d.id, challenge.code);
      assert.deepEqual((await read(d.id, challenge.code)).entries.map((e) => e.name), [d.name]);
      assert.deepEqual((await as(c, d.id, `select user_id from ${S}.challenge_entries`)).rows, [{ user_id: d.id }]);
      const creator = await read(a.id, challenge.code);
      assert.equal(creator.role, 'creator');
      assert.deepEqual(creator.entries.map((e) => e.name).sort(), [b.name, d.name].sort());
      const text = JSON.stringify(creator);
      for (const secret of [b.id, d.id, 'Bia', 'Davi', `p-${b.id}@t.test`]) assert.ok(!text.includes(secret), `mostrou ${secret}`);
    });

    it('partida antes do aceite, depois do prazo, de outra música, de outro nível, prática ou interrompida NÃO conta', async () => {
      const a = await account();
      const b = await account('cat');
      const { songId, challenge } = await challengeOf(a);
      // Antes do aceite (chegou duas horas antes; o aceite abaixo volta só uma)
      const before = await submit(c, b.id, playOf(songId, FOUR));
      await c.query(`update ${S}.plays set created_at = now() - interval '2 hours' where id = $1`, [before.play_id]);
      await accept(b.id, challenge.code);
      await submit(c, b.id, playOf(await serverSong(c, { notes: 4 }), FOUR));
      await submit(c, b.id, playOf(songId, { ...FOUR, level: 'hard' }));
      await submit(c, b.id, playOf(songId, { mode: 'practice', looped: true, speed: 0.5, sequence: Array(4).fill('perfect'), duration_ms: 30000 }));
      await submit(c, b.id, playOf(songId, { finished: false, sequence: ['perfect', 'perfect', 'perfect'] }));
      const open = await read(b.id, challenge.code);
      assert.deepEqual([open.entries[0].best_score, open.entries[0].result], [null, null]);
      // Depois do prazo: o desafio acabou antes desta partida chegar
      await close(challenge.code);
      await submit(c, b.id, playOf(songId, FOUR));
      const closed = await read(b.id, challenge.code);
      assert.deepEqual([closed.closed, closed.entries[0].best_score, closed.entries[0].result], [true, null, 'lost']);
    });

    it('partida jogada sem rede antes do aceite e enviada depois NÃO conta (played_at antes do aceite)', async () => {
      const a = await account();
      const b = await account('cat');
      const { songId, challenge } = await challengeOf(a);
      await accept(b.id, challenge.code);
      // A fila do aparelho sobe agora (created_at = aceite) uma partida tocada 10 minutos antes
      const queuedPlay = await submit(c, b.id, playOf(songId, { ...FOUR, played_at: new Date(Date.now() - 10 * 60e3).toISOString() }));
      const { rows: [p] } = await c.query(`select played_at < created_at as before, created_at = now() as arrived_now from ${S}.plays where id = $1`, [queuedPlay.play_id]);
      assert.deepEqual(p, { before: true, arrived_now: true });
      const seen = await read(b.id, challenge.code);
      assert.deepEqual([seen.entries[0].best_score, seen.entries[0].result], [null, null]);
      // A mesma partida, jogada depois do aceite, conta
      await submit(c, b.id, playOf(songId, FOUR));
      assert.deepEqual((await read(b.id, challenge.code)).entries.map((e) => [e.best_score, e.result]), [[400, 'won']]);
    });

    it('resultado para os dois: venceu assim que passa os pontos; empate e derrota só no fim do prazo', async () => {
      const a = await account();
      const [win, tie, lose] = [await account('cat'), await account('penguin'), await account('fox')];
      const { songId, challenge } = await challengeOf(a);
      for (const u of [win, tie, lose]) await accept(u.id, challenge.code);
      await submit(c, win.id, playOf(songId, TWO));
      await submit(c, win.id, playOf(songId, FOUR));
      await submit(c, tie.id, playOf(songId, THREE));
      await submit(c, lose.id, playOf(songId, TWO));
      const resultOf = async (viewer) => Object.fromEntries((await read(viewer, challenge.code)).entries.map((e) => [e.name, [e.best_score, e.result]]));
      assert.deepEqual(await resultOf(a.id), { [win.name]: [400, 'won'], [tie.name]: [300, null], [lose.name]: [200, null] });
      await close(challenge.code);
      assert.deepEqual(await resultOf(a.id), { [win.name]: [400, 'won'], [tie.name]: [300, 'tie'], [lose.name]: [200, 'lost'] });
      assert.deepEqual(await resultOf(win.id), { [win.name]: [400, 'won'] });
      assert.deepEqual(await resultOf(tie.id), { [tie.name]: [300, 'tie'] });
      assert.deepEqual(await resultOf(lose.id), { [lose.name]: [200, 'lost'] });
    });

    it('criar: partida alheia, de música importada, que não vale ranking ou prazo fora de 1 a 7 dias é recusado', async () => {
      const a = await account();
      const b = await account('cat');
      const songId = await serverSong(c, { notes: 4 });
      const other = await submit(c, b.id, playOf(songId, FOUR));
      await notFound(create(a.id, other.play_id));
      await notFound(create(a.id, randomUUID()));
      const own = await serverSong(c, { owner: a.id });
      await notFound(create(a.id, (await submit(c, a.id, playOf(own))).play_id));
      const practice = await submit(c, a.id, playOf(songId, { mode: 'practice', looped: true, speed: 0.5, sequence: Array(4).fill('perfect'), duration_ms: 30000 }));
      await invalid(create(a.id, practice.play_id));
      await invalid(create(a.id, (await submit(c, a.id, playOf(songId, { finished: false, sequence: ['perfect'] }))).play_id));
      const good = await submit(c, a.id, playOf(songId, FOUR));
      await invalid(create(a.id, good.play_id, 0));
      await invalid(create(a.id, good.play_id, 8));
      assert.equal((await create(a.id, good.play_id, 7)).target_score, 400);
    });

    it('limite de 20 abertos por conta; a mesma partida devolve o mesmo desafio; encerrado libera a vaga', async () => {
      const a = await account();
      const songId = await serverSong(c, { notes: 4 });
      const codes = [];
      for (let i = 0; i < 20; i++) {
        const { play_id } = await submit(c, a.id, playOf(songId, THREE));
        codes.push((await create(a.id, play_id)).code);
      }
      assert.equal(new Set(codes).size, 20);
      const { play_id: extra } = await submit(c, a.id, playOf(songId, FOUR));
      await invalid(create(a.id, extra));
      // Toque duplo na 20ª: o mesmo desafio, sem erro de limite
      const last = (await c.query(`select play_id from ${S}.challenges where code = $1`, [codes[19]])).rows[0].play_id;
      assert.equal((await create(a.id, last)).code, codes[19]);
      await close(codes[0]);
      assert.match((await create(a.id, extra)).code, /^[A-Za-z0-9_-]{12}$/);
      // O limite é por conta: outra conta cria normalmente
      const b = await account('cat');
      assert.ok((await challengeOf(b, { song: songId })).challenge.code);
    });

    it('meus desafios: os que criei e os que aceitei, nunca os de outros', async () => {
      const a = await account();
      const b = await account('cat');
      const d = await account('penguin');
      const { challenge: mineA } = await challengeOf(a);
      const { challenge: mineB } = await challengeOf(b);
      const { challenge: notMine } = await challengeOf(d);
      await accept(a.id, mineB.code);
      assert.deepEqual((await mine(a.id)).map((x) => [x.code, x.role]).sort(), [[mineA.code, 'creator'], [mineB.code, 'entrant']].sort());
      assert.ok(!(await mine(a.id)).some((x) => x.code === notMine.code));
      assert.deepEqual(await mine(await newUser(c)), []);
    });
  });

  describe('ensure_my_profile', () => {
    it('cria o perfil de quem estava em auth.users antes do trigger e devolve o existente nas outras vezes', async () => {
      const u = await newUser(c, { anonymous: false });
      await c.query(`delete from ${S}.profiles where id = $1`, [u]);
      const { rows: [first] } = await as(c, u, `select * from ${S}.ensure_my_profile()`);
      assert.deepEqual([first.id, first.is_anonymous, Number(first.a4_hz)], [u, false, 442]);
      await as(c, u, `update ${S}.profiles set nickname = 'Bia' where id = $1`, [u]);
      const { rows: [again] } = await as(c, u, `select * from ${S}.ensure_my_profile()`);
      assert.equal(again.nickname, 'Bia');
    });

    it('NÃO cria nem devolve perfil de outro jogador', async () => {
      const a = await newUser(c);
      const b = await newUser(c);
      await c.query(`delete from ${S}.profiles where id = $1`, [b]);
      const { rows } = await as(c, a, `select id from ${S}.ensure_my_profile()`);
      assert.deepEqual(rows, [{ id: a }]);
      assert.equal((await c.query(`select count(*)::int as n from ${S}.profiles where id = $1`, [b])).rows[0].n, 0);
    });

    it('envio de partida cria o perfil que faltava', async () => {
      const u = await newUser(c);
      await c.query(`delete from ${S}.profiles where id = $1`, [u]);
      await submit(c, u, playOf(await serverSong(c)));
      assert.equal((await c.query(`select count(*)::int as n from ${S}.profiles where id = $1`, [u])).rows[0].n, 1);
    });
  });

  describe('conta', () => {
    /** O que o GoTrue faz ao confirmar o e-mail (ou ligar o Google) no anônimo: o mesmo id deixa de ser anônimo. */
    const link = (uid) => c.query(`update auth.users set is_anonymous = false, email = $2 where id = $1`, [uid, `c-${uid}@t.test`]);

    /** Tudo que `viewer` lê de `owner` em progresso e perfil; vazio é o esperado. */
    async function seenOf(viewer, owner) {
      const seen = {};
      for (const table of PROGRESS_TABLES) {
        const { rows } = await as(c, viewer, `select * from ${S}.${table} where user_id = $1`, [owner]);
        if (rows.length) seen[table] = rows.length;
      }
      const profile = await as(c, viewer, `select id from ${S}.profiles where id = $1`, [owner]);
      if (profile.rows.length) seen.profiles = 1;
      return seen;
    }

    it('criar conta mantém o id: partida, recorde, selo, dia, sequência e perfil continuam do jogador', async () => {
      const u = await newUser(c);
      await submit(c, u, playOf(await serverSong(c)));
      await link(u);
      assert.deepEqual(Object.keys(await seenOf(u, u)), [...PROGRESS_TABLES, 'profiles']);
      const { rows } = await as(c, u, `select is_anonymous from ${S}.profiles`);
      assert.deepEqual(rows, [{ is_anonymous: false }]);
    });

    it('depois do vínculo, a conta A NÃO lê nada da conta B, nem B de A', async () => {
      const a = await newUser(c);
      const b = await newUser(c);
      const id = await serverSong(c);
      await submit(c, a, playOf(id));
      await submit(c, b, playOf(id));
      await link(a);
      await link(b);
      assert.deepEqual(await seenOf(a, b), {});
      assert.deepEqual(await seenOf(b, a), {});
    });

    it('convidado novo depois de sair, e o anônimo antigo do aparelho que entrou na conta, NÃO leem nada da conta', async () => {
      const conta = await newUser(c);
      await submit(c, conta, playOf(await serverSong(c)));
      await link(conta);
      // O anônimo do outro aparelho subiu a fila antes de entrar na conta: as partidas ficam com ele
      const antigo = await newUser(c);
      await submit(c, antigo, playOf(await serverSong(c)));
      const novo = await newUser(c);
      assert.deepEqual(await seenOf(novo, conta), {});
      assert.deepEqual(await seenOf(antigo, conta), {});
      assert.deepEqual(await seenOf(conta, antigo), {});
    });

    it('ninguém do app vira conta sozinho nem lê e-mail de outro (auth fica fora do alcance)', async () => {
      const a = await newUser(c);
      const b = await newUser(c, { anonymous: false });
      await denied(as(c, a, `update ${S}.profiles set is_anonymous = false where id = $1`, [a]));
      await denied(as(c, a, `select email from auth.users where id = $1`, [b]));
    });
  });

  describe('import_song (Edge Function import-song)', () => {
    /** Chama import_song como a Edge Function: papel service_role, dono vindo do JWT já conferido. */
    async function importSong(owner, { id = randomUUID(), origin = 'imported', levels = ['easy', 'medium', 'hard'], replace = false,
      source = { format: 'musicxml', file_name: 'peca.musicxml', content: '<score-partwise/>' }, charts = null, title = 'Minha peça' } = {}) {
      const sheet = { title, composer: 'Eu', bpm: 60, time_beats: 4, time_unit: 4, key: 'D major', duration_seconds: 4 };
      const chartMap = charts ?? Object.fromEntries(levels.map((l) => [l, chartOf(id, l)]));
      await c.query('savepoint srv');
      try {
        await c.query('set local role service_role');
        const { rows } = await c.query(`select ${S}.import_song($1, $2, $3, $4, $5, $6, $7) as r`,
          [owner, id, origin, sheet, JSON.stringify(chartMap), source, replace]);
        await c.query('release savepoint srv');
        return rows[0].r;
      } catch (e) {
        await c.query('rollback to savepoint srv');
        throw e;
      } finally {
        await c.query('reset role');
      }
    }

    it('grava ficha privada do dono, os 3 charts com hash e o original; o dono lê por get_song', async () => {
      const dono = await newUser(c);
      const r = await importSong(dono, { source: { format: 'mxl', file_name: 'a.mxl', content: 'UEsDBA==' } });
      assert.deepEqual(r.levels, ['easy', 'medium', 'hard']);
      assert.equal(r.origin, 'imported');
      const { rows } = await c.query(`select owner_id, visibility, catalog_position from ${S}.songs where id = $1`, [r.id]);
      assert.deepEqual(rows, [{ owner_id: dono, visibility: 'private', catalog_position: null }]);
      const song = await getSong(c, dono, r.id, 'hard');
      assert.match(song.rows[0].hash, /^[0-9a-f]{64}$/);
      assert.equal(r.hashes.hard, song.rows[0].hash);
      assert.deepEqual(Object.keys(r.hashes).sort(), ['easy', 'hard', 'medium']);
      assert.deepEqual((await as(c, dono, `select format from ${S}.song_sources where song_id = $1`, [r.id])).rows, [{ format: 'mxl' }]);
    });

    for (const anonymous of [true, false]) {
      it(`outro jogador (${anonymous ? 'anônimo' : 'com conta'}) NÃO lê a importada: nem ficha, charts, original, get_song nem a lista`, async () => {
        const dono = await newUser(c);
        const outro = await newUser(c, { anonymous });
        const { id } = await importSong(dono, { origin: anonymous ? 'imported' : 'editor', source: { format: 'song', file_name: 'editor.json', content: '{}' } });
        assert.deepEqual((await as(c, outro, `select id from ${S}.songs where id = $1 or owner_id = $2`, [id, dono])).rows, []);
        assert.deepEqual((await as(c, outro, `select level from ${S}.song_charts where song_id = $1`, [id])).rows, []);
        assert.deepEqual((await as(c, outro, `select content from ${S}.song_sources where song_id = $1`, [id])).rows, []);
        for (const level of ['easy', 'medium', 'hard']) assert.deepEqual((await getSong(c, outro, id, level)).rows, []);
      });
    }

    it('o app NÃO chama import_song, nem com o próprio id de dono', async () => {
      const dono = await newUser(c);
      const id = randomUUID();
      await denied(as(c, dono, `select ${S}.import_song($1, $2, 'imported', '{}', $3, '{}')`, [dono, id, JSON.stringify({ easy: chartOf(id) })]));
      await denied(as(c, null, `select ${S}.import_song($1, $2, 'imported', '{}', '{}', '{}')`, [dono, id]));
    });

    it('limite de 50 músicas do jogador (importadas e do editor); apagar libera a vaga; outro jogador tem as suas', async () => {
      const dono = await newUser(c);
      const ids = [];
      for (let i = 0; i < 50; i++) ids.push((await importSong(dono, { levels: ['hard'], origin: i % 2 ? 'editor' : 'imported' })).id);
      await assert.rejects(importSong(dono, { levels: ['hard'] }), (e) => e.code === 'VHLIM');
      await importSong(await newUser(c), { levels: ['hard'] });
      await as(c, dono, `delete from ${S}.songs where id = $1`, [ids[0]]);
      await importSong(dono, { levels: ['hard'] });
      await assert.rejects(importSong(dono, { levels: ['hard'] }), (e) => e.code === 'VHLIM');
    });

    it('apagar música mantém selos e sequência, remove partidas e recorde, sem afetar outro jogador nem catálogo', async () => {
      const dono = await newUser(c);
      const outro = await newUser(c);
      const { id } = await importSong(dono, { levels: ['easy'] });
      const ownPlay = await submit(c, dono, playOf(id));
      assert.ok(ownPlay.badges.length > 0);
      const catalog = await serverSong(c);
      await submit(c, outro, playOf(catalog));
      const snapshot = async (user) => ({
        badges: (await as(c, user, `select badge_id, earned_at from ${S}.badges_earned order by badge_id`)).rows,
        days: (await as(c, user, `select * from ${S}.play_days order by day`)).rows,
        streaks: (await as(c, user, `select * from ${S}.streaks`)).rows,
        plays: (await as(c, user, `select id from ${S}.plays order by id`)).rows,
        records: (await as(c, user, `select * from ${S}.records order by song_id, level`)).rows,
      });
      const before = await snapshot(dono);
      const otherBefore = await snapshot(outro);
      assert.equal((await as(c, outro, `delete from ${S}.songs where id = $1 returning id`, [id])).rows.length, 0);
      assert.equal((await as(c, dono, `delete from ${S}.songs where id = $1 returning id`, [catalog])).rows.length, 0);
      assert.equal((await as(c, dono, `delete from ${S}.songs where id = $1 returning id`, [id])).rows.length, 1);
      const after = await snapshot(dono);
      assert.deepEqual(after.badges, before.badges);
      assert.deepEqual(after.days, before.days);
      assert.deepEqual(after.streaks, before.streaks);
      assert.deepEqual(after.plays, []);
      assert.deepEqual(after.records, []);
      assert.deepEqual((await as(c, dono, `select play_id from ${S}.badges_earned`)).rows.map(r => r.play_id), ownPlay.badges.map(() => null));
      assert.deepEqual(await snapshot(outro), otherBefore);
      assert.deepEqual((await as(c, outro, `select badge_id from ${S}.badges_earned where user_id = $1`, [dono])).rows, []);
      assert.equal((await c.query(`select count(*)::int as n from ${S}.songs where id = $1`, [catalog])).rows[0].n, 1);
    });

    it('regravar do editor troca os charts sem gastar vaga; música alheia, importada ou inexistente não se regrava', async () => {
      const dono = await newUser(c);
      const editor = { origin: 'editor', source: { format: 'song', file_name: 'editor.json', content: '{}' } };
      const { id } = await importSong(dono, { ...editor, levels: ['easy', 'hard'] });
      const r = await importSong(dono, { ...editor, id, replace: true, levels: ['medium'], title: 'Nova' });
      assert.deepEqual([r.id, r.title, r.levels], [id, 'Nova', ['medium']]);
      assert.equal((await c.query(`select count(*)::int as n from ${S}.songs where owner_id = $1`, [dono])).rows[0].n, 1);
      await notFound(importSong(await newUser(c), { ...editor, id, replace: true }));
      const imported = await importSong(dono);
      await notFound(importSong(dono, { ...editor, id: imported.id, replace: true }));
      await notFound(importSong(dono, { ...editor, id: randomUUID(), replace: true }));
    });

    it('entrada forjada é recusada: catálogo, sem chart, chart de outra música ou nível, formato de original desconhecido', async () => {
      const dono = await newUser(c);
      await invalid(importSong(dono, { origin: 'catalog' }));
      await invalid(importSong(dono, { charts: {} }));
      await invalid(importSong(randomUUID()));
      await assert.rejects(importSong(dono, { charts: { easy: chartOf('outra') } }), /song_charts_matches_row/);
      const id = randomUUID();
      await assert.rejects(importSong(dono, { id, charts: { hard: chartOf(id, 'easy') } }), /song_charts_matches_row/);
      await assert.rejects(importSong(dono, { source: { format: 'pdf', file_name: 'a.pdf', content: 'x' } }), /source_format/);
      assert.equal((await c.query(`select count(*)::int as n from ${S}.songs where owner_id = $1`, [dono])).rows[0].n, 0);
    });

    it('importada NÃO entra no ranking (nem para o dono) nem vira desafio, mas a partida conta para o recorde dele', async () => {
      const dono = await newUser(c, { anonymous: false });
      const id = randomUUID();
      await importSong(dono, { id, levels: ['easy'] });
      const play = await submit(c, dono, playOf(id));
      assert.equal(play.record.improved, true);
      for (const period of ['week', 'all']) {
        await notFound(as(c, dono, `select * from ${S}.get_ranking($1, 'easy', $2)`, [id, period]));
      }
      await notFound(as(c, dono, `select ${S}.create_challenge($1, 3)`, [play.play_id]));
    });
  });

  describe('turmas (ciclo 5)', () => {
    /** `fn` do schema chamada como o jogador `uid`, com os argumentos na ordem. */
    const rpc = (uid, fn, args = []) =>
      as(c, uid, `select ${S}.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args).then((res) => res.rows[0].r);
    const needsAccount = (promise) => assert.rejects(promise, (e) => e.code === '28000');
    const overLimit = (promise) => assert.rejects(promise, (e) => e.code === 'VHLIM');
    const duplicate = (promise) => assert.rejects(promise, (e) => e.code === '23505');
    const teacher = () => newUser(c, { anonymous: false });

    async function classOf(t, name = 'Turma da manhã') {
      return rpc(t, 'create_class', [name]);
    }

    /** Aluno cadastrado pelo professor e já entrado (o usuário de auth que a class-login cria, ligado ao aluno). */
    async function studentOf(t, classId, name = 'Ana Clara', { join = true } = {}) {
      const { student, pin } = await rpc(t, 'add_student', [classId, name]);
      let user = null;
      if (join) {
        user = await newUser(c, { anonymous: false });
        await asServer(c, `select ${S}.class_link_user($1, $2)`, [student.id, user]);
      }
      return { id: student.id, user, pin, name };
    }

    const login = (code, name, pin, ip = '10.0.0.1') =>
      asServer(c, `select ${S}.class_login_check($1, $2, $3, $4) as r`, [code, name, pin, ip]).then((res) => res.rows[0].r);

    const wrongPin = (pin) => String((Number(pin) + 1) % 10000).padStart(4, '0');
    /** As músicas das cenas de turma têm 4 notas: a partida padrão acerta as 4 (400 pontos). */
    const fullPlay = (song, overrides = {}) => playOf(song, { sequence: ['perfect', 'perfect', 'perfect', 'perfect'], ...overrides });

    describe('professor e turma', () => {
      it('anônimo, sem sessão e conta de aluno NÃO criam turma', async () => {
        await needsAccount(rpc(await newUser(c), 'create_class', ['Minha']));
        await denied(as(c, null, `select ${S}.create_class('Minha')`));
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id);
        await needsAccount(rpc(aluno.user, 'create_class', ['Turma do aluno']));
        assert.equal((await c.query(`select count(*)::int as n from ${S}.classes where teacher_id in ($1, $2)`, [t, aluno.user])).rows[0].n, 1);
      });

      it('cria a turma com código de 8 símbolos sem 0/O/1/I; outro professor NÃO vê, NÃO lista nem mexe nela', async () => {
        const t = await teacher();
        const cls = await classOf(t, '  Violino   1  ');
        assert.match(cls.code, /^[A-HJ-NP-Z2-9]{8}$/);
        assert.equal(cls.name, 'Violino 1');
        assert.deepEqual(cls.students, []);
        assert.deepEqual((await rpc(t, 'list_my_classes')).map((k) => [k.id, k.student_count]), [[cls.id, 0]]);
        const outro = await teacher();
        assert.deepEqual(await rpc(outro, 'list_my_classes'), []);
        await notFound(rpc(outro, 'get_class', [cls.id]));
        await notFound(rpc(outro, 'add_student', [cls.id, 'Intruso']));
        await notFound(rpc(outro, 'close_class', [cls.id]));
        const aluno = await studentOf(t, cls.id);
        await notFound(rpc(outro, 'reset_student_pin', [aluno.id]));
        await notFound(rpc(outro, 'set_student_active', [aluno.id, false]));
        assert.equal((await rpc(t, 'get_class', [cls.id])).closed_at, null);
      });

      it('o app NÃO lê nem escreve as tabelas da turma direto, nem o próprio professor', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id);
        for (const uid of [t, aluno.user]) {
          for (const table of ['classes', 'class_members', 'class_member_pins', 'login_throttle', 'teacher_plans']) {
            await denied(as(c, uid, `select * from ${S}.${table}`));
          }
          await denied(as(c, uid, `insert into ${S}.teacher_plans (teacher_id, plan_id) values ($1, 'pro')`, [uid]));
          await denied(as(c, uid, `update ${S}.class_members set active = true`));
        }
        // O catálogo de planos é público (a tela compara)
        assert.deepEqual((await as(c, t, `select id from ${S}.plans order by sort`)).rows.map((r) => r.id), ['free', 'pro']);
      });

      it('o PIN aparece só na resposta do cadastro: o banco guarda bcrypt, a turma NÃO mostra, ninguém lê o hash', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id, 'Bruno');
        assert.match(aluno.pin, /^\d{4}$/);
        const { rows: [{ pin_hash }] } = await c.query(`select pin_hash from ${S}.class_member_pins where member_id = $1`, [aluno.id]);
        assert.match(pin_hash, /^\$2[abxy]?\$10\$/);
        assert.ok(!pin_hash.includes(aluno.pin));
        const view = JSON.stringify(await rpc(t, 'get_class', [cls.id]));
        assert.ok(!view.includes(pin_hash) && !view.includes('pin'), 'get_class mostrou o PIN');
        assert.deepEqual((await rpc(t, 'get_class', [cls.id])).students.map((s) => [s.name, s.active, s.joined]), [['Bruno', true, true]]);
        await denied(as(c, aluno.user, `select pin_hash from ${S}.class_member_pins`));
      });

      it('nome repetido na turma (sem contar acento, maiúscula e espaço) é recusado; aluno inativo libera o nome', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const joao = await studentOf(t, cls.id, 'João Pedro');
        await duplicate(rpc(t, 'add_student', [cls.id, '  joao   PEDRO ']));
        await invalid(rpc(t, 'add_student', [cls.id, '   ']));
        await invalid(rpc(t, 'add_student', [cls.id, 'x'.repeat(41)]));
        await rpc(t, 'set_student_active', [joao.id, false]);
        const outro = await studentOf(t, cls.id, 'Joao Pedro');
        await duplicate(rpc(t, 'set_student_active', [joao.id, true]));
        // A outra turma aceita o mesmo nome
        const cls2 = await classOf(t, 'Tarde');
        await studentOf(t, cls2.id, 'João Pedro');
        assert.notEqual(outro.id, joao.id);
      });

      it('limites do plano free: 2 turmas abertas e 10 alunos ativos; encerrar libera; o pro, lido do banco, aumenta', async () => {
        const t = await teacher();
        const a = await classOf(t, 'A');
        await classOf(t, 'B');
        await overLimit(classOf(t, 'C'));
        await rpc(t, 'close_class', [a.id]);
        const c3 = await classOf(t, 'C');
        for (let i = 1; i <= 10; i++) await studentOf(t, c3.id, `Aluno ${i}`, { join: false });
        await overLimit(rpc(t, 'add_student', [c3.id, 'Aluno 11']));
        assert.deepEqual((await rpc(t, 'get_my_plan')).plan.id, 'free');
        await c.query(`insert into ${S}.teacher_plans (teacher_id, plan_id) values ($1, 'pro')`, [t]);
        await studentOf(t, c3.id, 'Aluno 11', { join: false });
        await classOf(t, 'D');
        const plan = await rpc(t, 'get_my_plan');
        assert.deepEqual([plan.plan.id, plan.plan.max_open_classes, plan.open_classes], ['pro', 20, 3]);
      });

      it('turma encerrada NÃO recebe aluno nem PIN novo; encerrar de novo mantém a data', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id);
        const closed = await rpc(t, 'close_class', [cls.id]);
        assert.ok(closed.closed_at);
        await invalid(rpc(t, 'add_student', [cls.id, 'Depois']));
        await invalid(rpc(t, 'reset_student_pin', [aluno.id]));
        assert.equal((await rpc(t, 'close_class', [cls.id])).closed_at, closed.closed_at);
      });

      it('get_my_class: o aluno vê a turma e o próprio nome; quem não é aluno ativo recebe null', async () => {
        const t = await teacher();
        const cls = await classOf(t, 'Cordas');
        const aluno = await studentOf(t, cls.id, 'Lia');
        const mine = await rpc(aluno.user, 'get_my_class');
        assert.deepEqual([mine.student_id, mine.name, mine.class_name], [aluno.id, 'Lia', 'Cordas']);
        assert.equal(await rpc(t, 'get_my_class'), null);
        assert.equal(await rpc(await newUser(c), 'get_my_class'), null);
        await rpc(t, 'set_student_active', [aluno.id, false]);
        assert.equal(await rpc(aluno.user, 'get_my_class'), null);
      });
    });

    describe('entrada do aluno (class_login_check, só a class-login)', () => {
      it('código + nome + PIN certos entram, sem ligar para acento, maiúscula, espaço ou hífen no código', async () => {
        const t = await teacher();
        const cls = await classOf(t, 'Cordas');
        const aluno = await studentOf(t, cls.id, 'João Pedro', { join: false });
        const code = `${cls.code.slice(0, 4).toLowerCase()}-${cls.code.slice(4)}`;
        const r = await login(code, ' joao  pedro ', aluno.pin);
        assert.deepEqual([r.status, r.member_id, r.user_id, r.name, r.class_name], ['ok', aluno.id, null, 'João Pedro', 'Cordas']);
      });

      it('PIN errado, nome desconhecido, código desconhecido e aluno inativo dão a mesma resposta neutra', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id, 'Rita', { join: false });
        const inativo = await studentOf(t, cls.id, 'Caio', { join: false });
        await rpc(t, 'set_student_active', [inativo.id, false]);
        const answers = [
          await login(cls.code, 'Rita', wrongPin(aluno.pin)),
          await login(cls.code, 'Ninguém', aluno.pin),
          await login('ZZZZZZZZ', 'Rita', aluno.pin),
          await login(cls.code, 'Caio', inativo.pin),
          await login(cls.code, 'Rita', 'abcd'),
          await login(cls.code, 'Rita', null),
        ];
        for (const a of answers) assert.deepEqual(a, { status: 'invalid' });
      });

      it('5 PINs errados bloqueiam o aluno (até o certo), sem bloquear o colega; o PIN novo do professor desbloqueia', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id, 'Rita', { join: false });
        const colega = await studentOf(t, cls.id, 'Davi', { join: false });
        for (let i = 0; i < 5; i++) assert.equal((await login(cls.code, 'Rita', wrongPin(aluno.pin))).status, 'invalid');
        assert.deepEqual(await login(cls.code, 'Rita', aluno.pin), { status: 'locked' });
        assert.equal((await login(cls.code, 'Davi', colega.pin)).status, 'ok');
        const { pin } = await rpc(t, 'reset_student_pin', [aluno.id]);
        assert.match(pin, /^\d{4}$/);
        if (pin !== aluno.pin) assert.equal((await login(cls.code, 'Rita', aluno.pin)).status, 'invalid');
        assert.equal((await login(cls.code, 'Rita', pin)).status, 'ok');
      });

      it('nome que NÃO existe bloqueia igual ao que existe: o bloqueio não revela quem está na turma', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        for (let i = 0; i < 5; i++) assert.equal((await login(cls.code, 'Fantasma', '0000')).status, 'invalid');
        assert.deepEqual(await login(cls.code, 'Fantasma', '0000'), { status: 'locked' });
      });

      it('100 erros do mesmo IP bloqueiam o IP para qualquer aluno (99 ainda não: escola atrás de NAT); outro IP segue entrando', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id, 'Rita', { join: false });
        const colega = await studentOf(t, cls.id, 'Davi', { join: false });
        for (let i = 0; i < 99; i++) await login(cls.code, `Chute ${i}`, '0000', '10.9.9.9');
        assert.equal((await login(cls.code, 'Davi', colega.pin, '10.9.9.9')).status, 'ok');
        await login(cls.code, 'Chute 99', '0000', '10.9.9.9');
        assert.deepEqual(await login(cls.code, 'Rita', aluno.pin, '10.9.9.9'), { status: 'locked' });
        assert.equal((await login(cls.code, 'Rita', aluno.pin, '10.8.8.8')).status, 'ok');
      });

      it('o bloqueio acaba sozinho depois de 15 minutos', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id, 'Rita', { join: false });
        for (let i = 0; i < 5; i++) await login(cls.code, 'Rita', wrongPin(aluno.pin));
        assert.equal((await login(cls.code, 'Rita', aluno.pin)).status, 'locked');
        await c.query(`update ${S}.login_throttle set locked_until = now() - interval '1 second' where locked_until > now()`);
        assert.equal((await login(cls.code, 'Rita', aluno.pin)).status, 'ok');
      });

      it('3 bloqueios seguidos NÃO acabam sozinhos: só o PIN novo do professor desbloqueia', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id, 'Rita', { join: false });
        const expire = () => c.query(`update ${S}.login_throttle set locked_until = now() - interval '1 second' where locked_until > now() and locked_until <> 'infinity'`);
        for (let round = 1; round <= 3; round++) {
          for (let i = 0; i < 5; i++) await login(cls.code, 'Rita', wrongPin(aluno.pin));
          assert.equal((await login(cls.code, 'Rita', aluno.pin)).status, 'locked', `bloqueio ${round}`);
          await expire();
        }
        assert.equal((await login(cls.code, 'Rita', aluno.pin)).status, 'locked', 'o terceiro bloqueio não vence');
        // O mesmo vale para nome que não existe: o bloqueio não revela quem está na turma
        for (let round = 1; round <= 3; round++) {
          for (let i = 0; i < 5; i++) await login(cls.code, 'Fantasma', '0000');
          await expire();
        }
        assert.equal((await login(cls.code, 'Fantasma', '0000')).status, 'locked');
        const { pin } = await rpc(t, 'reset_student_pin', [aluno.id]);
        assert.equal((await login(cls.code, 'Rita', pin)).status, 'ok');
      });

      it('aluno cadastrado ou trazido de volta NÃO nasce com o bloqueio que o nome acumulou antes', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const lockForever = async (name) => {
          for (let round = 0; round < 3; round++) {
            for (let i = 0; i < 5; i++) await login(cls.code, name, '0000');
            await c.query(`update ${S}.login_throttle set locked_until = now() - interval '1 second' where locked_until > now() and locked_until <> 'infinity'`);
          }
          assert.equal((await login(cls.code, name, '0000')).status, 'locked');
        };
        await lockForever('Pedro');
        const pedro = await studentOf(t, cls.id, 'pedro', { join: false });
        assert.equal((await login(cls.code, 'Pedro', pedro.pin)).status, 'ok');
        const caio = await studentOf(t, cls.id, 'Caio', { join: false });
        await rpc(t, 'set_student_active', [caio.id, false]);
        await lockForever('Caio');
        await rpc(t, 'set_student_active', [caio.id, true]);
        assert.equal((await login(cls.code, 'Caio', caio.pin)).status, 'ok');
      });

      it('um dia sem bloqueio zera a sequência', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id, 'Rita', { join: false });
        for (let round = 1; round <= 3; round++) {
          for (let i = 0; i < 5; i++) await login(cls.code, 'Rita', wrongPin(aluno.pin));
          await c.query(`update ${S}.login_throttle set locked_until = now() - interval '25 hours', window_started_at = now() - interval '25 hours' where locked_until > now()`);
        }
        assert.equal((await login(cls.code, 'Rita', aluno.pin)).status, 'ok');
      });

      it('turma encerrada: credencial certa ouve "closed"; errada continua neutra', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id, 'Rita', { join: false });
        await rpc(t, 'close_class', [cls.id]);
        assert.deepEqual(await login(cls.code, 'Rita', aluno.pin), { status: 'closed' });
        assert.deepEqual(await login(cls.code, 'Rita', wrongPin(aluno.pin)), { status: 'invalid' });
      });

      it('class_link_user liga um usuário só: a segunda primeira entrada recebe o da primeira', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id, 'Rita', { join: false });
        const u1 = await newUser(c, { anonymous: false });
        const u2 = await newUser(c, { anonymous: false });
        const first = await asServer(c, `select ${S}.class_link_user($1, $2) as r`, [aluno.id, u1]);
        const second = await asServer(c, `select ${S}.class_link_user($1, $2) as r`, [aluno.id, u2]);
        assert.deepEqual([first.rows[0].r, second.rows[0].r], [u1, u1]);
        assert.equal((await login(cls.code, 'Rita', aluno.pin)).user_id, u1);
      });

      it('primeira entrada que caiu antes de ligar: class_link_existing acha o usuário pelo e-mail sintético', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id, 'Rita', { join: false });
        const link = () => asServer(c, `select ${S}.class_link_existing($1) as r`, [aluno.id]).then((res) => res.rows[0].r);
        await notFound(link());
        const orphan = randomUUID();
        await c.query(`insert into auth.users (id, instance_id, aud, role, email, is_anonymous) values ($1, $2, 'authenticated', 'authenticated', $3, false)`,
          [orphan, ZERO, `aluno-${aluno.id}@alunos.violinhero.invalid`]);
        assert.equal(await link(), orphan);
        assert.equal((await login(cls.code, 'Rita', aluno.pin)).user_id, orphan);
        await denied(as(c, t, `select ${S}.class_link_existing($1)`, [aluno.id]));
      });

      it('o app NÃO chama a conferência nem a ligação, nem com sessão', async () => {
        const u = await newUser(c, { anonymous: false });
        await denied(as(c, u, `select ${S}.class_login_check('AAAAAAAA', 'x', '0000', '1.1.1.1')`));
        await denied(as(c, u, `select ${S}.class_link_user($1, $1)`, [u]));
        await denied(as(c, null, `select ${S}.class_login_check('AAAAAAAA', 'x', '0000', '1.1.1.1')`));
      });
    });

    describe('aluno fora do ranking e do desafio (0018)', () => {
      it('o nome cadastrado NÃO aparece no perfil; a conta de aluno NÃO entra no ranking, nem para ela mesma', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id, 'Maria Secreta');
        const song = await serverSong(c, { notes: 4 });
        await submit(c, aluno.user, fullPlay(song));
        const outro = await newUser(c, { anonymous: false });
        await submit(c, outro, fullPlay(song, { sequence: ['perfect', 'miss', 'miss', 'miss'] }));
        const profile = await as(c, aluno.user, `select * from ${S}.profiles`);
        assert.ok(!/Maria|Secreta/.test(JSON.stringify(profile.rows)), 'o nome do aluno vazou no perfil');
        await assertOffRanking(aluno.user, song, outro);
      });

      /** Nenhuma linha do get_ranking é do aluno: nem pelo nome cadastrado, nem pelo nome gerado, nem para ele mesmo. */
      async function assertOffRanking(student, song, viewer) {
        const generated = await c.query(`select ${S}.ranking_name(animal, nickname_tag) as name from ${S}.profiles where id = $1`, [student]);
        const rankingName = generated.rows[0].name;
        assert.match(rankingName, /\S/);
        for (const period of ['all', 'week']) {
          const ranking = await as(c, viewer, `select * from ${S}.get_ranking($1, 'easy', $2)`, [song, period]);
          assert.ok(ranking.rows.some((r) => r.is_me), `o ranking (${period}) não mostrou nem quem pediu`);
          assert.ok(!/Maria|Secreta/.test(JSON.stringify(ranking.rows)), `o nome do aluno vazou no ranking (${period})`);
          assert.ok(ranking.rows.every((r) => r.ranking_name !== rankingName), `o aluno apareceu no ranking (${period})`);
          const mine = await as(c, student, `select * from ${S}.get_ranking($1, 'easy', $2)`, [song, period]);
          assert.ok(mine.rows.every((r) => !r.is_me), `o aluno se viu no ranking (${period})`);
        }
      }

      it('aluno tirado da turma (inativo) segue fora do ranking', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id);
        await rpc(t, 'set_student_active', [aluno.id, false]);
        const song = await serverSong(c, { notes: 4 });
        await submit(c, aluno.user, fullPlay(song));
        const outro = await newUser(c, { anonymous: false });
        await submit(c, outro, fullPlay(song, { sequence: ['perfect', 'miss', 'miss', 'miss'] }));
        await assertOffRanking(aluno.user, song, outro);
      });

      it('aluno NÃO cria nem aceita desafio (28000); conta com e-mail segue criando', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const aluno = await studentOf(t, cls.id);
        const song = await serverSong(c, { notes: 4 });
        const own = await submit(c, aluno.user, fullPlay(song));
        await needsAccount(rpc(aluno.user, 'create_challenge', [own.play_id, 2]));
        const outro = await newUser(c, { anonymous: false });
        const theirs = await submit(c, outro, fullPlay(song));
        const challenge = await rpc(outro, 'create_challenge', [theirs.play_id, 2]);
        await needsAccount(rpc(aluno.user, 'accept_challenge', [challenge.code]));
      });
    });

    describe('tarefas e entregas', () => {
      const due = (days = 7) => new Date(Date.now() + days * 86400e3).toISOString();
      const assign = (t, classId, song, { level = 'easy', mode = 'arcade', days = 7, key = 'tocar-inteira', text = null } = {}) =>
        rpc(t, 'create_assignment', [classId, song, level, mode, due(days), key, text]);
      const submitTask = (uid, assignmentId, playId = null, audio = null) => rpc(uid, 'submit_assignment', [assignmentId, playId, audio]);
      const audioOf = (classId, memberId, assignmentId, file = 'take.webm') => `${classId}/${memberId}/${assignmentId}/${file}`;

      /** Professor com turma, dois alunos entrados, uma música do catálogo (4 notas, fácil e difícil) e uma tarefa. */
      async function scene() {
        const t = await teacher();
        const cls = await classOf(t);
        const ana = await studentOf(t, cls.id, 'Ana');
        const bia = await studentOf(t, cls.id, 'Bia');
        const song = await serverSong(c, { notes: 4, levels: ['easy', 'hard'] });
        const task = await assign(t, cls.id, song);
        return { t, cls, ana, bia, song, task };
      }

      it('criar tarefa: só na turma do professor, música do catálogo com o nível, sem prática, prazo de até 60 dias', async () => {
        const { t, cls, song, task } = await scene();
        assert.deepEqual([task.song_id, task.level, task.mode, task.instruction_key, task.closed], [song, 'easy', 'arcade', 'tocar-inteira', false]);
        assert.equal(task.students.length, 2);
        await notFound(assign(await teacher(), cls.id, song));
        await notFound(assign(t, cls.id, await serverSong(c, { owner: t })));
        await notFound(assign(t, cls.id, song, { level: 'medium' }));
        await invalid(assign(t, cls.id, song, { mode: 'practice' }));
        await invalid(assign(t, cls.id, song, { days: -1 }));
        await invalid(assign(t, cls.id, song, { days: 61 }));
        await invalid(assign(t, cls.id, song, { key: 'invente' }));
        await invalid(assign(t, cls.id, song, { key: null, text: 'x'.repeat(141) }));
        const own = await assign(t, cls.id, song, { key: null, text: '  Toque   duas vezes ' });
        assert.equal(own.instruction_text, 'Toque duas vezes');
      });

      it('professor de outra turma NÃO vê tarefas, alunos nem entregas; aluno de outra turma NÃO vê a tarefa', async () => {
        const { t, cls, ana, song, task } = await scene();
        await submit(c, ana.user, fullPlay(song));
        await submitTask(ana.user, task.id);
        const outro = await teacher();
        await notFound(rpc(outro, 'get_assignment', [task.id]));
        await notFound(rpc(outro, 'list_class_assignments', [cls.id]));
        const fora = await studentOf(outro, (await classOf(outro)).id, 'Zeca');
        assert.deepEqual(await rpc(fora.user, 'get_my_assignments'), []);
        await notFound(submitTask(fora.user, task.id));
        for (const uid of [outro, fora.user, ana.user, t]) {
          for (const table of ['assignments', 'submissions', 'reviews']) await denied(as(c, uid, `select * from ${S}.${table}`));
        }
      });

      it('conta só a partida terminada da música, nível e modo certos, jogada depois da tarefa e chegada até o prazo', async () => {
        const { t, cls, ana, song } = await scene();
        // Antes da tarefa: a partida chegou e a tarefa nasceu depois
        await submit(c, ana.user, fullPlay(song, { sequence: ['perfect', 'perfect', 'perfect', 'perfect'] }));
        const later = await assign(t, cls.id, song);
        await c.query(`update ${S}.assignments set created_at = now() + interval '1 second' where id = $1`, [later.id]);
        assert.equal((await rpc(ana.user, 'get_my_assignments')).find((a) => a.id === later.id).best, null);
        // Nível, modo e partida não terminada errados não contam; a certa conta
        const task = await assign(t, cls.id, song);
        await submit(c, ana.user, fullPlay(song, { level: 'hard' }));
        await submit(c, ana.user, fullPlay(song, { mode: 'sheet' }));
        await submit(c, ana.user, fullPlay(song, { finished: false }));
        assert.equal((await rpc(t, 'get_assignment', [task.id])).students.find((s) => s.student_id === ana.id).best?.score ?? null, 400);
        // Prazo vencido antes de a partida chegar: não conta
        const late = await assign(t, cls.id, song);
        await c.query(`update ${S}.assignments set created_at = now() - interval '2 days', due_at = now() - interval '1 day' where id = $1`, [late.id]);
        assert.equal((await rpc(t, 'get_assignment', [late.id])).students.find((s) => s.student_id === ana.id).best, null);
        await invalid(submitTask(ana.user, late.id));
      });

      it('entrega: o servidor escolhe a melhor partida; partida e áudio de outro aluno são recusados', async () => {
        const { cls, ana, bia, song, task } = await scene();
        await invalid(submitTask(ana.user, task.id));
        const fraca = await submit(c, ana.user, fullPlay(song, { sequence: ['perfect', 'miss', 'miss', 'miss'] }));
        const forte = await submit(c, ana.user, fullPlay(song, { sequence: ['perfect', 'perfect', 'perfect', 'miss'] }));
        const daBia = await submit(c, bia.user, fullPlay(song));
        const auto = await submitTask(ana.user, task.id);
        assert.equal(auto.submission.play_id, forte.play_id);
        await invalid(submitTask(ana.user, task.id, daBia.play_id));
        await invalid(submitTask(ana.user, task.id, fraca.play_id, audioOf(cls.id, bia.id, task.id)));
        await invalid(submitTask(ana.user, task.id, fraca.play_id, audioOf(cls.id, ana.id, randomUUID())));
        await invalid(submitTask(ana.user, task.id, fraca.play_id, `${audioOf(cls.id, ana.id, task.id)}/../x.webm`));
        const chosen = await submitTask(ana.user, task.id, fraca.play_id, audioOf(cls.id, ana.id, task.id));
        assert.deepEqual([chosen.submission.play_id, chosen.submission.audio_path], [fraca.play_id, audioOf(cls.id, ana.id, task.id)]);
      });

      it('aluno NÃO vê a entrega, a partida nem a revisão do colega; o professor vê a turma inteira', async () => {
        const { t, ana, bia, song, task } = await scene();
        await submit(c, ana.user, fullPlay(song));
        const sub = await submitTask(ana.user, task.id);
        await rpc(t, 'review_submission', [sub.submission.id, 5, null, 'Muito bem']);
        const daBia = (await rpc(bia.user, 'get_my_assignments')).find((a) => a.id === task.id);
        assert.deepEqual([daBia.best, daBia.submission, daBia.review], [null, null, null]);
        assert.ok(!JSON.stringify(await rpc(bia.user, 'get_my_assignments')).includes('Ana'));
        const view = await rpc(t, 'get_assignment', [task.id]);
        assert.deepEqual(view.students.map((s) => [s.name, s.submission !== null, s.review?.grade ?? null]), [['Ana', true, 5], ['Bia', false, null]]);
        const daAna = (await rpc(ana.user, 'get_my_assignments')).find((a) => a.id === task.id);
        assert.deepEqual([daAna.review.grade, daAna.review.comment], [5, 'Muito bem']);
      });

      it('revisão: só o professor da turma, nota 1–5 OU conceito; depois dela a entrega NÃO muda', async () => {
        const { t, ana, song, task } = await scene();
        await submit(c, ana.user, fullPlay(song));
        const sub = (await submitTask(ana.user, task.id)).submission;
        await notFound(rpc(await teacher(), 'review_submission', [sub.id, 4, null, '']));
        await needsAccount(rpc(ana.user, 'review_submission', [sub.id, 5, null, '']));
        await invalid(rpc(t, 'review_submission', [sub.id, 4, 'bom', '']));
        await invalid(rpc(t, 'review_submission', [sub.id, null, null, '']));
        await invalid(rpc(t, 'review_submission', [sub.id, 6, null, '']));
        await invalid(rpc(t, 'review_submission', [sub.id, null, 'genial', '']));
        await invalid(rpc(t, 'review_submission', [sub.id, null, 'bom', 'x'.repeat(281)]));
        const review = await rpc(t, 'review_submission', [sub.id, null, 'precisa-praticar', 'Capriche no arco']);
        assert.deepEqual([review.grade, review.concept], [null, 'precisa-praticar']);
        await invalid(submitTask(ana.user, task.id));
        const list = await rpc(t, 'list_class_assignments', [task.class_id]);
        assert.deepEqual(list.map((a) => [a.student_count, a.submitted_count, a.reviewed_count]), [[2, 1, 1]]);
      });

      it('revisão traz afinação e duração da partida e do áudio; outro professor e o colega NÃO leem', async () => {
        const { t, cls, ana, bia, song, task } = await scene();
        await submit(c, ana.user, fullPlay(song, { mean_abs_cents: 11.5, string_cents: [-4, 6.5, null, 12], duration_ms: 4500 }));
        const path = audioOf(cls.id, ana.id, task.id);
        const own = await rpc(ana.user, 'submit_assignment', [task.id, null, path, 4321]);
        const pick = (s) => [s.mean_abs_cents, s.string_cents, s.duration_ms];
        assert.deepEqual(pick(own.best), [11.5, [-4, 6.5, null, 12], 4500]);
        const row = (await rpc(t, 'get_assignment', [task.id])).students.find((s) => s.student_id === ana.id);
        assert.deepEqual([...pick(row.submission), row.submission.audio_duration_ms], [11.5, [-4, 6.5, null, 12], 4500, 4321]);
        // Três argumentos (quem chamava antes da 0017) seguem valendo; sem áudio, a duração não fica
        await submit(c, bia.user, fullPlay(song));
        const semAudio = await submitTask(bia.user, task.id, null, null);
        assert.equal(semAudio.submission.audio_duration_ms, null);
        assert.equal((await rpc(bia.user, 'submit_assignment', [task.id, null, null, 999])).submission.audio_duration_ms, null);
        await invalid(rpc(ana.user, 'submit_assignment', [task.id, null, path, -1]));
        const outro = await teacher();
        await notFound(rpc(outro, 'get_assignment', [task.id]));
        await notFound(rpc(outro, 'get_student_progress', [ana.id]));
        const daBia = JSON.stringify(await rpc(bia.user, 'get_my_assignments'));
        assert.ok(!daBia.includes('4321') && !daBia.includes('11.5'), `a afinação da Ana vazou para a Bia: ${daBia}`);
      });

      it('aluno tirado da turma NÃO vê mais as tarefas nem entrega; turma encerrada NÃO recebe entrega', async () => {
        const { t, cls, ana, bia, song, task } = await scene();
        await submit(c, ana.user, fullPlay(song));
        await submit(c, bia.user, fullPlay(song));
        await rpc(t, 'set_student_active', [ana.id, false]);
        assert.deepEqual(await rpc(ana.user, 'get_my_assignments'), []);
        await notFound(submitTask(ana.user, task.id));
        assert.deepEqual((await rpc(t, 'get_assignment', [task.id])).students.map((s) => s.name), ['Bia']);
        await rpc(t, 'close_class', [cls.id]);
        await invalid(submitTask(bia.user, task.id));
      });
    });

    describe('responsável', () => {
      const invite = (t, memberId) => rpc(t, 'create_guardian_invite', [memberId]);
      const accept = (uid, code) => rpc(uid, 'accept_guardian_invite', [code]);
      const guardian = () => newUser(c, { anonymous: false });

      async function family() {
        const t = await teacher();
        const cls = await classOf(t, 'Cordas');
        const ana = await studentOf(t, cls.id, 'Ana');
        const bia = await studentOf(t, cls.id, 'Bia');
        const mae = await guardian();
        const { code } = await invite(t, ana.id);
        await accept(mae, code);
        return { t, cls, ana, bia, mae };
      }

      it('o convite liga o responsável ao filho; o mesmo convite NÃO serve para outra pessoa; vencido também não', async () => {
        const t = await teacher();
        const cls = await classOf(t, 'Cordas');
        const ana = await studentOf(t, cls.id, 'Ana');
        const inv = await invite(t, ana.id);
        assert.match(inv.code, /^[A-HJ-NP-Z2-9]{10}$/);
        assert.equal((await invite(t, ana.id)).code, inv.code);
        await notFound(invite(await teacher(), ana.id));
        const mae = await guardian();
        const child = await accept(mae, inv.code.toLowerCase());
        assert.deepEqual([child.student_id, child.name, child.class_name], [ana.id, 'Ana', 'Cordas']);
        assert.deepEqual((await accept(mae, inv.code)).student_id, ana.id);
        await notFound(accept(await guardian(), inv.code));
        const novo = await invite(t, ana.id);
        assert.notEqual(novo.code, inv.code);
        await c.query(`update ${S}.guardian_invites set expires_at = now() - interval '1 second', created_at = now() - interval '8 days' where code = $1`, [novo.code]);
        await notFound(accept(await guardian(), novo.code));
        await notFound(accept(await guardian(), 'AAAAAAAAAA'));
        assert.deepEqual((await rpc(mae, 'list_my_children')).map((k) => k.name), ['Ana']);
      });

      it('anônimo e conta de aluno NÃO viram responsáveis', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const ana = await studentOf(t, cls.id, 'Ana');
        const bia = await studentOf(t, cls.id, 'Bia');
        const { code } = await invite(t, ana.id);
        await needsAccount(accept(await newUser(c), code));
        await needsAccount(accept(bia.user, code));
        await needsAccount(accept(ana.user, code));
      });

      it('responsável vê só o próprio filho: NÃO vê o colega nem é visto por outro responsável', async () => {
        const { t, ana, bia, mae } = await family();
        const song = await serverSong(c, { notes: 4 });
        await submit(c, ana.user, fullPlay(song));
        await submit(c, bia.user, fullPlay(song));
        const progress = await rpc(mae, 'get_student_progress', [ana.id]);
        assert.equal(progress.student.name, 'Ana');
        assert.equal(progress.records.length, 1);
        assert.equal(progress.recent_plays.length, 1);
        assert.equal(progress.streak.current_days, 1);
        await notFound(rpc(mae, 'get_student_progress', [bia.id]));
        await notFound(rpc(await guardian(), 'get_student_progress', [ana.id]));
        await notFound(rpc(await teacher(), 'get_student_progress', [ana.id]));
        await notFound(rpc(bia.user, 'get_student_progress', [ana.id]));
        assert.deepEqual(await rpc(await guardian(), 'list_my_children'), []);
        assert.equal((await rpc(t, 'get_student_progress', [bia.id])).student.name, 'Bia');
        for (const table of ['guardian_invites', 'guardian_links']) await denied(as(c, mae, `select * from ${S}.${table}`));
      });

      it('progresso NÃO mostra as músicas próprias do aluno; tarefas, entrega e revisão do filho aparecem', async () => {
        const { t, cls, ana, mae } = await family();
        const own = await serverSong(c, { owner: ana.user, notes: 4 });
        await submit(c, ana.user, fullPlay(own));
        const song = await serverSong(c, { notes: 4 });
        const task = await rpc(t, 'create_assignment', [cls.id, song, 'easy', 'arcade', new Date(Date.now() + 86400e3).toISOString(), 'tocar-inteira', null]);
        await submit(c, ana.user, fullPlay(song));
        const sub = await rpc(ana.user, 'submit_assignment', [task.id, null, null]);
        await rpc(t, 'review_submission', [sub.submission.id, 4, null, 'Boa']);
        const progress = await rpc(mae, 'get_student_progress', [ana.id]);
        assert.deepEqual(progress.records.map((r) => r.song_id), [song]);
        assert.deepEqual(progress.recent_plays.map((p) => p.song_id), [song]);
        assert.ok(!JSON.stringify(progress).includes(own));
        assert.deepEqual(progress.assignments.map((a) => [a.id, a.review?.grade]), [[task.id, 4]]);
      });

      it('aluno tirado da turma some para o responsável; limite de 4 responsáveis por aluno', async () => {
        const { t, ana, mae } = await family();
        for (let i = 0; i < 3; i++) await accept(await guardian(), (await invite(t, ana.id)).code);
        await overLimit(accept(await guardian(), (await invite(t, ana.id)).code));
        await rpc(t, 'set_student_active', [ana.id, false]);
        assert.deepEqual(await rpc(mae, 'list_my_children'), []);
        await notFound(rpc(mae, 'get_student_progress', [ana.id]));
        await invalid(invite(t, ana.id));
      });
    });

    describe('áudio das entregas (funções das policies do Storage)', () => {
      const canRead = (uid, path) => as(c, uid, `select ${S}.can_read_submission_audio($1) as r`, [path]).then((res) => res.rows[0].r);
      const canUpload = (uid, path) => as(c, uid, `select ${S}.can_upload_submission_audio($1) as r`, [path]).then((res) => res.rows[0].r);

      async function scene() {
        const t = await teacher();
        const cls = await classOf(t);
        const ana = await studentOf(t, cls.id, 'Ana');
        const bia = await studentOf(t, cls.id, 'Bia');
        const mae = await newUser(c, { anonymous: false });
        await rpc(mae, 'accept_guardian_invite', [(await rpc(t, 'create_guardian_invite', [ana.id])).code]);
        const song = await serverSong(c, { notes: 4 });
        const task = await rpc(t, 'create_assignment', [cls.id, song, 'easy', 'arcade', new Date(Date.now() + 86400e3).toISOString(), null, null]);
        return { t, cls, ana, bia, mae, song, task, path: `${cls.id}/${ana.id}/${task.id}/take-1.webm` };
      }

      it('ouvem: o aluno, o professor da turma e o responsável; NÃO ouvem: colega, outro professor, outro responsável, anônimo', async () => {
        const { t, ana, bia, mae, path } = await scene();
        for (const uid of [ana.user, t, mae]) assert.equal(await canRead(uid, path), true);
        const outroResp = await newUser(c, { anonymous: false });
        for (const uid of [bia.user, await teacher(), outroResp, await newUser(c)]) assert.equal(await canRead(uid, path), false);
        await denied(as(c, null, `select ${S}.can_read_submission_audio($1)`, [path]));
      });

      it('caminho torto NÃO abre nada: aluno trocado de turma, tarefa de outra turma, extensão ou pasta a mais', async () => {
        const { t, cls, ana, task } = await scene();
        const other = await classOf(t, 'Outra');
        const otherTask = await rpc(t, 'create_assignment', [other.id, task.song_id, 'easy', 'arcade', new Date(Date.now() + 86400e3).toISOString(), null, null]);
        for (const bad of [
          `${other.id}/${ana.id}/${task.id}/a.webm`,
          `${cls.id}/${ana.id}/${otherTask.id}/a.webm`,
          `${cls.id}/${ana.id}/${task.id}/a.exe`,
          `${cls.id}/${ana.id}/${task.id}/x/a.webm`,
          `${cls.id}/${ana.id}/${task.id}/../a.webm`,
          'qualquer.webm',
        ]) {
          assert.equal(await canRead(t, bad), false, bad);
          assert.equal(await canUpload(ana.user, bad), false, bad);
        }
      });

      it('sobe só o próprio aluno ativo, em turma aberta, antes da revisão', async () => {
        const { t, cls, ana, bia, mae, song, task, path } = await scene();
        assert.equal(await canUpload(ana.user, path), true);
        for (const uid of [bia.user, t, mae, await newUser(c)]) assert.equal(await canUpload(uid, path), false);
        await submit(c, ana.user, fullPlay(song));
        const sub = await rpc(ana.user, 'submit_assignment', [task.id, null, path]);
        await rpc(t, 'review_submission', [sub.submission.id, 5, null, '']);
        assert.equal(await canUpload(ana.user, path), false);
        const biaPath = `${cls.id}/${bia.id}/${task.id}/take.webm`;
        assert.equal(await canUpload(bia.user, biaPath), true);
        await rpc(t, 'set_student_active', [bia.id, false]);
        assert.equal(await canUpload(bia.user, biaPath), false);
        assert.equal(await canRead(bia.user, biaPath), true, 'o aluno inativo ainda ouve o que é dele');
        await rpc(t, 'close_class', [cls.id]);
        assert.equal(await canRead(ana.user, path), true);
      });

      it('no Storage, o bucket submissions é privado, com 10 MB e áudio, e as policies chamam essas funções', async (t) => {
        const { rows: [{ ok }] } = await c.query(`select to_regclass('storage.objects') is not null as ok`);
        if (!ok) {
          // O Supabase local desta máquina roda sem Storage; a CI liga e roda este teste
          if (process.env.CI) throw new Error('Storage desligado na CI: as policies do áudio não foram testadas.');
          t.skip('Storage desligado no Supabase local');
          return;
        }
        const { rows: [bucket] } = await c.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'submissions'`);
        assert.deepEqual([bucket.public, Number(bucket.file_size_limit), [...bucket.allowed_mime_types].sort()],
          [false, 10 * 1024 * 1024, ['audio/mp4', 'audio/ogg', 'audio/webm']]);
        const { rows } = await c.query(
          `select policyname, cmd, roles::text[] as roles, coalesce(qual, with_check) as rule from pg_policies
            where schemaname = 'storage' and tablename = 'objects' and policyname like 'violinhero_submissions_%' order by 1`);
        assert.deepEqual(rows.map((r) => [r.policyname, r.cmd, r.roles]), [
          ['violinhero_submissions_insert', 'INSERT', ['authenticated']],
          ['violinhero_submissions_select', 'SELECT', ['authenticated']],
        ]);
        assert.match(rows[0].rule, /can_upload_submission_audio/);
        assert.match(rows[1].rule, /can_read_submission_audio/);
      });
    });

    describe('retenção do áudio', () => {
      const toPurge = () => asServer(c, `select path from ${S}.audio_to_purge(1000)`).then((res) => res.rows.map((r) => r.path));

      it('o áudio revisado há mais de 30 dias e o trocado entram na limpeza; o recente e o sem revisão NÃO', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const ana = await studentOf(t, cls.id, 'Ana');
        const bia = await studentOf(t, cls.id, 'Bia');
        const song = await serverSong(c, { notes: 4 });
        const task = await rpc(t, 'create_assignment', [cls.id, song, 'easy', 'arcade', new Date(Date.now() + 86400e3).toISOString(), null, null]);
        await submit(c, ana.user, fullPlay(song));
        await submit(c, bia.user, fullPlay(song));
        const p = (m, f) => `${cls.id}/${m.id}/${task.id}/${f}.webm`;
        await rpc(ana.user, 'submit_assignment', [task.id, null, p(ana, 'velho')]);
        const sub = await rpc(ana.user, 'submit_assignment', [task.id, null, p(ana, 'novo')]);
        await rpc(bia.user, 'submit_assignment', [task.id, null, p(bia, 'sem-revisao')]);
        await rpc(t, 'review_submission', [sub.submission.id, 5, null, '']);
        assert.deepEqual(await toPurge(), [p(ana, 'velho')]);
        await c.query(`update ${S}.reviews set reviewed_at = now() - interval '30 days 1 second' where submission_id = $1`, [sub.submission.id]);
        assert.deepEqual((await toPurge()).sort(), [p(ana, 'novo'), p(ana, 'velho')].sort());

        const { rows: [{ n }] } = await asServer(c, `select ${S}.audio_purged($1) as n`, [[p(ana, 'novo'), p(ana, 'velho')]]);
        assert.equal(n, 2);
        assert.deepEqual(await toPurge(), []);
        const mine = (await rpc(ana.user, 'get_my_assignments')).find((a) => a.id === task.id);
        assert.deepEqual([mine.submission.audio_path, mine.submission.audio_deleted, mine.review.grade], [null, true, 5]);
        const daBia = (await rpc(t, 'get_assignment', [task.id])).students.find((s) => s.name === 'Bia');
        assert.equal(daBia.submission.audio_path, p(bia, 'sem-revisao'));
      });

      it('entrega nunca revisada sai 30 dias depois do prazo da tarefa, também de aluno inativo e turma encerrada', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const ana = await studentOf(t, cls.id, 'Ana');
        const bia = await studentOf(t, cls.id, 'Bia');
        const song = await serverSong(c, { notes: 4 });
        const task = await rpc(t, 'create_assignment', [cls.id, song, 'easy', 'arcade', new Date(Date.now() + 86400e3).toISOString(), null, null]);
        await submit(c, ana.user, fullPlay(song));
        await submit(c, bia.user, fullPlay(song));
        const p = (m) => `${cls.id}/${m.id}/${task.id}/take.webm`;
        await rpc(ana.user, 'submit_assignment', [task.id, null, p(ana)]);
        await rpc(bia.user, 'submit_assignment', [task.id, null, p(bia)]);
        await rpc(t, 'set_student_active', [bia.id, false]);
        await rpc(t, 'close_class', [cls.id]);
        const dueAgo = (interval) => c.query(
          `update ${S}.assignments set created_at = now() - interval '40 days', due_at = now() - $2::interval where id = $1`, [task.id, interval]);
        await dueAgo('29 days');
        assert.deepEqual(await toPurge(), []);
        await dueAgo('30 days 1 second');
        assert.deepEqual((await toPurge()).sort(), [p(ana), p(bia)].sort());
      });

      it('apagar a tarefa põe o áudio das entregas na limpeza; o app NÃO chama a limpeza', async () => {
        const t = await teacher();
        const cls = await classOf(t);
        const ana = await studentOf(t, cls.id, 'Ana');
        const song = await serverSong(c, { notes: 4 });
        const task = await rpc(t, 'create_assignment', [cls.id, song, 'easy', 'arcade', new Date(Date.now() + 86400e3).toISOString(), null, null]);
        await submit(c, ana.user, fullPlay(song));
        const path = `${cls.id}/${ana.id}/${task.id}/a.webm`;
        await rpc(ana.user, 'submit_assignment', [task.id, null, path]);
        await c.query(`delete from ${S}.assignments where id = $1`, [task.id]);
        assert.deepEqual(await toPurge(), [path]);
        await denied(as(c, t, `select * from ${S}.audio_to_purge()`));
        await denied(as(c, t, `select ${S}.audio_purged(array['x'])`));
        await denied(as(c, t, `select * from ${S}.audio_trash`));
      });
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
