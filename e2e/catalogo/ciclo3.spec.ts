import { randomUUID } from 'node:crypto';
import { test, type Page } from '@playwright/test';
import { BADGES } from '../../src/game/engine/badges';
import type { BadgeId, GameResult } from '../../src/game/engine/types';
import { LOGIN_LINK_SENT } from '../../src/services/account';
import { chooseSong } from '../choose';
import {
  accountSession,
  createAccountFromPrompt,
  expect,
  linkFromMail,
  myRankingName,
  newDevice,
  queued,
  queuedPlays,
  SECONDS,
  serverRows,
  SHORTEST,
  storedSession,
} from './aparelho';

/**
 * O critério de pronto do ciclo 3 contado como a história de um jogador, contra o Supabase local: joga sem conta,
 * joga sem internet, cria conta pelo convite do ranking sem perder nada, entra em outro aparelho, encontra um segundo
 * jogador no ranking (só pelo nome gerado) e o desafia. Os detalhes de cada tela ficam nos specs de cada floor
 * (conta, fila, ranking, selos, desafio); aqui vale o caminho inteiro, pelo menu, no modo padrão (Cordas 3D).
 */
test.use({ storageState: { cookies: [], origins: [] } });

const TITLE = new RegExp(`^${SHORTEST.sheet.title.replace(/[()]/g, '\\$&')}$`);
const RANKING = `/ranking?musica=${SHORTEST.sheet.id}&nivel=facil&periodo=semana`;
const BACK_TO_RANKING = new RegExp(`/ranking\\?musica=${SHORTEST.sheet.id}`);
const points = (n: number) => new Intl.NumberFormat('pt-BR').format(n);

/** O que o submit_play respondeu (a fila manda; a tela mostra o que o servidor confirmou). */
interface Submitted {
  duplicate: boolean;
  record: { previous: number | null; improved: boolean } | null;
  badges: BadgeId[];
}

const submitted = (page: Page) =>
  page.waitForResponse((r) => r.url().includes('/rpc/submit_play') && r.ok(), { timeout: (SECONDS + 60) * 1000 }).then((r) => r.json() as Promise<Submitted>);

const lastScore = async (page: Page) => (await page.evaluate(() => (window as Window & { __vhResult?: GameResult }).__vhResult))!.score;

/** Até a partida terminar: o modo padrão vai para /jogo/3d e termina no selo novo ou no resultado. */
async function untilTheEnd(page: Page) {
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.getByRole('button', { name: /Pular contagem/ }).click();
  await expect(page).toHaveURL(/\/jogo\/3d$/);
  await expect(page).toHaveURL(/\/(selo-novo|resultado)$/, { timeout: (SECONDS + 20) * 1000 });
}

/** Pelo menu, como o jogador: Tocar → Cordas 3D (já marcado) → a mais curta no Fácil, com o ouvido simulado. */
async function playFromMenu(page: Page) {
  await page.goto('/?ouvido=simulado');
  await chooseSong(page, TITLE, 'Cordas 3D', 'easy');
  await untilTheEnd(page);
}

test('ciclo 3: convidado joga, joga offline, cria conta, entra em outro aparelho, vê o outro no ranking e desafia', async ({
  browser,
  baseURL,
  viewport,
  isMobile,
  hasTouch,
  deviceScaleFactor,
}) => {
  test.setTimeout((4 * SECONDS + 360) * 1000);
  const device = { baseURL, viewport, isMobile, hasTouch, deviceScaleFactor };
  const tag = randomUUID().slice(0, 8);
  const emails = [`ciclo3-a-${tag}@t.test`, `ciclo3-b-${tag}@t.test`];
  const a = await newDevice(browser, device);
  const guestId = (await storedSession(a)).user.id;
  const badges = new Set<BadgeId>();
  let best = 0;

  await test.step('a. o convidado joga uma partida inteira e vê recorde e selo do servidor', async () => {
    const answer = submitted(a);
    await playFromMenu(a);
    const first = await answer;
    expect(first.duplicate).toBe(false);
    expect(first.record).toEqual({ previous: null, improved: true });
    expect(first.badges.length, 'a primeira partida inteira dá selo').toBeGreaterThan(0);
    first.badges.forEach((id) => badges.add(id));
    const featured = [...BADGES].reverse().find((b) => first.badges.includes(b.id))!;
    await expect(a).toHaveURL(/\/selo-novo$/);
    await expect(a.getByRole('heading', { name: `Selo novo: ${featured.label}` })).toBeVisible();
    await a.getByRole('link', { name: /Ver resultado/ }).click();
    await expect(a.getByRole('status').filter({ hasText: 'Novo recorde!' })).toBeVisible();
    best = await lastScore(a);
    await expect(a.getByTestId('resultado')).toContainText(points(best));
    await expect.poll(() => queued(a), { message: 'a partida subiu pela fila' }).toBe(0);
  });

  await test.step('b. sem internet joga outra; a rede volta e a partida chega a violinhero.plays sem recarregar', async () => {
    await a.goto('/?ouvido=simulado');
    await chooseSong(a, TITLE, 'Cordas 3D', 'easy');
    await a.getByRole('button', { name: /Começar/ }).click();
    await a.getByRole('button', { name: /Pular contagem/ }).click();
    await expect(a).toHaveURL(/\/jogo\/3d$/);
    await a.context().setOffline(true);
    await expect(a).toHaveURL(/\/(selo-novo|resultado)$/, { timeout: (SECONDS + 20) * 1000 });
    await expect.poll(() => queuedPlays(a), { message: 'a partida espera no aparelho' }).toHaveLength(1);
    const [clientId] = await queuedPlays(a);
    best = Math.max(best, await lastScore(a));
    // Marca a página: se ela recarregar, a marca some
    await a.evaluate(() => ((window as Window & { __sameLoad?: boolean }).__sameLoad = true));
    const answer = submitted(a);
    await a.context().setOffline(false);
    (await answer).badges.forEach((id) => badges.add(id));
    await expect.poll(() => queued(a), { message: 'a fila esvazia quando a rede volta' }).toBe(0);
    expect(await serverRows(a, `plays?select=client_id,song_id,level,mode,finished&client_id=eq.${clientId}`)).toEqual([
      { client_id: clientId, song_id: SHORTEST.sheet.id, level: 'easy', mode: 'strings3d', finished: true },
    ]);
    expect(await a.evaluate(() => (window as Window & { __sameLoad?: boolean }).__sameLoad), 'sem recarregar').toBe(true);
  });

  await test.step('c. cria conta pelo convite do ranking: o mesmo usuário, com recorde, selos e sequência', async () => {
    await a.goto(RANKING);
    await expect(a.getByText(/Você está jogando sem conta/)).toBeVisible();
    await createAccountFromPrompt(a, 'Quer aparecer no ranking?', emails[0], BACK_TO_RANKING);
    expect((await storedSession(a)).user.id).toBe(guestId);
    expect(await serverRows(a, `records?select=score&song_id=eq.${SHORTEST.sheet.id}&level=eq.easy`)).toEqual([{ score: best }]);
    expect((await serverRows<{ badge_id: BadgeId }>(a, 'badges_earned?select=badge_id')).map((r) => r.badge_id).sort()).toEqual([...badges].sort());
    expect(await serverRows(a, 'streaks?select=current_days')).toEqual([{ current_days: 1 }]);
    // Já com conta, as partidas de convidado contam: ele aparece no ranking da semana
    await myRankingName(a);
  });

  await test.step('d. outro aparelho entra na mesma conta e vê o mesmo progresso (Perfil, Selos)', async () => {
    const other = await newDevice(browser, device);
    await other.goto('/entrar');
    await other.getByRole('button', { name: 'Entrar com e-mail' }).click();
    await other.getByLabel('E-mail').fill(emails[0]);
    await other.getByRole('button', { name: 'Mandar link' }).click();
    await expect(other.getByRole('status')).toHaveText(LOGIN_LINK_SENT);
    await other.goto(await linkFromMail(emails[0], 2));
    await expect(other.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
    expect((await accountSession(other)).user.id).toBe(guestId);
    await other.goto('/perfil');
    await expect(other.getByRole('region', { name: 'Sequência' })).toContainText('1 dia');
    await expect(other.getByText(`${badges.size} / ${BADGES.length} selos`)).toBeVisible();
    await other.goto('/selos');
    await expect(other.getByRole('progressbar', { name: 'Selos conquistados' })).toHaveAttribute('aria-valuenow', String(badges.size));
    for (const id of badges) {
      const label = BADGES.find((b) => b.id === id)!.label;
      const cell = other.getByRole('listitem').filter({ has: other.getByRole('img', { name: `Selo ${label}`, exact: true }) });
      await expect(cell).toContainText(`${SHORTEST.sheet.title} (Fácil)`);
    }
    await other.context().close();
  });

  const b = await newDevice(browser, device);
  const names: string[] = [];
  await test.step('e. uma segunda conta joga a mesma música e nível; as duas se veem no ranking só pelo nome gerado', async () => {
    // Tudo o que o ranking manda para cada aparelho, para conferir que nenhum e-mail vem do servidor
    const sent: string[] = [];
    for (const page of [a, b]) page.on('response', (r) => void (r.url().includes('/rpc/get_ranking') && r.text().then((t) => sent.push(t))));
    await playFromMenu(b);
    await expect.poll(() => queued(b), { message: 'a partida subiu pela fila' }).toBe(0);
    await b.goto(RANKING);
    await expect(b.getByText(/Você está jogando sem conta/)).toBeVisible();
    await createAccountFromPrompt(b, 'Quer aparecer no ranking?', emails[1], BACK_TO_RANKING);
    // A segue no ranking desde o passo c: recarrega para ver quem entrou depois
    await a.reload();
    names.push(await myRankingName(a), await myRankingName(b));
    expect(names[1]).not.toBe(names[0]);
    await expect(b.getByText(names[0], { exact: true })).toBeVisible();
    await expect(a.getByText(names[1], { exact: true })).toBeVisible();
    for (const page of [a, b]) {
      await expect(page.locator('main')).not.toContainText('@');
      await expect(page.locator('main')).not.toContainText(/ciclo3-[ab]-/);
    }
    expect(sent.length).toBeGreaterThan(0);
    for (const body of sent) expect(body).not.toMatch(/@|ciclo3-[ab]-/);
  });

  await test.step('f. a primeira cria um desafio, a segunda abre o link, aceita e joga; o resultado aparece para as duas', async () => {
    await a.goto('/desafio');
    const choice = a.getByRole('combobox', { name: 'Música e nível' });
    await expect(choice).toContainText(SHORTEST.sheet.title);
    await expect(choice).toContainText('Fácil');
    await a.getByRole('button', { name: '1 dia' }).click();
    await a.getByRole('button', { name: /Criar desafio/ }).click();
    const path = new URL(await a.getByRole('textbox', { name: 'Link do desafio' }).inputValue()).pathname;

    // O ouvido simulado vem pela URL de entrada: o link aberto num aparelho que toca sozinho
    await b.goto(`${path}?ouvido=simulado`);
    await expect(b.getByRole('heading', { level: 1 })).toHaveText(`${names[0]} te desafiou`);
    await b.getByRole('button', { name: /Aceitar desafio/ }).click();
    const placarB = b.getByRole('region', { name: 'Placar do desafio' });
    await expect(placarB).toContainText('Ainda sem partida que conte');
    const answer = submitted(b);
    await b.getByRole('link', { name: /Tocar agora/ }).click();
    await expect(b).toHaveURL(/\/afinar(\?.*)?$/, { timeout: 15000 });
    await untilTheEnd(b);
    await answer;
    const score = await lastScore(b);
    await expect.poll(() => queued(b), { message: 'a partida subiu pela fila' }).toBe(0);

    // Antes do prazo, só passar o placar decide (empate e derrota esperam o fim); a pontuação dela aparece já
    const won = score > best;
    await b.goto(path);
    await expect(placarB).toContainText(won ? 'Você venceu!' : 'Ainda dá para passar');
    await expect(placarB.locator('[aria-current="true"]')).toContainText(points(score));
    await a.goto(path);
    await expect(a.getByRole('heading', { name: 'Seu desafio' })).toBeVisible();
    const placarA = a.getByRole('region', { name: 'Placar do desafio' });
    await expect(placarA).toContainText(`${points(best)} a bater`);
    await expect(placarA).toContainText(names[1]);
    await expect(placarA).toContainText(points(score));
    await expect(placarA).toContainText(won ? 'Passou você' : 'Ainda tentando');
    for (const page of [a, b]) await expect(page.locator('main')).not.toContainText(/@|ciclo3-[ab]-/);
  });
});
