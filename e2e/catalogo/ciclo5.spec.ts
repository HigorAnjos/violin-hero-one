import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Browser, BrowserContextOptions, Page, PlaywrightWorkerArgs } from '@playwright/test';
import { songDurationSeconds } from '../../src/game/notation/song';
import { microphoneArgs, warmAudio } from '../microphone';
import { CATALOG } from './catalogo';
import { accountFromPrompt, expect, localFunctions, storedSession, test } from './aparelho';

/**
 * O critério de pronto do ciclo 5 contra o Supabase local de verdade, sem o fake de ?turmas=simulada: a professora
 * cria conta, turma, 3 alunos e uma tarefa; cada aluno entra no seu aparelho pela class-login (código + nome + PIN),
 * joga a tarefa com o WAV no microfone falso gravando e a entrega sobe com o áudio para o Storage; a professora ouve
 * e revisa, o aluno vê a revisão e o responsável acompanha. No fim, o que ninguém de fora vê. O layout de cada tela
 * fica em e2e/professor, e2e/turma-aluno e e2e/responsavel-planos (com o fake).
 *
 * Os jogadores daqui são novos, nunca a sessão da suíte (sessao.setup.ts), como no ciclo4.spec.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const CATALOG_ASSETS = path.resolve(import.meta.dirname, '../../dist-catalogo/assets');

/** A música da tarefa: a do WAV escala-re-maior, que o seed-songs grava no catálogo. */
const SCALE = CATALOG.find((s) => s.sheet.id === 'escala-re-maior')!;
const SCALE_SECONDS = songDurationSeconds(SCALE.charts.easy);

const NEUTRAL = 'Código da turma, nome ou PIN não conferem.';

/**
 * A class-login faz 3 a 4 chamadas ao Supabase (conferir, criar o usuário, gerar e trocar o link): pelo Kong local,
 * que segura as primeiras chamadas de um cliente novo, a entrada passa de 15 s nesta máquina.
 */
const LOGIN_TIMEOUT = 60000;

/**
 * O Storage do supabase start nesta máquina não sobe (o container não resolve DNS) e o Kong segura o pedido sem
 * resposta: sem ele a entrega com áudio não tem para onde ir. Na CI ele sobe com o resto.
 */
async function storageUp(): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.E2E_SUPABASE_URL}/storage/v1/version`, {
      headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
const NO_STORAGE = 'Storage do Supabase local fora do ar (aqui o container não resolve DNS): a entrega com áudio só roda na CI';

/**
 * Daqui em diante a história precisa do Storage. Fora da CI, sem ele, o resto pula com o motivo; na CI ele faz parte
 * do job, e cair lá falha o teste em vez de pular calado o áudio e as negações do bucket.
 */
async function requireStorage() {
  const up = await storageUp();
  if (process.env.CI) expect(up, NO_STORAGE).toBe(true);
  test.skip(!up, NO_STORAGE);
}

interface Reply<T = unknown> {
  status: number;
  body: T;
}

/** Uma função do schema violinhero com o token do usuário da página: o servidor decide o que ele pode. */
const rpc = <T = unknown>(page: Page, fn: string, args: Record<string, unknown> = {}) =>
  page.evaluate(
    async ([url, key, name, body]) => {
      const token = Object.entries(localStorage).find(([k]) => /^sb-.+-auth-token$/.test(k))?.[1];
      const access = token ? (JSON.parse(token) as { access_token: string }).access_token : '';
      const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${access}`, 'Content-Profile': 'violinhero', 'Content-Type': 'application/json' },
        body,
      });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
    [process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, fn, JSON.stringify(args)] as const
  ) as Promise<Reply<T>>;

/** O mesmo, quando tem que dar certo. */
async function rpcOk<T>(page: Page, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const reply = await rpc<T>(page, fn, args);
  expect(reply.status, `${fn}: ${JSON.stringify(reply.body)}`).toBe(200);
  return reply.body;
}

/**
 * A função nega como o banco nega quem não é dono (0011–0013): de outro ou inexistente dá o mesmo PT404, com a
 * mensagem de "não encontrado", que o PostgREST responde como HTTP 404 (0021; antes, P0002 virava 500 como erro de
 * servidor). O app decide pelo código (classroomErrorKind). Outro código (42501, um erro de verdade) é falha, não negação.
 */
async function expectNotFound(page: Page, fn: string, args: Record<string, unknown>, what: string) {
  const reply = await rpc<{ code?: string; message?: string }>(page, fn, args);
  expect({ status: reply.status, code: reply.body?.code }, what).toEqual({ status: 404, code: 'PT404' });
  expect(reply.body?.message, what).toMatch(/não encontrad/);
}

/**
 * O áudio de `audioPath` pelo Storage com o token da página: o endereço assinado (o que as telas pedem) e a leitura
 * direta. A policy do bucket decide; o status, o tipo e o tamanho voltam para o teste, e o começo do corpo quando
 * não é áudio.
 */
const storageTry = (page: Page, audioPath: string) =>
  page.evaluate(
    async ([url, key, file]) => {
      const token = Object.entries(localStorage).find(([k]) => /^sb-.+-auth-token$/.test(k))?.[1];
      const access = token ? (JSON.parse(token) as { access_token: string }).access_token : '';
      const headers = { apikey: key, Authorization: `Bearer ${access}` };
      const sign = await fetch(`${url}/storage/v1/object/sign/submissions/${file}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 60 }),
      });
      const read = await fetch(`${url}/storage/v1/object/authenticated/submissions/${file}`, { headers });
      const readType = read.headers.get('content-type') ?? '';
      const bytes = new Uint8Array(await read.arrayBuffer());
      return {
        sign: sign.status,
        signBody: (await sign.text()).slice(0, 200),
        read: read.status,
        readType,
        readBytes: bytes.byteLength,
        readBody: readType.startsWith('audio/') ? '' : new TextDecoder().decode(bytes.slice(0, 200)),
      };
    },
    [process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, audioPath] as const
  );

/**
 * O Storage nega o áudio: o sign e a leitura respondem com erro de policy ou de arquivo inexistente (400/403/404,
 * que o Storage não distingue de propósito), com um corpo de erro e nenhum byte de áudio.
 */
async function expectAudioDenied(page: Page, audioPath: string, who: string) {
  const reply = await storageTry(page, audioPath);
  expect([400, 403, 404], `${who}: sign (${reply.signBody})`).toContain(reply.sign);
  expect(reply.signBody, `${who}: sign sem endereço`).not.toContain('signedURL');
  expect([400, 403, 404], `${who}: leitura (${reply.readBody})`).toContain(reply.read);
  expect(reply.readType, `${who}: leitura sem áudio`).not.toMatch(/^audio\//);
  expect(reply.readBody, `${who}: corpo de erro`).toMatch(/error|not.?found|denied|unauthorized/i);
  expect(reply.readBytes, `${who}: sem bytes de áudio`).toBeLessThan(1024);
}

/** O que o ranking da semana da escala no Fácil mostra para o usuário da página. */
const scaleRanking = (page: Page) =>
  rpcOk<{ ranking_name: string; is_me: boolean }[]>(page, 'get_ranking', { p_song_id: SCALE.sheet.id, p_level: 'easy', p_period: 'week', p_limit: 20 });

/** Uma linha do get_assignment / get_my_assignments como o servidor manda (o que o teste confere). */
interface StatusRow {
  student_id?: string;
  name?: string;
  best: { play_id: string } | null;
  submission: { id: string; audio_path: string | null; audio_duration_ms: number | null } | null;
  review: { concept: string | null; comment: string } | null;
}

/** "0:48", como o SubmissionPlayer e a entrega mostram a duração. */
const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const unique = (who: string) => `${who}-${randomUUID().slice(0, 8)}@t.test`;

/** O prazo da tarefa no campo de data: daqui a uma semana, no fuso do navegador (o mesmo da máquina). */
function dueInAWeek(): string {
  const d = new Date(Date.now() + 7 * 86400e3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A conta da professora (ou do responsável): a área manda para o pedido de conta, o link volta para ela. */
async function teacherAccount(page: Page, email: string) {
  await page.goto('/professor');
  await expect(page).toHaveURL(/\/conta\?motivo=professor/);
  // O link mágico volta com o fragmento do token já lido (fica um # vazio)
  await accountFromPrompt(page, 'Quer criar sua turma?', email, /\/professor#?$/);
}

/** Cadastra o aluno pelo nome e devolve o PIN que a tela mostra uma vez só. */
async function addStudent(page: Page, name: string): Promise<string> {
  await page.getByRole('textbox', { name: 'Nome do aluno' }).fill(name);
  await page.getByRole('button', { name: 'Cadastrar' }).click();
  const notice = page.getByRole('alertdialog', { name: `PIN de ${name}` });
  await expect(notice).toContainText('não aparece de novo');
  const pin = (await notice.getByLabel(/^PIN \d \d \d \d$/).textContent())?.trim() ?? '';
  expect(pin, `PIN de ${name}`).toMatch(/^\d{4}$/);
  await notice.getByRole('button', { name: 'Anotei o PIN' }).click();
  await expect(notice).toBeHidden();
  return pin;
}

interface StudentDevice {
  page: Page;
  browser: Browser;
}

/**
 * O aparelho do aluno: um Chromium próprio cujo microfone é o WAV da escala (o arquivo é do navegador), no tamanho e
 * no toque do projeto, como convidado anônimo do primeiro toque. O WAV recomeça a cada abertura do microfone (o
 * Chromium lê o arquivo do início a cada getUserMedia): a partida o recebe do começo mesmo com o afinar antes.
 */
async function studentDevice(playwright: PlaywrightWorkerArgs['playwright'], options: BrowserContextOptions): Promise<StudentDevice> {
  const browser = await playwright.chromium.launch({ args: microphoneArgs('escala-re-maior', { loop: false }) });
  const context = await browser.newContext({ ...options, permissions: ['microphone'] });
  await context.addInitScript(() => {
    localStorage.setItem('vh:onboarded', '1');
    // Sem orquestra: nada da escala é descartado como vazamento dela
    localStorage.setItem('vh:orchestra', JSON.stringify({ enabled: false, headphones: true, volume: 0.8 }));
    const streams: MediaStream[] = [];
    (window as Window & { __liveTracks?: () => number }).__liveTracks = () => streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      streams.push(stream);
      return stream;
    };
  });
  await localFunctions(context);
  const page = await context.newPage();
  await warmAudio(page, CATALOG_ASSETS);
  expect((await storedSession(page)).user.is_anonymous).toBe(true);
  return { page, browser };
}

const liveTracks = (page: Page) => page.evaluate(() => (window as Window & { __liveTracks?: () => number }).__liveTracks?.() ?? -1);

/** Do código da turma até as tarefas: o código digitado, o nome e o PIN pelo teclado da tela. */
async function enterClass(page: Page, code: string, name: string, pin: string) {
  await page.goto('/turma');
  await page.getByLabel('Código da turma').fill(code);
  await page.getByRole('button', { name: /Continuar/ }).click();
  await expect(page).toHaveURL(/\/turma\/entrar\?codigo=/);
  await expect(page.getByText(`código ${code} ✓`)).toBeVisible();
  await typeLogin(page, name, pin);
}

async function typeLogin(page: Page, name: string, pin: string) {
  await page.getByLabel('Seu nome, como o professor cadastrou').fill(name);
  for (const digit of pin) await page.getByRole('group', { name: 'Teclado do PIN' }).getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: /^Entrar/ }).click();
}

/** Um PIN de 4 dígitos que não é `pin`. */
const wrongPin = (pin: string) => String((Number(pin) + 1) % 10000).padStart(4, '0');

/** A tarefa na lista do aluno. */
const taskCard = (page: Page) => page.getByRole('navigation', { name: 'Tarefas' }).getByRole('button', { name: new RegExp(SCALE.sheet.title) });

/**
 * O aluno joga a tarefa como na tela: "Tocar a tarefa" carrega a música do servidor e abre o afinar com o estado da
 * partida de tarefa (gravar + a tarefa). O afinar abre o microfone e o WAV começaria ali; o teste guarda esse estado,
 * sai (o microfone fecha) e abre a partida com ele, e o WAV recomeça junto com a partida. Termina na entrega.
 */
async function playTask(page: Page): Promise<string> {
  await page.goto('/tarefas');
  await taskCard(page).click();
  await page.getByRole('link', { name: /Tocar a tarefa/ }).click();
  await expect(page).toHaveURL(/\/afinar$/, { timeout: 20000 });
  const state = await page.evaluate(() => (history.state as { usr?: Record<string, unknown> } | null)?.usr ?? null);
  expect(state, 'o estado da partida de tarefa no afinar').toMatchObject({
    mode: 'Arcade',
    recordAudio: true,
    song: { id: SCALE.sheet.id, level: 'easy' },
    task: { songTitle: SCALE.sheet.title },
  });
  await page.getByRole('link', { name: 'Voltar' }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => liveTracks(page), { message: 'o microfone do afinar fechou' }).toBe(0);
  await page.evaluate((usr) => {
    history.pushState({ usr, key: 'tarefa', idx: 1 }, '', '/jogo');
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, state);
  await expect(page).toHaveURL(/\/tarefas\/entrega$/, { timeout: (SCALE_SECONDS + 60) * 1000 });
  await expect(page.getByRole('heading', { name: /Tarefa tocada! Bora mostrar\?/ })).toBeVisible();
  const goesWith = page.getByText(/Vai junto: a partida .* e o áudio de \d+:\d\d/);
  await expect(goesWith).toBeVisible();
  // A partida subiu pela fila e é a que conta para a tarefa (terminada, mesma música, nível e modo, antes do prazo)
  await expect
    .poll(async () => (await rpcOk<StatusRow[]>(page, 'get_my_assignments'))[0]?.best?.play_id ?? null, { message: 'a partida conta para a tarefa' })
    .not.toBeNull();
  return (await goesWith.textContent())!.match(/áudio de (\d+:\d\d)/)![1];
}

/** Envia a entrega com o áudio e confere no servidor: a partida que conta, o caminho no bucket e a duração gravada. */
async function sendTask(page: Page, shownClock: string) {
  await page.getByRole('button', { name: /Enviar para o professor/ }).click();
  await expect(page.getByText('Enviada ✓ O professor já pode ouvir e revisar.')).toBeVisible({ timeout: 30000 });
  const [mine] = await rpcOk<StatusRow[]>(page, 'get_my_assignments');
  expect(mine.submission?.audio_path, 'o áudio subiu para o bucket').toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[\w-]+\.webm$/);
  expect(clock(mine.submission!.audio_duration_ms ?? 0)).toBe(shownClock);
  expect(mine.submission!.audio_duration_ms).toBeGreaterThanOrEqual(SCALE_SECONDS * 1000);
}

interface Student {
  name: string;
  pin: string;
  device?: StudentDevice;
  id?: string;
}

test.describe('ciclo 5: professora, 3 alunos, entrega com áudio, revisão e responsável', () => {
  test.skip(({ isMobile }) => isMobile, 'a história inteira só no desktop; no celular, a entrada e a entrega (abaixo)');

  test('do cadastro da turma à revisão ouvida pelo responsável; e o que ninguém de fora vê', async ({
    newDevice,
    playwright,
    baseURL,
    viewport,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    userAgent,
    locale,
  }) => {
    test.setTimeout(10 * 60 * 1000);
    const options = { baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, locale };
    const students: Student[] = [
      { name: 'Ana', pin: '' },
      { name: 'Bruno', pin: '' },
      { name: 'Carla', pin: '' },
    ];
    const teacher = await newDevice();
    let code = '';
    let classId = '';
    let assignmentId = '';

    try {
      await test.step('a. a professora cria conta por e-mail, a turma e os 3 alunos, anotando os PINs', async () => {
        await teacherAccount(teacher, unique('professora'));
        await expect(teacher.getByRole('heading', { name: 'Crie sua primeira turma' })).toBeVisible();
        await teacher.getByLabel('Nome da turma').fill('Iniciantes · sábado');
        await teacher.getByRole('button', { name: 'Criar turma' }).click();
        await expect(teacher.getByRole('heading', { name: 'Iniciantes · sábado' })).toBeVisible();
        code = (await teacher.locator('strong[aria-describedby="codigo-turma"]').textContent())?.trim() ?? '';
        expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
        for (const s of students) s.pin = await addStudent(teacher, s.name);
        await expect(teacher.getByText('Alunos · 3 de')).toBeVisible();
        const [klass] = await rpcOk<{ id: string; code: string }[]>(teacher, 'list_my_classes');
        expect(klass.code.replace('-', '')).toBe(code.replace('-', ''));
        classId = klass.id;
      });

      await test.step('b. cria a tarefa: música do catálogo, nível, modo, prazo e recado', async () => {
        await teacher.getByRole('link', { name: /Nova tarefa/ }).click();
        await expect(teacher.getByRole('heading', { name: 'Nova tarefa' })).toBeVisible();
        await teacher.getByLabel('Música').selectOption(SCALE.sheet.id);
        await teacher.getByRole('group', { name: 'Nível' }).getByRole('button', { name: 'Fácil' }).click();
        await teacher.getByRole('group', { name: 'Modo de jogo' }).getByRole('button', { name: 'Arcade' }).click();
        await teacher.getByLabel('Prazo').fill(dueInAWeek());
        await teacher.getByRole('button', { name: 'Capriche na afinação.' }).click();
        await expect(teacher.getByRole('region', { name: 'Como o aluno vai ver' })).toContainText(`Tarefa nova: ${SCALE.sheet.title}`);
        await teacher.getByRole('button', { name: /Enviar para 3 alunos/ }).click();
        await expect(teacher).toHaveURL(new RegExp(`/professor/turma/${classId}$`));
        const tasks = teacher.getByRole('region', { name: 'Tarefas' });
        await expect(tasks.getByRole('link', { name: `Entregas de ${SCALE.sheet.title} · Fácil · Arcade` })).toBeVisible();
        const [task] = await rpcOk<{ id: string; song_id: string; level: string; mode: string; instruction_key: string }[]>(teacher, 'list_class_assignments', {
          p_class_id: classId,
        });
        expect(task).toMatchObject({ song_id: SCALE.sheet.id, level: 'easy', mode: 'arcade', instruction_key: 'capricha-afinacao' });
        assignmentId = task.id;
      });

      await test.step('c. cada aluno entra no seu aparelho com código + nome + PIN; a Carla erra o PIN antes', async () => {
        for (const s of students) {
          s.device = await studentDevice(playwright, options);
          const page = s.device.page;
          const anonymous = (await storedSession(page)).user.id;
          if (s.name === 'Carla') {
            await enterClass(page, code, s.name, wrongPin(s.pin));
            await expect(page.getByRole('alert')).toHaveText(NEUTRAL, { timeout: LOGIN_TIMEOUT });
            await expect(page.getByLabel('PIN de 4 números')).toHaveValue('');
            // Nome que não está na turma: a mesma resposta, nada diz qual dos três errou
            await typeLogin(page, 'Fulano', s.pin);
            await expect(page.getByRole('alert')).toHaveText(NEUTRAL, { timeout: LOGIN_TIMEOUT });
            await typeLogin(page, s.name, s.pin);
          } else {
            await enterClass(page, code, s.name, s.pin);
          }
          await expect(page).toHaveURL(/\/tarefas$/, { timeout: LOGIN_TIMEOUT });
          await expect(page.getByText(`Iniciantes · sábado · ${s.name}`)).toBeVisible();
          await expect(taskCard(page)).toBeVisible();
          const session = await storedSession(page);
          expect(session.user.id, 'o aluno é um usuário próprio, não o convidado do aparelho').not.toBe(anonymous);
          const mine = await rpcOk<{ student_id: string; name: string; class_id: string }>(page, 'get_my_class');
          expect(mine).toMatchObject({ name: s.name, class_id: classId });
          s.id = mine.student_id;
        }
        await teacher.reload();
        for (const s of students) await expect(teacher.getByRole('table').getByRole('row').filter({ hasText: s.name })).toContainText('já entrou');
      });

      const clocks = new Map<string, string>();
      await test.step('d1. cada aluno joga a tarefa com o WAV gravando; a partida conta e a entrega espera na tela', async () => {
        for (const s of students) clocks.set(s.name, await playTask(s.device!.page));
      });

      const [ana, bruno] = students;
      const guardian = await newDevice();
      await test.step('g1. o responsável da Ana cria conta e aceita o convite que a professora gerou', async () => {
        await teacher.goto(`/professor/turma/${classId}`);
        await teacher.getByRole('button', { name: 'Convite do responsável de Ana' }).click();
        // O código tem elemento próprio no aviso (10 símbolos): não depende da frase em volta
        const invite = teacher.getByRole('status', { name: 'Convite do responsável de Ana' });
        await expect(invite).toBeVisible();
        const inviteCode = (await invite.getByText(/^[A-Z0-9]{10}$/).textContent())!;

        await guardian.goto('/responsavel');
        await expect(guardian).toHaveURL(/\/conta\?motivo=responsavel/);
        await accountFromPrompt(guardian, 'Quer acompanhar seu filho?', unique('responsavel'), /\/responsavel#?$/);
        await guardian.getByLabel('Código do convite').fill(inviteCode);
        await guardian.getByRole('button', { name: 'Aceitar convite' }).click();
        await expect(guardian.getByRole('heading', { name: 'A semana de Ana' })).toBeVisible();
        await expect(guardian.getByLabel('Filho').locator('option')).toHaveCount(1);
        await expect(guardian.getByRole('region', { name: 'Afinação' })).toContainText(`${SCALE.sheet.title}: `);
      });

      const other = await newDevice();
      await test.step('h1. o que o banco NÃO mostra: outra professora, o colega, o ranking, o desafio e o responsável', async () => {
        await teacherAccount(other, unique('outra-professora'));
        await expect(other.getByRole('heading', { name: 'Crie sua primeira turma' })).toBeVisible();
        await expect(other.getByText('Iniciantes · sábado')).toHaveCount(0);
        expect(await rpcOk(other, 'list_my_classes')).toEqual([]);
        await expectNotFound(other, 'get_class', { p_class_id: classId }, 'outra professora abre a turma');
        await expectNotFound(other, 'get_assignment', { p_assignment_id: assignmentId }, 'outra professora abre a tarefa');
        await expectNotFound(other, 'get_student_progress', { p_member_id: ana.id }, 'outra professora vê o progresso da Ana');

        const brunoPage = bruno.device!.page;
        await expectNotFound(brunoPage, 'get_student_progress', { p_member_id: ana.id }, 'o colega vê o progresso da Ana');

        // Os três jogaram a escala valendo nesta semana e nenhum aparece no ranking dela, nem para si mesmo
        for (const s of students) {
          const lines = await scaleRanking(s.device!.page);
          expect(lines.filter((l) => l.is_me), `${s.name} no ranking`).toEqual([]);
        }
        // Nem desafio com a própria partida da tarefa: conta de aluno não é conta de desafio (0018)
        const [brunoTask] = await rpcOk<StatusRow[]>(brunoPage, 'get_my_assignments');
        const challenge = await rpc<{ code?: string }>(brunoPage, 'create_challenge', { p_play_id: brunoTask.best!.play_id, p_days: 7 });
        expect({ status: challenge.status, code: challenge.body?.code }, 'aluno cria desafio').toEqual({ status: 403, code: '28000' });

        await expectNotFound(guardian, 'get_student_progress', { p_member_id: bruno.id }, 'o responsável da Ana vê o Bruno');
        expect(await rpcOk<{ student_id: string }[]>(guardian, 'list_my_children')).toEqual([expect.objectContaining({ student_id: ana.id, name: 'Ana' })]);
      });

      await requireStorage();

      await test.step('d2. cada aluno envia a entrega e o áudio sobe para o Storage', async () => {
        for (const s of students) await sendTask(s.device!.page, clocks.get(s.name)!);
      });

      let anaAudio = '';
      let brunoAudio = '';
      await test.step('e. a professora vê as 3 entregas, ouve a da Ana pelo endereço assinado e revisa', async () => {
        await teacher.goto(`/professor/turma/${classId}`);
        const inbox = teacher.getByRole('region', { name: 'Para revisar' });
        await expect(inbox.getByRole('link')).toHaveCount(3);
        for (const s of students) await expect(inbox.getByRole('link', { name: new RegExp(`^${s.name} · ${SCALE.sheet.title}`) })).toBeVisible();
        const detail = await rpcOk<{ students: StatusRow[] }>(teacher, 'get_assignment', { p_assignment_id: assignmentId });
        expect(detail.students.map((r) => r.name).sort()).toEqual(['Ana', 'Bruno', 'Carla']);
        for (const r of detail.students) expect(r.submission?.audio_path, `áudio de ${r.name}`).toBeTruthy();
        anaAudio = detail.students.find((r) => r.name === 'Ana')!.submission!.audio_path!;
        brunoAudio = detail.students.find((r) => r.name === 'Bruno')!.submission!.audio_path!;

        await inbox.getByRole('link', { name: /^Ana · / }).click();
        await expect(teacher.getByRole('heading', { name: /^Ana · / })).toBeVisible();
        await expect(teacher.getByRole('region', { name: 'Gravação' })).toContainText(`0:00 / ${clocks.get('Ana')}`);
        const signed = teacher.waitForResponse((r) => r.url().includes('/storage/v1/object/sign/submissions/') && r.request().method() === 'POST');
        await teacher.getByRole('button', { name: 'Tocar gravação de Ana' }).click();
        const { signedURL } = (await (await signed).json()) as { signedURL: string };
        expect(signedURL).toContain(anaAudio);
        const audio = await fetch(new URL(`/storage/v1${signedURL}`, process.env.E2E_SUPABASE_URL).toString());
        expect(audio.status).toBe(200);
        expect(audio.headers.get('content-type')).toMatch(/^audio\/webm/);
        expect((await audio.arrayBuffer()).byteLength).toBeGreaterThan(SCALE_SECONDS * 2 * 1024);
        await expect(teacher.getByRole('button', { name: 'Pausar gravação de Ana' })).toBeVisible();

        await teacher.getByRole('group', { name: 'Conceito' }).getByRole('button', { name: 'Ótimo' }).click();
        await teacher.getByRole('textbox', { name: 'Comentário' }).fill('Som lindo! Arco reto no fim.');
        await teacher.getByRole('button', { name: 'Enviar revisão' }).click();
        await expect(teacher.getByRole('status').filter({ hasText: 'Ótimo' })).toBeVisible();
        await teacher.goto(`/professor/turma/${classId}`);
        await expect(teacher.getByRole('region', { name: 'Para revisar' }).getByRole('link')).toHaveCount(2);
      });

      await test.step('f. a Ana vê a revisão no aparelho dela', async () => {
        const page = ana.device!.page;
        await page.goto('/tarefas');
        await taskCard(page).click();
        const review = page.getByRole('group', { name: 'Revisão do professor' });
        await expect(review).toContainText('Ótimo');
        await expect(review).toContainText('Som lindo! Arco reto no fim.');
      });

      await test.step('g2. o responsável vê a revisão e ouve a entrega da Ana', async () => {
        await guardian.reload();
        await expect(guardian.getByRole('heading', { name: 'A semana de Ana' })).toBeVisible();
        const card = guardian.getByRole('region', { name: SCALE.sheet.title });
        await expect(card).toContainText('Ótimo');
        await card.getByRole('button', { name: 'Ouvir entrega' }).click();
        const audio = guardian.getByLabel(`Entrega de ${SCALE.sheet.title}`);
        await expect(audio).toHaveAttribute('src', new RegExp(`/storage/v1/object/sign/submissions/${anaAudio}\\?token=`));
        await audio.evaluate(async (el: HTMLAudioElement) => {
          el.muted = true;
          await el.play();
        });
        await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0);
      });

      await test.step('h2. o que o Storage NÃO entrega: outra professora, o colega e o responsável de outro aluno', async () => {
        await expectAudioDenied(other, anaAudio, 'outra professora, áudio da Ana');
        await expectAudioDenied(bruno.device!.page, anaAudio, 'o Bruno, áudio da Ana');
        await expectAudioDenied(guardian, brunoAudio, 'o responsável da Ana, áudio do Bruno');
        // O dono lê o próprio (a policy nega por quem pede, não o bucket inteiro)
        const own = await storageTry(bruno.device!.page, brunoAudio);
        expect({ sign: own.sign, read: own.read }).toEqual({ sign: 200, read: 200 });
        expect(own.readType).toMatch(/^audio\/webm/);
        expect(own.readBytes).toBeGreaterThan(SCALE_SECONDS * 2 * 1024);
      });
    } finally {
      await Promise.all(students.map((s) => s.device?.browser.close()));
    }
  });
});

test.describe('ciclo 5 no celular: o aluno entra e entrega', () => {
  test.skip(({ isMobile }) => !isMobile, 'no desktop a história inteira (acima)');

  test('entra com código + nome + PIN (errando antes) e entrega a tarefa com o áudio', async ({
    newDevice,
    playwright,
    baseURL,
    viewport,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    userAgent,
    locale,
  }) => {
    test.setTimeout(5 * 60 * 1000);
    // A turma e a tarefa pelo contrato, com a sessão da professora: as telas dela ficam no desktop
    const teacher = await newDevice();
    await teacherAccount(teacher, unique('professora-celular'));
    const klass = await rpcOk<{ id: string; code: string }>(teacher, 'create_class', { p_name: 'Turma do celular' });
    const { pin } = await rpcOk<{ pin: string }>(teacher, 'add_student', { p_class_id: klass.id, p_name: 'Duda' });
    await rpcOk(teacher, 'create_assignment', {
      p_class_id: klass.id,
      p_song_id: SCALE.sheet.id,
      p_level: 'easy',
      p_mode: 'arcade',
      p_due_at: new Date(Date.now() + 7 * 86400e3).toISOString(),
      p_instruction_key: 'tocar-inteira',
      p_instruction_text: null,
    });
    const code = `${klass.code.slice(0, 4)}-${klass.code.slice(4)}`;

    const student = await studentDevice(playwright, { baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, locale });
    try {
      const page = student.page;
      await test.step('c. PIN errado dá a mensagem neutra; o certo abre as tarefas', async () => {
        await enterClass(page, code, 'Duda', wrongPin(pin));
        await expect(page.getByRole('alert')).toHaveText(NEUTRAL, { timeout: LOGIN_TIMEOUT });
        await typeLogin(page, 'Duda', pin);
        await expect(page).toHaveURL(/\/tarefas$/, { timeout: LOGIN_TIMEOUT });
        await expect(taskCard(page)).toBeVisible();
      });
      const shown = await test.step('d1. joga a tarefa com o WAV gravando; a partida conta', () => playTask(page));
      await requireStorage();
      await test.step('d2. a entrega sobe com o áudio', () => sendTask(page, shown));
    } finally {
      await student.browser.close();
    }
  });
});
