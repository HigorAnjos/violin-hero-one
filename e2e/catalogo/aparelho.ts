import { expect as baseExpect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { songDurationSeconds } from '../../src/game/notation/song';
import { LINK_EMAIL_SENT } from '../../src/services/account';
import { DEVICE_DB_NAME, PLAYS_STORE } from '../../src/services/deviceDb';
import { chooseSong } from '../choose';
import { CATALOG } from './catalogo';

// O Kong do Supabase local às vezes segura por ~7 s as primeiras chamadas de uma página nova, e o primeiro e-mail
// do GoTrue leva o mesmo: 5 s não bastam
export const expect = baseExpect.configure({ timeout: 20000 });

/** A caixa local do supabase start (Mailpit), onde chega o link mágico. */
export const MAILPIT = process.env.E2E_MAILPIT_URL || 'http://127.0.0.1:54324';

/** A mais curta da estante no Fácil: a partida toca em tempo real. */
export const SHORTEST = [...CATALOG].sort((a, b) => songDurationSeconds(a.charts.easy) - songDurationSeconds(b.charts.easy))[0];
export const SECONDS = songDurationSeconds(SHORTEST.charts.easy);

export interface StoredSession {
  access_token: string;
  user: { id: string; is_anonymous?: boolean };
}

/** A sessão que o supabase-js guardou no aparelho (espera o login anônimo do primeiro toque). */
export async function storedSession(page: Page): Promise<StoredSession> {
  let found: StoredSession | null = null;
  await expect
    .poll(
      async () => {
        found = await page.evaluate(() => {
          const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k));
          return key ? (JSON.parse(localStorage.getItem(key)!) as StoredSession) : null;
        });
        return found?.user.id ?? null;
      },
      { message: 'sessão no aparelho', timeout: 25000 }
    )
    .not.toBeNull();
  return found!;
}

/**
 * A sessão da conta, assim que o app trocar a anônima pela do link mágico. A URL de volta chega antes de o
 * supabase-js gravar a sessão nova: ler na hora devolve o convidado de antes.
 */
export async function accountSession(page: Page): Promise<StoredSession> {
  await expect
    .poll(async () => (await storedSession(page)).user.is_anonymous ?? false, { message: 'sessão da conta no aparelho' })
    .toBe(false);
  return storedSession(page);
}

/** O client_id das partidas esperando na fila do aparelho (IndexedDB do ciclo3-sync). */
export const queuedPlays = (page: Page) =>
  page.evaluate(
    ([name, store]) =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction(store, 'readonly').objectStore(store).getAll();
          all.onsuccess = () => resolve((all.result as { clientId: string }[]).map((p) => p.clientId));
          all.onerror = () => reject(all.error);
        };
      }),
    [DEVICE_DB_NAME, PLAYS_STORE] as const
  );

/** Quantas partidas esperam na fila do aparelho. */
export const queued = async (page: Page) => (await queuedPlays(page)).length;

/**
 * Linhas de uma tabela do schema violinhero pelo PostgREST, com o token do jogador da página: a RLS decide o que vem.
 * `query`: tabela e filtros, ex. `plays?select=client_id&client_id=eq.…`.
 */
export const serverRows = <T = Record<string, unknown>>(page: Page, query: string) =>
  page.evaluate(
    async ([url, key, q]) => {
      const token = Object.entries(localStorage).find(([k]) => /^sb-.+-auth-token$/.test(k))?.[1];
      const access = token ? (JSON.parse(token) as { access_token: string }).access_token : '';
      const res = await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${access}`, 'Accept-Profile': 'violinhero' } });
      if (!res.ok) throw new Error(`${q}: ${res.status} ${await res.text()}`);
      return res.json();
    },
    [process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, query] as const
  ) as Promise<T[]>;

/** O nome público gerado (bicho + número) que o ranking e o desafio mostram no lugar do e-mail. */
export const GENERATED_NAME = /(Raposa|Pinguim|Gato|Violinista) \d{4}/;

/**
 * Aparelho novo: contexto próprio (sem a sessão do sessao.setup.ts), convidado anônimo do primeiro toque. `options`:
 * o tamanho e o toque do projeto (viewport, isMobile, hasTouch…), que o browser.newContext não herda.
 */
export async function newDevice(browser: Browser, options: BrowserContextOptions): Promise<Page> {
  const page = await (await browser.newContext(options)).newPage();
  await page.addInitScript(() => localStorage.setItem('vh:onboarded', '1'));
  await page.goto('/');
  expect((await storedSession(page)).user.is_anonymous).toBe(true);
  return page;
}

/**
 * Pelo pedido de conta (GuestPrompt, já na tela, aberto pelo "Criar conta"): e-mail, o link mágico do Mailpit e a
 * volta para `back`, já como conta (`mail`: quantos e-mails o endereço terá recebido com este).
 */
export async function createAccountFromPrompt(page: Page, dialog: string | RegExp, email: string, back: RegExp, mail = 1) {
  await page.getByRole('link', { name: 'Criar conta' }).click();
  const prompt = page.getByRole('dialog', { name: dialog });
  await prompt.getByRole('button', { name: 'Usar e-mail' }).click();
  await prompt.getByLabel('E-mail').fill(email);
  await prompt.getByRole('button', { name: 'Mandar link' }).click();
  await expect(prompt.getByRole('status')).toHaveText(LINK_EMAIL_SENT);
  await page.goto(await linkFromMail(email, mail));
  await expect(page).toHaveURL(back);
  await accountSession(page);
}

/** O nome que o ranking dá ao jogador da página (a linha ou o lugar no pódio marcado como dele). */
export async function myRankingName(page: Page): Promise<string> {
  const mine = page.locator('[aria-current="true"]');
  await expect(mine).toContainText('· você');
  const name = (await mine.textContent())?.match(new RegExp(`${GENERATED_NAME.source} · você`))?.[0].replace(' · você', '');
  expect(name).toMatch(new RegExp(`^${GENERATED_NAME.source}$`));
  return name!;
}

/** Joga a música mais curta inteira com o ouvido simulado, como o jogador; termina com a fila do aparelho vazia. */
export async function playShortest(page: Page) {
  await page.goto('/?ouvido=simulado');
  await chooseSong(page, new RegExp(`^${SHORTEST.sheet.title.replace(/[()]/g, '\\$&')}$`), 'Arcade', 'easy');
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.getByRole('button', { name: /Pular contagem/ }).click();
  await expect(page).toHaveURL(/\/(selo-novo|resultado)$/, { timeout: (SECONDS + 20) * 1000 });
  await expect.poll(() => queued(page), { message: 'a partida sobe pela fila' }).toBe(0);
}

/** O link do e-mail mais novo para `to`, assim que chegar (`count`: quantos e-mails já devem ter chegado). */
export async function linkFromMail(to: string, count: number): Promise<string> {
  let id = '';
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const body = (await res.json()) as { messages: { ID: string }[] };
        id = body.messages[0]?.ID ?? '';
        return body.messages.length;
      },
      { message: `e-mail ${count} para ${to}`, timeout: 15000 }
    )
    .toBeGreaterThanOrEqual(count);
  const message = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text: string };
  const link = message.Text.match(/https?:\/\/\S+\/auth\/v1\/verify\?[^\s)]+/)?.[0];
  if (!link) throw new Error(`sem link no e-mail: ${message.Text}`);
  return link;
}
