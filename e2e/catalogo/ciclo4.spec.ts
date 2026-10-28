import path from 'node:path';
import type { BrowserContext, BrowserContextOptions, Page, PlaywrightWorkerArgs } from '@playwright/test';
import { BADGES } from '../../src/game/engine/badges';
import type { BadgeId } from '../../src/game/engine/types';
import type { Song } from '../../src/game/notation/song';
import { DEVICE_DB_NAME, DEVICE_DB_VERSION, SONGS_STORE } from '../../src/services/deviceDb';
import type { CachedSong } from '../../src/services/songCache';
import { chooseSong } from '../choose';
import { microphoneArgs, warmAudio } from '../microphone';
import { expect, queued, serverRows, storedSession, test } from './aparelho';

/**
 * O critério de pronto do ciclo 4 contra o Supabase local de verdade, sem o fake do importador: as 5 partituras reais
 * entram pela tela /importar e pela Edge Function import-song, ficam só do dono, a escala escrita e a ditada são
 * gravadas pela mesma função e tocam, e apagar uma importada não leva os selos ganhos nela. Os detalhes de cada tela
 * (layout, temas, erros por código) ficam em e2e/importar, e2e/editor e e2e/ditado.
 *
 * Os jogadores daqui são novos, nunca a sessão da suíte (sessao.setup.ts): música dela apareceria na Biblioteca e
 * na seleção dos outros specs (titulo-longo e partidas contam as 10 do catálogo). O newDevice herda o storageState
 * do projeto: sem o test.use abaixo, todo "aparelho novo" seria a mesma sessão da suíte.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const FIXTURES = path.resolve(import.meta.dirname, '../../content/import-fixtures');

/** Arquivo, título que a função dá e a parte que ela escolhe sozinha (nenhuma das 5 tem dois violinos). */
const REAL_SCORES = [
  { file: 'lehmann-the-yellowhammer.mxl', title: 'The Yellowhammer', part: 'Voice' },
  { file: 'brahms-heimweh-1.musicxml', title: 'Heimweh I', part: 'Singstimme Voice' },
  { file: 'baltzar-prelude.mid', title: 'baltzar prelude', part: 'one' },
  { file: 'soldiers-joy.mid', title: 'soldiers joy', part: 'one' },
  { file: 'red-apple-rag.abc', title: 'Red Apple Rag', part: 'Red Apple Rag' },
] as const;

/** A mais curta das 5 no Fácil (36 s): a que é jogada inteira e depois apagada. */
const SHORT_SCORE = REAL_SCORES[3];

/** Dois violinos (Violino I e II), como o de scripts/test-functions.mjs: o único caso em que a função pede a parte. */
const TWO_VIOLINS =
  `<score-partwise><part-list><score-part id="P1"><part-name>Violin I</part-name></score-part>` +
  `<score-part id="P2"><part-name>Violin II</part-name></score-part></part-list>` +
  ['A5', 'D5']
    .map(
      (p, i) =>
        `<part id="P${i + 1}"><measure number="1"><attributes><divisions>1</divisions><key><fifths>2</fifths></key>` +
        `<time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>${p[0]}</step><octave>${p[1]}</octave></pitch>` +
        `<duration>4</duration></note></measure></part>`
    )
    .join('') +
  `</score-partwise>`;

/** A escala de Ré maior do WAV do ditado: as 8 notas da subida e a descida (15 semínimas). */
const D_MAJOR = [62, 64, 66, 67, 69, 71, 73, 74];
const UP_AND_DOWN = [...D_MAJOR, ...D_MAJOR.slice(0, -1).reverse()];

const CATALOG_ASSETS = path.resolve(import.meta.dirname, '../../dist-catalogo/assets');
const exact = (title: string) => new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

/**
 * Nesta máquina o edge runtime do supabase start não sobe (o Docker não resolve DNS para baixar o npm: da função):
 * E2E_FUNCTIONS_URL aponta a mesma função rodando no Deno da máquina. Na CI fica vazio e o app chama pelo Kong.
 */
async function localFunctions(context: BrowserContext) {
  const target = process.env.E2E_FUNCTIONS_URL;
  if (!target) return;
  await context.route(`${process.env.E2E_SUPABASE_URL}/functions/v1/**`, (route) =>
    route.continue({ url: route.request().url().replace(/^.*\/functions\/v1\/[^/?]+/, target.replace(/\/$/, '')) })
  );
}

/** A ficha da música no servidor, com o token do jogador da página (a RLS decide o que vem). */
const songRow = (page: Page, id: string) =>
  serverRows<{ id: string; origin: string; visibility: string; owner_id: string }>(page, `songs?select=id,origin,visibility,owner_id&id=eq.${id}`);

/** Os níveis gravados da música e, de cada um, a Song (song_charts). */
const charts = (page: Page, id: string) => serverRows<{ level: string; chart: Song }>(page, `song_charts?select=level,chart&song_id=eq.${id}&order=level`);

/** A melodia como (tempo desde o início, duração, nota): compara a Song sem depender de onde caem as barras. */
const melody = (song: Song) => {
  let start = 0;
  return song.measures.flatMap((m) => {
    const notes = m.notes.map((n) => ({ at: start + n.beat, beats: n.beats, midi: n.midi }));
    start += m.beats;
    return notes;
  });
};

/** O id da música que o "Jogar agora" abre (/tocar?musica=…). */
async function playNowId(page: Page): Promise<string> {
  const link = page.getByRole('link', { name: /Jogar agora/ });
  await expect(link).toBeVisible({ timeout: 60000 });
  const id = new URL((await link.getAttribute('href'))!, 'http://x').searchParams.get('musica');
  expect(id, 'id da música salva').toMatch(/^[0-9a-f-]{36}$/);
  return id!;
}

/** Envia o arquivo pela tela /importar e espera a prévia (a função converte no servidor: o Brahms tem 356 KB). */
async function importOnScreen(page: Page, file: string | { name: string; buffer: Buffer }) {
  const input = page.getByLabel('Escolher partitura');
  await expect(input).toBeEnabled();
  if (typeof file === 'string') await input.setInputFiles(path.join(FIXTURES, file));
  else await input.setInputFiles({ name: file.name, mimeType: 'application/xml', buffer: file.buffer });
}

/** O cartão da música na Biblioteca. */
const card = (page: Page, title: string) =>
  page.getByRole('list', { name: 'Músicas' }).getByRole('listitem').filter({ has: page.getByText(exact(title)) });

/** Da Biblioteca até afinar: o cartão abre a escolha de modo com a música escolhida e o carregando busca o chart. */
async function openFromLibrary(page: Page, title: string) {
  await card(page, title).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Escolha o modo');
  await page.getByRole('button', { name: /Continuar com/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Músicas' }).getByRole('radio', { name: exact(title) })).toBeChecked();
  await page.getByRole('complementary', { name: 'Detalhes da música' }).getByRole('link', { name: /Tocar/ }).click();
  await expect(page).toHaveURL(/\/afinar(\?.*)?$/, { timeout: 20000 });
}

/** Joga a música inteira no Arcade, Fácil, com o ouvido simulado; termina com a partida no servidor. */
async function playWhole(page: Page, title: string, seconds: number) {
  await page.goto('/?ouvido=simulado');
  await chooseSong(page, exact(title), 'Arcade', 'easy');
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.getByRole('button', { name: /Pular contagem/ }).click();
  await expect(page).toHaveURL(/\/(selo-novo|resultado)$/, { timeout: (seconds + 30) * 1000 });
  await expect.poll(() => queued(page), { message: 'a partida sobe pela fila' }).toBe(0);
}

test.describe('ciclo 4: as 5 partituras reais e a privacidade', () => {
  test.skip(({ isMobile }) => isMobile, 'importar e a privacidade só no desktop (o layout da tela fica no e2e/importar)');

  test('as 5 importadas pela tela, uma a uma, entram na Biblioteca com 3 níveis e abrem para jogar; o outro jogador não vê nenhuma', async ({
    newDevice,
  }) => {
    test.setTimeout(8 * 60 * 1000);
    const page = await newDevice();
    await localFunctions(page.context());
    const owner = (await storedSession(page)).user.id;
    const ids: string[] = [];

    for (const { file, title, part } of REAL_SCORES) {
      await test.step(`a. ${file}`, async () => {
        await page.goto('/importar?ouvido=simulado');
        await importOnScreen(page, file);
        const id = await playNowId(page);
        ids.push(id);
        await expect(page.getByRole('alert')).toHaveCount(0);
        const facts = page.getByRole('region', { name: 'Revisar música' });
        await expect(facts.getByText('Título', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText(title);
        await expect(facts.getByText('Parte escolhida', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText(part);
        await expect(facts.getByText('Níveis gerados', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText('Fácil · Médio · Difícil');
        await expect(page.getByText(/Só você vê esta música/)).toBeVisible();
        expect(await songRow(page, id)).toEqual([{ id, origin: 'imported', visibility: 'private', owner_id: owner }]);
        expect((await charts(page, id)).map((c) => c.level)).toEqual(['easy', 'medium', 'hard']);

        await page.getByRole('link', { name: 'Ver na Biblioteca' }).click();
        await expect(page).toHaveURL(/\/biblioteca/);
        await expect(card(page, title)).toContainText('Importada · Só você');
        await expect(card(page, title)).toContainText('Fácil · Médio · Difícil');
        await openFromLibrary(page, title);
      });
    }

    await test.step('a. dois violinos: a função devolve as partes e a tela grava a escolhida', async () => {
      await page.goto('/importar?ouvido=simulado');
      await importOnScreen(page, { name: 'dois-violinos.musicxml', buffer: Buffer.from(TWO_VIOLINS) });
      await expect(page.getByRole('heading', { name: 'Escolha a parte' })).toBeVisible({ timeout: 60000 });
      await expect(page.getByRole('button', { name: /^Violin I · .* · Cabe no violino$/ })).toBeVisible();
      await page.getByRole('button', { name: /^Violin II · .* · Cabe no violino$/ }).click();
      const id = await playNowId(page);
      ids.push(id);
      const facts = page.getByRole('region', { name: 'Revisar música' });
      await expect(facts.getByText('Parte escolhida', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText('Violin II');
      const [easy] = await charts(page, id);
      expect(melody(easy.chart).map((n) => n.midi)).toEqual([74]);
    });

    await test.step('b. outro jogador, em outro aparelho, não vê nenhuma na Biblioteca nem abre pelo id', async () => {
      const other = await newDevice();
      expect((await storedSession(other)).user.id).not.toBe(owner);
      await other.goto('/biblioteca');
      await expect(other.getByRole('list', { name: 'Músicas' }).getByRole('listitem').first()).toBeVisible();
      for (const { title } of REAL_SCORES) await expect(card(other, title)).toHaveCount(0);
      await expect(other.getByText('Importada · Só você')).toHaveCount(0);
      for (const id of ids) {
        expect(await songRow(other, id), `songs ${id}`).toEqual([]);
        expect(await charts(other, id), `song_charts ${id}`).toEqual([]);
        expect(await serverRows(other, `song_sources?select=format&song_id=eq.${id}`), `song_sources ${id}`).toEqual([]);
      }
      // Pelo link direto do carregando, como quem recebeu o id de alguém: o get_song não devolve a música
      await other.goto(`/tocar/carregando?modo=arcade&musica=${ids[0]}&nivel=facil`);
      await expect(other.getByRole('alert')).toContainText('Não encontramos essa música nesse nível.');
      await expect(other.getByText(REAL_SCORES[0].title)).toHaveCount(0);
    });
  });
});

/** c. A escala escrita no editor, salva pela função de verdade, sai no banco como música do editor e toca inteira. */
async function writeScale(page: Page, title: string) {
  await page.goto('/editor');
  await page.getByRole('textbox', { name: 'Título da música' }).fill(title);
  await page.getByRole('group', { name: /Pauta/ }).focus();
  await page.keyboard.type('defgabcd');
  await expect(page.getByTestId('nota')).toHaveCount(8);
  await page.getByRole('button', { name: /^Salvar/ }).click();
  await expect(page.getByText(/Só você vê esta música/)).toBeVisible({ timeout: 60000 });
  const id = await playNowId(page);

  const [row] = await songRow(page, id);
  expect(row).toMatchObject({ id, origin: 'editor', visibility: 'private', owner_id: (await storedSession(page)).user.id });
  const saved = await charts(page, id);
  expect(saved.length).toBeGreaterThan(0);
  for (const { chart } of saved) expect(melody(chart).map((n) => n.midi)).toEqual(D_MAJOR);

  const seconds = Math.ceil((8 * 60) / saved[0].chart.bpm);
  await playWhole(page, title, seconds);
  expect(await serverRows(page, `plays?select=song_id,level,finished&song_id=eq.${id}`)).toEqual([{ song_id: id, level: 'easy', finished: true }]);
}

/** As músicas que o salvar deixou no aparelho (IndexedDB): a Song e o nível que o editor mandou para a função. */
async function savedSongs(page: Page): Promise<CachedSong[]> {
  return page.evaluate(
    ([name, version, store]) =>
      new Promise<CachedSong[]>((resolve, reject) => {
        const open = indexedDB.open(name, version);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction(store, 'readonly').objectStore(store).getAll();
          request.onsuccess = () => resolve(request.result as CachedSong[]);
          request.onerror = () => reject(request.error);
        };
      }),
    [DEVICE_DB_NAME, DEVICE_DB_VERSION, SONGS_STORE] as const
  );
}

/**
 * d. A escala ditada pelo WAV no lugar do microfone, salva pela função: as mesmas 15 notas na Song gravada no banco.
 * Navegador próprio (o WAV é do navegador), com a sessão do aparelho em `options.storageState` (o mesmo jogador).
 */
async function dictateScale(playwright: PlaywrightWorkerArgs['playwright'], options: BrowserContextOptions, title: string) {
  const browser = await playwright.chromium.launch({ args: microphoneArgs('escala-re-maior', { loop: false }) });
  try {
    const context = await browser.newContext({ ...options, permissions: ['microphone'] });
    await context.addInitScript(() => localStorage.setItem('vh:onboarded', '1'));
    await localFunctions(context);
    const page = await context.newPage();
    // O WAV começa ao abrir o microfone, com o primeiro tempo 2,1 s depois: em 2/4 a ♩ = 60 a contagem de 1 compasso
    // dura 2 s e o ditado começa junto com a escala (como no e2e/ditado.spec.ts)
    await warmAudio(page, CATALOG_ASSETS);
    await page.goto('/editor/ditar');
    // A escala escrita no passo c foi salva: o rascunho dela não volta (o storageState leva o localStorage do jogador),
    // senão o ditado entra depois das 8 notas dela
    await expect(page.getByRole('region', { name: 'Ditado pelo microfone' })).toBeVisible();
    await expect(page.getByTestId('nota')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Compasso' }).selectOption('2/4');
    await page.getByRole('combobox', { name: 'Andamento' }).selectOption('60');
    await page.getByRole('textbox', { name: 'Título da música' }).fill(title);
    const panel = page.getByRole('region', { name: 'Ditado pelo microfone' });
    await page.getByRole('button', { name: 'Começar ditado' }).click();
    await expect(panel).toContainText('Ouvindo…', { timeout: 5000 });
    await expect(page.getByTestId('nota')).toHaveCount(UP_AND_DOWN.length, { timeout: 25000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tab', { name: /Na pauta/ })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('button', { name: /^Salvar/ }).click();
    await expect(page.getByText(/Só você vê esta música/)).toBeVisible({ timeout: 60000 });
    const id = await playNowId(page);
    const [kept] = (await savedSongs(page)).filter((s) => s.song.id === id);
    expect(kept, 'a música salva ficou no aparelho').toBeDefined();
    expect(await songRow(page, id)).toEqual([expect.objectContaining({ id, origin: 'editor', visibility: 'private' })]);
    // O nível em que o editor salvou guarda o ditado como veio: as 15 semínimas, uma por tempo
    const stored = (await charts(page, id)).find((c) => c.level === kept.song.level);
    expect(stored, `chart ${kept.song.level} no banco`).toBeDefined();
    expect(melody(stored!.chart)).toEqual(UP_AND_DOWN.map((midi, at) => ({ at, beats: 1, midi })));
  } finally {
    await browser.close();
  }
}

/**
 * e. Apagar uma importada tira da Biblioteca e do servidor; os selos ganhos nela ficam. Primeiro passo do jogador: os
 * selos dele são só os desta música (a primeira partida inteira dá selo).
 */
async function deleteImported(page: Page) {
  await page.goto('/importar');
  await importOnScreen(page, SHORT_SCORE.file);
  const id = await playNowId(page);
  const [easy] = (await charts(page, id)).filter((c) => c.level === 'easy');
  const seconds = Math.ceil(melody(easy.chart).reduce((end, n) => Math.max(end, n.at + n.beats), 0) * (60 / easy.chart.bpm));

  await playWhole(page, SHORT_SCORE.title, seconds);
  const earned = async () => (await serverRows<{ badge_id: BadgeId }>(page, 'badges_earned?select=badge_id')).map((r) => r.badge_id).sort();
  const badges = await earned();
  expect(badges.length, 'a primeira partida inteira dá selo').toBeGreaterThan(0);
  expect(await serverRows(page, `plays?select=song_id&song_id=eq.${id}`)).toHaveLength(1);

  await page.goto('/biblioteca');
  await page.getByRole('button', { name: `Apagar ${SHORT_SCORE.title}` }).click();
  await page.getByRole('dialog', { name: 'Apagar música?' }).getByRole('button', { name: 'Apagar música', exact: true }).click();
  await expect(card(page, SHORT_SCORE.title)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Músicas' }).getByRole('listitem').first()).toBeVisible();
  await expect(card(page, SHORT_SCORE.title)).toHaveCount(0);
  expect(await songRow(page, id)).toEqual([]);
  expect(await serverRows(page, `plays?select=song_id&song_id=eq.${id}`)).toEqual([]);

  expect(await earned()).toEqual(badges);
  await page.goto('/perfil');
  await expect(page.getByText(`${badges.length} / ${BADGES.length} selos`)).toBeVisible();
  await page.goto('/selos');
  await expect(page.getByRole('progressbar', { name: 'Selos conquistados' })).toHaveAttribute('aria-valuenow', String(badges.length));
  for (const badge of badges) {
    const label = BADGES.find((b) => b.id === badge)!.label;
    await expect(page.getByRole('listitem').filter({ has: page.getByRole('img', { name: `Selo ${label}`, exact: true }) })).toContainText('Ganho em');
  }
}

// Um jogador só para apagar, escrever e ditar: cada aparelho novo é um login anônimo a mais na rodada (o limite por
// hora por IP do Supabase local está em supabase/config.toml)
test('ciclo 4: apagar uma importada mantém os selos; a escala escrita e a ditada são salvas pela função', async ({
  newDevice,
  playwright,
  baseURL,
  viewport,
  deviceScaleFactor,
  isMobile,
  hasTouch,
  userAgent,
  locale,
}, info) => {
  test.setTimeout(6 * 60 * 1000);
  const page = await newDevice();
  await localFunctions(page.context());
  await test.step('e. apagar uma importada: some da Biblioteca e do servidor, os selos ficam no Perfil e em Selos', () => deleteImported(page));
  await test.step('c. escrever a escala no editor, salvar e jogar inteira', () => writeScale(page, `Escala escrita ${info.project.name}`));
  await test.step('d. ditar a escala com o WAV no microfone e conferir as notas na Song do banco', async () => {
    const storageState = await page.context().storageState();
    const options = { baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, locale, storageState };
    await dictateScale(playwright, options, `Escala ditada ${info.project.name}`);
  });
});
