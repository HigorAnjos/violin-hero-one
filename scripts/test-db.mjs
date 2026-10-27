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
  'authenticated violinhero.create_challenge(uuid,integer)',
  'authenticated violinhero.ensure_my_profile()',
  'authenticated violinhero.get_challenge(text)',
  'authenticated violinhero.get_ranking(text,violinhero.chart_level,text,integer)',
  'authenticated violinhero.get_song(text,violinhero.chart_level)',
  'authenticated violinhero.list_my_challenges()',
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

    it('importada alheia, música ou nível inexistente dão o mesmo "não encontrada"; período inválido é recusado', async () => {
      const dono = await account();
      const u = await account('cat');
      const own = await serverSong(c, { owner: dono.id });
      await submit(c, dono.id, playOf(own));
      assert.equal((await rowsOf(dono.id, own)).length, 1);
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
      assert.equal((await c.query(`select count(*)::int as n from ${S}.challenge_entries`)).rows[0].n, 0);
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
