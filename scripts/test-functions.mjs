// Testes das Edge Functions contra o Supabase local (npm run db:local sobe e chama). import-song: as 5 partituras reais
// entram, o que é do jogador continua só dele, e o que não pode entrar é recusado com o código certo. class-login: o
// aluno entra com código + nome + PIN, e errar, insistir ou turma encerrada são recusados. Storage do áudio e
// purge-submission-audio: só quem pode sobe e ouve, e a retenção apaga o vencido (pulam onde o Storage não roda).
// Variáveis: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL; FUNCTION_URL, CLASS_LOGIN_URL e
// PURGE_URL opcionais (padrão SUPABASE_URL/functions/v1/<função>; servem para apontar a função rodando no Deno da máquina).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
const CLASS_LOGIN_URL = process.env.CLASS_LOGIN_URL || `${SUPABASE_URL}/functions/v1/class-login`;
const PURGE_URL = process.env.PURGE_URL || `${SUPABASE_URL}/functions/v1/purge-submission-audio`;
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

// O Storage só roda onde o [storage] do config.toml subiu (na CI sempre; nesta máquina o Docker não baixa a imagem)
const storageUp = !!ready && (await fetch(`${SUPABASE_URL}/storage/v1/bucket/submissions`, {
  headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
}).then((r) => r.ok, () => false));
if (process.env.CI && ready && !storageUp) throw new Error('Storage (bucket submissions) fora do ar na CI: o áudio das entregas não seria testado.');

describe('turmas: class-login, áudio das entregas e retenção', { skip: !ready && 'Supabase local não configurado' }, () => {
  let db;
  const accounts = [];
  const members = [];
  const songs = [];
  const uploaded = [];

  before(async () => {
    db = new pg.Client({ connectionString: DATABASE_URL, ssl: false });
    await db.connect();
  });
  after(async () => {
    // O usuário de auth do aluno não cai com a turma: sai pelo e-mail sintético de cada aluno criado aqui
    const emails = members.map((id) => `aluno-${id}@alunos.violinhero.invalid`);
    const { rows } = await db.query('select id from auth.users where email = any($1)', [emails]);
    for (const id of [...accounts, ...rows.map((r) => r.id)]) await admin.auth.admin.deleteUser(id).catch(() => {});
    if (uploaded.length) await admin.storage.from('submissions').remove(uploaded).catch(() => {});
    if (songs.length) await db.query(`delete from ${S}.songs where id = any($1)`, [songs]);
    await db?.end();
  });

  /** Sessão de uma conta de e-mail, como o link mágico daria (sem mandar e-mail). */
  async function signIn(email) {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error) throw error;
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { ...options, db: { schema: S } });
    const { error: verifyError } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
    if (verifyError) throw verifyError;
    return client;
  }

  /** Conta com e-mail (professor ou responsável), já entrada. */
  async function account() {
    const email = `t-${randomUUID()}@t.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    accounts.push(data.user.id);
    return { id: data.user.id, client: await signIn(email) };
  }

  async function rpc(client, fn, args) {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw Object.assign(new Error(error.message), error);
    return data;
  }

  /** Professor com turma e um aluno cadastrado (o PIN só aparece aqui). */
  async function classWithStudent(name = 'Ana Luísa') {
    const teacher = await account();
    const cls = await rpc(teacher.client, 'create_class', { p_name: 'Turma da função' });
    const { student, pin } = await rpc(teacher.client, 'add_student', { p_class_id: cls.id, p_name: name });
    members.push(student.id);
    return { teacher, cls, student, pin };
  }

  /** Cada teste num IP próprio: o bloqueio por IP de um não vaza para o outro. */
  const freshIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

  async function login(body, ip = freshIp(), init = {}) {
    const res = await fetch(CLASS_LOGIN_URL, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'x-forwarded-for': ip },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...init,
    });
    return { status: res.status, body: await res.json() };
  }

  /** O que o app faz com a resposta da class-login: adota a sessão do aluno num cliente. */
  async function studentClient(session) {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { ...options, db: { schema: S } });
    const { error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (error) throw error;
    return client;
  }

  describe('Edge Function class-login', () => {
    it('código + nome + PIN certos: sessão do aluno (conta sem e-mail real), a mesma em toda entrada', async () => {
      const { cls, student, pin } = await classWithStudent('Ana Luísa');
      const code = `${cls.code.slice(0, 4).toLowerCase()}-${cls.code.slice(4)}`;
      const first = await login({ code, name: '  ana luisa ', pin });
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.deepEqual([first.body.student.id, first.body.student.name, first.body.student.class_name], [student.id, 'Ana Luísa', 'Turma da função']);
      assert.deepEqual(Object.keys(first.body.session).sort(), ['access_token', 'expires_at', 'expires_in', 'refresh_token', 'token_type']);
      const client = await studentClient(first.body.session);
      const { data: { user } } = await client.auth.getUser();
      assert.equal(user.id, first.body.user_id);
      assert.equal(user.is_anonymous, false);
      assert.match(user.email, /^aluno-[0-9a-f-]{36}@alunos\.violinhero\.invalid$/);
      assert.equal((await rpc(client, 'get_my_class')).name, 'Ana Luísa');
      const again = await login({ code: cls.code, name: 'Ana Luísa', pin });
      assert.equal(again.body.user_id, first.body.user_id);
      const { rows } = await db.query(`select user_id from ${S}.class_members where id = $1`, [student.id]);
      assert.equal(rows[0].user_id, first.body.user_id);
    });

    it('PIN errado e nome desconhecido: a mesma resposta neutra, 401', async () => {
      const { cls, pin } = await classWithStudent('Rita');
      const ip = freshIp();
      const wrong = await login({ code: cls.code, name: 'Rita', pin: String((Number(pin) + 1) % 10000).padStart(4, '0') }, ip);
      const unknown = await login({ code: cls.code, name: 'Ninguém', pin }, ip);
      const noClass = await login({ code: 'ZZZZ-ZZZZ', name: 'Rita', pin }, ip);
      for (const r of [wrong, unknown, noClass]) {
        assert.equal(r.status, 401);
        assert.deepEqual(r.body, { error: { code: 'invalid_credentials', message: 'Código da turma, nome ou PIN não conferem.' } });
      }
    });

    it('5 PINs errados bloqueiam (429) até o PIN novo do professor', async () => {
      const { teacher, cls, student, pin } = await classWithStudent('Rita');
      const bad = String((Number(pin) + 1) % 10000).padStart(4, '0');
      for (let i = 0; i < 5; i++) assert.equal((await login({ code: cls.code, name: 'Rita', pin: bad })).status, 401);
      const locked = await login({ code: cls.code, name: 'Rita', pin });
      assert.equal(locked.status, 429);
      assert.equal(locked.body.error.code, 'too_many_attempts');
      const { pin: fresh } = await rpc(teacher.client, 'reset_student_pin', { p_member_id: student.id });
      assert.equal((await login({ code: cls.code, name: 'Rita', pin: fresh })).status, 200);
    });

    it('turma encerrada: credencial certa ouve 403 class_closed; errada continua 401', async () => {
      const { teacher, cls, pin } = await classWithStudent('Rita');
      await rpc(teacher.client, 'close_class', { p_class_id: cls.id });
      const closed = await login({ code: cls.code, name: 'Rita', pin });
      assert.equal(closed.status, 403);
      assert.equal(closed.body.error.code, 'class_closed');
      assert.equal((await login({ code: cls.code, name: 'Rita', pin: String((Number(pin) + 1) % 10000).padStart(4, '0') })).status, 401);
    });

    it('pedido torto: 400 sem gastar tentativa', async () => {
      for (const body of [{ code: 'ABCDEFGH', name: 'Rita' }, { code: 'ABCDEFGH', name: '', pin: '1234' }, 'não é json', { code: 1, name: 'x', pin: '1234' }]) {
        const r = await login(body);
        assert.equal(r.status, 400, JSON.stringify(body));
        assert.equal(r.body.error.code, 'bad_request');
      }
    });
  });

  describe('Storage do áudio e purge-submission-audio', { skip: !storageUp && 'Storage fora do ar neste Supabase local' }, () => {
    const audio = (bytes = 2048) => new Blob([new Uint8Array(bytes)], { type: 'audio/webm' });
    const upload = (client, path, blob = audio(), contentType = 'audio/webm') =>
      client.storage.from('submissions').upload(path, blob, { contentType, upsert: false });
    const download = (client, path) => client.storage.from('submissions').download(path);

    /** Turma com Ana e Bia entradas pela class-login, a mãe da Ana ligada, uma música do catálogo e uma tarefa. */
    async function scene() {
      const teacher = await account();
      const cls = await rpc(teacher.client, 'create_class', { p_name: 'Turma do áudio' });
      const kids = {};
      for (const name of ['Ana', 'Bia']) {
        const { student, pin } = await rpc(teacher.client, 'add_student', { p_class_id: cls.id, p_name: name });
        members.push(student.id);
        const { body } = await login({ code: cls.code, name, pin });
        kids[name] = { id: student.id, client: await studentClient(body.session) };
      }
      const mae = await account();
      const { code } = await rpc(teacher.client, 'create_guardian_invite', { p_member_id: kids.Ana.id });
      await rpc(mae.client, 'accept_guardian_invite', { p_code: code });
      const song = `tf-${randomUUID().slice(0, 8)}`;
      songs.push(song);
      await db.query(
        `insert into ${S}.songs (id, title, bpm, time_beats, time_unit, duration_seconds, origin, owner_id, visibility)
         values ($1, 'Teste', 60, 4, 4, 4, 'catalog', null, 'public')`, [song]);
      const chart = { formatVersion: 1, id: song, title: 'Teste', composer: '', key: 'D major', bpm: 60, timeSignature: { beats: 4, unit: 4 },
        level: 'easy', measures: [{ beats: 4, notes: [{ beat: 0, beats: 4, midi: 62, string: 1, finger: 0 }] }] };
      await db.query(`insert into ${S}.song_charts (song_id, level, format_version, chart) values ($1, 'easy', 1, $2)`, [song, JSON.stringify(chart)]);
      const task = await rpc(teacher.client, 'create_assignment', {
        p_class_id: cls.id, p_song_id: song, p_level: 'easy', p_mode: 'arcade',
        p_due_at: new Date(Date.now() + 86400e3).toISOString(), p_instruction_key: 'tocar-inteira', p_instruction_text: null,
      });
      const pathOf = (kid, file = 'take.webm') => `${cls.id}/${kids[kid].id}/${task.id}/${file}`;
      return { teacher, cls, kids, mae, song, task, pathOf };
    }

    const playOf = (song) => ({
      client_id: randomUUID(), song_id: song, level: 'easy', mode: 'arcade', finished: true, no_fail: false, looped: false, speed: 1,
      score: 100, max_combo: 1, accuracy: 100, counts: { perfect: 1, great: 0, good: 0, miss: 0 }, mean_abs_cents: 14.5,
      string_cents: [null, 3.25, null, null], duration_ms: 1500, played_at: new Date().toISOString(),
    });

    it('o aluno sobe e ouve o próprio; professor e responsável ouvem; colega e outro professor NÃO sobem nem ouvem', async () => {
      const { teacher, kids, mae, pathOf } = await scene();
      const path = pathOf('Ana');
      const up = await upload(kids.Ana.client, path);
      assert.equal(up.error, null, up.error?.message);
      uploaded.push(path);
      for (const client of [kids.Ana.client, teacher.client, mae.client]) {
        const { data, error } = await download(client, path);
        assert.equal(error, null, error?.message);
        assert.equal(data.size, 2048);
      }
      const outro = await account();
      for (const client of [kids.Bia.client, outro.client]) {
        const { data } = await download(client, path);
        assert.equal(data, null);
      }
      assert.notEqual((await upload(kids.Bia.client, pathOf('Ana', 'da-bia.webm'))).error, null);
      assert.notEqual((await upload(teacher.client, pathOf('Ana', 'do-prof.webm'))).error, null);
      assert.notEqual((await upload(mae.client, pathOf('Ana', 'da-mae.webm'))).error, null);
      // Sem policy de update nem delete: nem o dono troca ou apaga o arquivo
      assert.notEqual((await upload(kids.Ana.client, path, audio(10), 'audio/webm')).error, null);
      await kids.Ana.client.storage.from('submissions').remove([path]);
      assert.equal((await download(teacher.client, path)).error, null);
    });

    it('o bucket recusa o que não é áudio e o que passa de 10 MB', async () => {
      const { kids, pathOf } = await scene();
      const text = await upload(kids.Ana.client, pathOf('Ana', 'texto.webm'), new Blob(['oi'], { type: 'text/plain' }), 'text/plain');
      assert.notEqual(text.error, null);
      const big = await upload(kids.Ana.client, pathOf('Ana', 'grande.webm'), audio(10 * 1024 * 1024 + 1));
      assert.notEqual(big.error, null);
    });

    it('a retenção apaga do Storage o áudio revisado há mais de 30 dias e marca a entrega', async () => {
      const { teacher, kids, song, task, pathOf } = await scene();
      const path = pathOf('Ana');
      assert.equal((await upload(kids.Ana.client, path)).error, null);
      uploaded.push(path);
      await rpc(kids.Ana.client, 'submit_play', { p_play: playOf(song) });
      const sub = await rpc(kids.Ana.client, 'submit_assignment', { p_assignment_id: task.id, p_play_id: null, p_audio_path: path });
      await rpc(teacher.client, 'review_submission', { p_submission_id: sub.submission.id, p_grade: 5, p_concept: null, p_comment: 'Lindo' });

      const call = (key) => fetch(PURGE_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}` } });
      assert.equal((await call(SUPABASE_ANON_KEY)).status, 401);
      await call(SUPABASE_SERVICE_ROLE_KEY);
      assert.equal((await download(teacher.client, path)).error, null, 'revisado agora: o áudio fica');

      await db.query(`update ${S}.reviews set reviewed_at = now() - interval '31 days' where submission_id = $1`, [sub.submission.id]);
      const res = await call(SUPABASE_SERVICE_ROLE_KEY);
      assert.equal(res.status, 200);
      assert.ok((await res.json()).purged >= 1);
      assert.notEqual((await download(teacher.client, path)).error, null);
      const { rows } = await db.query(`select audio_path, audio_deleted_at from ${S}.submissions where id = $1`, [sub.submission.id]);
      assert.equal(rows[0].audio_path, null);
      assert.ok(rows[0].audio_deleted_at);
    });
  });
});
