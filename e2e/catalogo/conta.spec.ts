import { randomUUID } from 'node:crypto';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { songDurationSeconds } from '../../src/game/notation/song';
import { LINK_EMAIL_SENT, LOGIN_LINK_SENT } from '../../src/services/account';
import { DEVICE_DB_NAME, PLAYS_STORE } from '../../src/services/deviceDb';
import { chooseSong } from '../choose';
import { CATALOG } from './catalogo';

// O Kong do Supabase local às vezes segura por ~7 s as primeiras chamadas de uma página nova, e o primeiro e-mail
// do GoTrue leva o mesmo: 5 s não bastam
const expect = baseExpect.configure({ timeout: 20000 });

/**
 * Conta de ponta a ponta no Supabase local: o convidado joga (a partida sobe pela fila do aparelho), cria conta pelo
 * link mágico (o mesmo usuário), outro aparelho entra com o mesmo e-mail e vê o que ele fez; sair volta a um convidado
 * novo, sem nada da conta. O link chega na caixa local do supabase start (Mailpit, porta 54324). Google não tem e2e
 * (sem provedor local).
 */
const MAILPIT = process.env.E2E_MAILPIT_URL || 'http://127.0.0.1:54324';

/** A mais curta da estante no Fácil: a partida toca em tempo real. */
const SHORTEST = [...CATALOG].sort((a, b) => songDurationSeconds(a.charts.easy) - songDurationSeconds(b.charts.easy))[0];
const SECONDS = songDurationSeconds(SHORTEST.charts.easy);

/** Cada aparelho é um contexto novo, sem a sessão compartilhada do sessao.setup.ts. */
test.use({ storageState: { cookies: [], origins: [] } });
// O fluxo é o mesmo no celular; o layout das telas da conta fica no e2e/conta.spec.ts
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'só no desktop'));

interface StoredSession {
  access_token: string;
  user: { id: string; is_anonymous?: boolean };
}

/** A sessão que o supabase-js guardou no aparelho (espera o login anônimo do primeiro toque). */
async function storedSession(page: Page): Promise<StoredSession> {
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

/** Partidas esperando na fila do aparelho (IndexedDB do ciclo3-sync). */
const queued = (page: Page) =>
  page.evaluate(
    ([name, store]) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const count = open.result.transaction(store, 'readonly').objectStore(store).count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
        };
      }),
    [DEVICE_DB_NAME, PLAYS_STORE] as const
  );

/** Joga a música mais curta inteira com o ouvido simulado, como o jogador; termina com a fila do aparelho vazia. */
async function playShortest(page: Page) {
  await page.goto('/?ouvido=simulado');
  await chooseSong(page, new RegExp(`^${SHORTEST.sheet.title.replace(/[()]/g, '\\$&')}$`), 'Arcade', 'easy');
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.getByRole('button', { name: /Pular contagem/ }).click();
  await expect(page).toHaveURL(/\/(selo-novo|resultado)$/, { timeout: (SECONDS + 20) * 1000 });
  await expect.poll(() => queued(page), { message: 'a partida sobe pela fila' }).toBe(0);
}

/** O link do e-mail mais novo para `to`, assim que chegar (`count`: quantos e-mails já devem ter chegado). */
async function linkFromMail(to: string, count: number): Promise<string> {
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

test('convidado joga, cria conta pelo link mágico e outro aparelho entra e vê o que ele fez; sair limpa', async ({ browser, baseURL }) => {
  test.setTimeout((2 * SECONDS + 150) * 1000);
  const email = `violinista-${randomUUID().slice(0, 8)}@t.test`;

  // Aparelho 1: convidado joga a música mais curta; a partida sobe pela fila
  const one = await (await browser.newContext({ baseURL })).newPage();
  await one.addInitScript(() => localStorage.setItem('vh:onboarded', '1'));
  await one.goto('/');
  const guest = await storedSession(one);
  expect(guest.user.is_anonymous).toBe(true);
  await playShortest(one);

  // Conta pedida (outro aparelho): o que já é dele aparece e vai junto
  await one.goto('/configuracoes?secao=conta');
  await one.getByRole('link', { name: 'Criar conta' }).click();
  const prompt = one.getByRole('dialog', { name: 'Quer usar em outro aparelho?' });
  await expect(prompt.getByText('música tocada', { exact: true })).toBeVisible();
  await prompt.getByRole('button', { name: 'Usar e-mail' }).click();
  await prompt.getByLabel('E-mail').fill(email);
  await prompt.getByRole('button', { name: 'Mandar link' }).click();
  await expect(prompt.getByRole('status')).toHaveText(LINK_EMAIL_SENT);

  // O link confirma o e-mail no MESMO usuário e volta para as Configurações › Conta
  await one.goto(await linkFromMail(email, 1));
  await expect(one).toHaveURL(/\/configuracoes\?secao=conta/);
  await expect(one.getByRole('region', { name: 'Conta' })).toContainText(email);
  const linked = await storedSession(one);
  expect(linked.user.id).toBe(guest.user.id);
  expect(linked.user.is_anonymous).toBe(false);

  // Aparelho 2: o convidado de lá também jogou; entrar na conta avisa que isso não vai junto, e Ficar não troca
  const two = await (await browser.newContext({ baseURL })).newPage();
  await two.addInitScript(() => localStorage.setItem('vh:onboarded', '1'));
  await two.goto('/');
  const otherGuest = await storedSession(two);
  await playShortest(two);
  await two.goto('/entrar');
  await two.getByRole('button', { name: 'Entrar com e-mail' }).click();
  // E-mail sem conta: o GoTrue de verdade recusa, a tela diz o mesmo que diria com conta (e nenhum e-mail sai)
  const nobody = `ninguem-${randomUUID().slice(0, 8)}@t.test`;
  await two.getByLabel('E-mail').fill(nobody);
  await two.getByRole('button', { name: 'Mandar link' }).click();
  await two.getByRole('button', { name: 'Entrar mesmo assim' }).click();
  await expect(two.getByRole('status')).toHaveText(LOGIN_LINK_SENT);
  await expect(two.getByRole('alert')).toHaveCount(0);
  await two.getByLabel('E-mail').fill(email);
  await two.getByRole('button', { name: 'Mandar link' }).click();
  await expect(two.getByRole('alertdialog')).toContainText('(1 música e');
  await two.getByRole('button', { name: 'Ficar' }).click();
  await two.getByRole('button', { name: 'Mandar link' }).click();
  await two.getByRole('button', { name: 'Entrar mesmo assim' }).click();
  await expect(two.getByRole('status')).toHaveText(LOGIN_LINK_SENT);
  await two.goto(await linkFromMail(email, 2));
  await expect(two.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
  expect((await storedSession(two)).user.id).toBe(guest.user.id);
  // O aparelho passou a ser da conta: o convidado de antes foi esquecido
  await expect.poll(() => two.evaluate(() => localStorage.getItem('vh:usuario'))).toBe(guest.user.id);
  expect(otherGuest.user.id).not.toBe(guest.user.id);
  await two.goto('/perfil');
  await expect(two.getByRole('region', { name: 'Sequência' })).toContainText('1 dia');
  await expect(two.getByText(/^[1-6] \/ 6 selos$/)).toBeVisible();

  // Sair no aparelho 2: convidado novo, nada da conta
  await two.goto('/configuracoes?secao=conta');
  await two.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(two.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
  const after = await storedSession(two);
  expect(after.user.is_anonymous).toBe(true);
  expect(after.user.id).not.toBe(guest.user.id);
  await two.goto('/perfil');
  await expect(two.getByRole('region', { name: 'Sequência' })).toContainText('0 dias');
  await expect(two.getByText('0 / 6 selos')).toBeVisible();

  // O aparelho 1 segue na conta (sair é só deste aparelho)
  await one.reload();
  await expect(one.getByRole('region', { name: 'Conta' })).toContainText(email);
});
