// Testes da Edge Function import-song contra o Supabase local (npm run db:local sobe e chama): as 5 partituras reais
// entram, o que é do jogador continua só dele, e o que não pode entrar é recusado com o código certo.
// Variáveis: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL; FUNCTION_URL opcional
// (padrão SUPABASE_URL/functions/v1/import-song; serve para apontar a função rodando no Deno da máquina).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', quiet: true });
const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;
const ready = SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY && DATABASE_URL;
// Na máquina, sem Supabase, os testes se pulam; na CI isso seria um verde falso
if (process.env.CI && !ready) throw new Error('Supabase local sem URL/chaves na CI: os testes da função não rodariam.');
const FUNCTION_URL = process.env.FUNCTION_URL || `${SUPABASE_URL}/functions/v1/import-song`;
const FIXTURES = new URL('../content/import-fixtures/', import.meta.url);
const S = 'violinhero';

const FIXTURE_FILES = [
  ['lehmann-the-yellowhammer.mxl', 'The Yellowhammer'],
  ['brahms-heimweh-1.musicxml', 'Heimweh I'],
  ['baltzar-prelude.mid', 'baltzar prelude'],
  ['soldiers-joy.mid', 'soldiers joy'],
  ['red-apple-rag.abc', 'Red Apple Rag'],
];

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = ready ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, options) : null;
const created = [];

/** Jogador anônimo novo (o login que o app faz no primeiro uso). */
async function player() {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { ...options, db: { schema: S } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  created.push(data.user.id);
  return { client, id: data.user.id, token: data.session.access_token };
}

/** POST na função; `body` FormData (arquivo) ou objeto (JSON do editor). */
async function call(token, body) {
  const headers = { apikey: SUPABASE_ANON_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method: 'POST', headers };
  if (body instanceof FormData) init.body = body;
  else {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(FUNCTION_URL, init);
  return { status: res.status, body: await res.json() };
}

const form = (name, bytes = readFileSync(new URL(name, FIXTURES)), part) => {
  const f = new FormData();
  f.append('file', new Blob([bytes]), name);
  if (part) f.append('part', part);
  return f;
};

const twoViolins = () =>
  Buffer.from(
    `<score-partwise><part-list><score-part id="P1"><part-name>Violin I</part-name></score-part>` +
      `<score-part id="P2"><part-name>Violin II</part-name></score-part></part-list>` +
      ['A5', 'D5']
        .map(
          (p, i) =>
            `<part id="P${i + 1}"><measure number="1"><attributes><divisions>1</divisions><key><fifths>2</fifths></key>` +
            `<time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>${p[0]}</step><octave>${p[1]}</octave></pitch>` +
            `<duration>4</duration></note></measure></part>`,
        )
        .join('') +
      `</score-partwise>`,
  );

describe('Edge Function import-song', { skip: !ready && 'Supabase local não configurado' }, () => {
  let db;
  before(async () => {
    db = new pg.Client({ connectionString: DATABASE_URL, ssl: false });
    await db.connect();
  });
  after(async () => {
    // apagar o usuário leva as músicas dele junto (cascade)
    for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
    await db?.end();
  });

  for (const [name, title] of FIXTURE_FILES) {
    it(`${name}: entra como música privada do dono, com os 3 níveis, e só o dono lê`, async () => {
      const dono = await player();
      const { status, body } = await call(dono.token, form(name));
      assert.equal(status, 201, JSON.stringify(body));
      assert.equal(body.status, 'created');
      const id = body.sheet.id;
      assert.equal(body.sheet.title, title);
      assert.equal(body.sheet.origin, 'imported');
      assert.deepEqual(body.levels, ['easy', 'medium', 'hard']);
      // o que o songImport.ts lê: o chart do Fácil (Song v1) e o hash dele, o mesmo de get_song
      assert.deepEqual([body.song.id, body.song.level, body.song.formatVersion], [id, 'easy', 1]);
      const mine = await dono.client.rpc('get_song', { p_song_id: id, p_level: 'easy' });
      assert.equal(mine.data.length, 1);
      assert.equal(body.hash, mine.data[0].hash);
      assert.deepEqual(mine.data[0].chart, body.song);

      const { rows } = await db.query(`select owner_id, visibility from ${S}.songs where id = $1`, [id]);
      assert.deepEqual(rows, [{ owner_id: dono.id, visibility: 'private' }]);

      const outro = await player();
      assert.deepEqual((await outro.client.from('songs').select('id').eq('id', id)).data, []);
      assert.deepEqual((await outro.client.from('song_charts').select('level').eq('song_id', id)).data, []);
      assert.deepEqual((await outro.client.from('song_sources').select('format').eq('song_id', id)).data, []);
      assert.deepEqual((await outro.client.rpc('get_song', { p_song_id: id, p_level: 'easy' })).data, []);
    });
  }

  it('duas partes de violino: devolve a lista; a segunda chamada com a parte grava', async () => {
    const dono = await player();
    const first = await call(dono.token, form('quarteto.musicxml', twoViolins()));
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.parts.map((p) => p.name), ['Violin I', 'Violin II']);
    const second = await call(dono.token, form('quarteto.musicxml', twoViolins(), 'P2'));
    assert.equal(second.status, 201);
    assert.equal(second.body.part.id, 'P2');
  });

  it('melodia do editor ({ origin: "editor", song }, como o songImport.ts manda): volta o chart do mesmo nível e o hash', async () => {
    const dono = await player();
    // a Song como o editor salva (songToSave): nível Difícil, corda e dedo dele; o servidor refaz
    const song = {
      formatVersion: 1, id: 'rascunho', title: 'Do editor', composer: '', key: 'D major', bpm: 80,
      timeSignature: { beats: 4, unit: 4 }, level: 'hard',
      measures: [{ beats: 4, notes: [{ beat: 0, beats: 2, midi: 62, string: 1, finger: 0 }, { beat: 2, beats: 2, midi: 66, string: 1, finger: 2 }] }],
    };
    const first = await call(dono.token, { origin: 'editor', song });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const id = first.body.sheet.id;
    assert.notEqual(id, 'rascunho');
    assert.deepEqual([first.body.sheet.origin, first.body.song.id, first.body.song.level], ['editor', id, 'hard']);
    assert.deepEqual(first.body.song.measures[0].notes.map((n) => n.midi), [62, 66]);
    const mine = await dono.client.rpc('get_song', { p_song_id: id, p_level: 'hard' });
    assert.equal(first.body.hash, mine.data[0].hash);

    const again = await call(dono.token, { origin: 'editor', song: { ...song, title: 'Do editor 2' }, replace: id });
    assert.equal(again.status, 201);
    assert.deepEqual([again.body.sheet.id, again.body.sheet.title], [id, 'Do editor 2']);
    const outro = await player();
    const stolen = await call(outro.token, { origin: 'editor', song, replace: id });
    assert.equal(stolen.status, 422);
    assert.equal(stolen.body.error.code, 'invalid_song');
    const forged = await call(outro.token, { origin: 'catalog', song });
    assert.equal(forged.body.error.code, 'invalid_song');
  });

  // Com verify_jwt (padrão) o gateway barra token inválido antes da função; a chave anônima passa nele e a função barra
  it('sem login, com token falso ou só com a chave anônima: recusado', async () => {
    for (const token of [null, 'forjado', SUPABASE_ANON_KEY]) {
      const { status } = await call(token, form('red-apple-rag.abc'));
      assert.equal(status, 401);
    }
  });

  it('arquivo forjado, formato desconhecido e grande demais: código e mensagem em pt-BR', async () => {
    const dono = await player();
    const cases = [
      [form('musica.mid', readFileSync(new URL('red-apple-rag.abc', FIXTURES))), 415, 'unknown_format'],
      [form('musica.pdf', Buffer.from('%PDF-1.4')), 415, 'unknown_format'],
      [form('cortado.mid', readFileSync(new URL('baltzar-prelude.mid', FIXTURES)).subarray(0, 40)), 422, 'invalid_file'],
      [form('grande.abc', Buffer.alloc(1024 * 1024 + 1, 'a')), 413, 'file_too_large'],
    ];
    for (const [body, status, code] of cases) {
      const res = await call(dono.token, body);
      assert.equal(res.status, status, JSON.stringify(res.body));
      assert.equal(res.body.error.code, code);
      assert.match(res.body.error.message, /[a-zà-ú]/);
    }
    const { rows } = await db.query(`select count(*)::int as n from ${S}.songs where owner_id = $1`, [dono.id]);
    assert.equal(rows[0].n, 0);
  });

  it('limite de 50 músicas: a 51ª é recusada com limit_reached', async () => {
    const dono = await player();
    await db.query(
      `insert into ${S}.songs (id, title, bpm, time_beats, time_unit, duration_seconds, origin, owner_id, visibility)
       select gen_random_uuid()::text, 'Cheia ' || i, 60, 4, 4, 4, 'imported', $1, 'private' from generate_series(1, 50) i`,
      [dono.id]);
    const res = await call(dono.token, form('red-apple-rag.abc'));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'limit_reached');
  });

  it('o app NÃO grava direto: insert em songs pela API dá permissão negada', async () => {
    const dono = await player();
    const { error } = await dono.client.from('songs').insert({ title: 'Direto', bpm: 60, time_beats: 4, time_unit: 4, duration_seconds: 4, origin: 'imported' });
    assert.equal(error?.code, '42501');
  });
});
