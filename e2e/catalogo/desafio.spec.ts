import { randomUUID } from 'node:crypto';
import { test, type Browser, type Page } from '@playwright/test';
import { LINK_EMAIL_SENT } from '../../src/services/account';
import { expectFits, tinyText, tooSmallTargets } from '../layout';
import { openWithState } from '../state';
import { expect, linkFromMail, queued, SECONDS, SHORTEST, storedSession } from './aparelho';

/**
 * Desafio de ponta a ponta no Supabase local, com dois aparelhos: a conta A cria o desafio com o placar dela, a conta B
 * abre o link, cria a conta pelo pedido do desafio, aceita, joga melhor e o resultado aparece para os dois, sempre com
 * o nome gerado (bicho + número), nunca o e-mail. O resultado sai do servidor, a partir das partidas.
 */
test.use({
  storageState: { cookies: [], origins: [] },
  // A partida vai direto para /jogo com ?simular: sem o gesto do "Começar", o Chromium não libera o áudio
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
});
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'só no desktop; o 844×390 é conferido no fim'));

const GENERATED = /(Raposa|Pinguim|Gato|Violinista) \d{4}/;

async function newDevice(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.addInitScript(() => localStorage.setItem('vh:onboarded', '1'));
  await page.goto('/');
  expect((await storedSession(page)).user.is_anonymous).toBe(true);
  return page;
}

/** A mais curta no Fácil, tocada pelo violinista sintético com `errors` notas erradas; a partida sobe pela fila. */
async function play(page: Page, errors: number) {
  await openWithState(page, `/jogo?ouvido=simulado&simular=0&erros=${errors}`, { song: SHORTEST.charts.easy, mode: 'Arcade' });
  await expect(page).toHaveURL(/\/(selo-novo|resultado)$/, { timeout: (SECONDS + 30) * 1000 });
  await expect.poll(() => queued(page), { message: 'a partida sobe pela fila' }).toBe(0);
}

/** Pelo "Criar conta" da tela do desafio: o pedido de conta (motivo desafio), o link mágico e a volta para `back`. */
async function createAccount(page: Page, email: string, back: RegExp) {
  await page.getByRole('link', { name: 'Criar conta' }).click();
  const prompt = page.getByRole('dialog', { name: /Quer desafiar um amigo/ });
  await prompt.getByRole('button', { name: 'Usar e-mail' }).click();
  await prompt.getByLabel('E-mail').fill(email);
  await prompt.getByRole('button', { name: 'Mandar link' }).click();
  await expect(prompt.getByRole('status')).toHaveText(LINK_EMAIL_SENT);
  await page.goto(await linkFromMail(email, 1));
  await expect(page).toHaveURL(back);
  expect((await storedSession(page)).user.is_anonymous).toBe(false);
}

const placar = (page: Page) => page.getByRole('region', { name: 'Placar do desafio' });

test('A cria o desafio, B abre o link, aceita com conta, joga melhor e o resultado aparece para os dois', async ({ browser, baseURL }) => {
  test.setTimeout((2 * SECONDS + 240) * 1000);
  const tag = randomUUID().slice(0, 8);
  const emails = [`desafio-a-${tag}@t.test`, `desafio-b-${tag}@t.test`];

  // A joga com dois erros como convidado; o desafio pede conta, e a partida de antes vira o placar a bater
  const a = await newDevice(browser, baseURL);
  await play(a, 2);
  await a.goto('/desafio');
  await expect(a.getByText(/Desafiar alguém pede uma conta/)).toBeVisible();
  // Volta para a montagem com a partida já escolhida (?partida=)
  await createAccount(a, emails[0], /\/desafio\?partida=[0-9a-f-]{36}#?$/);
  const choice = a.getByRole('combobox', { name: 'Música e nível' });
  await expect(choice).toContainText(SHORTEST.sheet.title);
  await expect(choice).toContainText('Fácil');
  await a.getByRole('button', { name: '1 dia' }).click();
  await a.getByRole('button', { name: /Criar desafio/ }).click();
  const link = await a.getByRole('textbox', { name: 'Link do desafio' }).inputValue();
  const path = new URL(link).pathname;
  expect(path).toMatch(/^\/desafio\/[A-Za-z0-9_-]{12}$/);

  // B, em outro aparelho, abre o link: música, nível, pontos, prazo e o nome gerado de A; aceitar pede conta
  const b = await newDevice(browser, baseURL);
  await b.goto(path);
  const heading = b.getByRole('heading', { level: 1 });
  await expect(heading).toHaveText(new RegExp(`^${GENERATED.source} te desafiou$`));
  const nameA = (await heading.textContent())!.replace(' te desafiou', '');
  const card = b.getByRole('region', { name: 'Desafio' });
  await expect(card).toContainText(SHORTEST.sheet.title);
  await expect(card).toContainText('Fácil');
  await expect(card).toContainText(/\d+ h restantes/);
  await expect(b.getByRole('button', { name: /Aceitar desafio/ })).toHaveCount(0);
  await createAccount(b, emails[1], new RegExp(`${path}#?$`));
  await b.getByRole('button', { name: /Aceitar desafio/ }).click();
  await expect(b.getByRole('link', { name: /Tocar agora/ })).toHaveAttribute('href', new RegExp(`musica=${SHORTEST.sheet.id}&nivel=facil$`));
  await expect(placar(b)).toContainText('Ainda sem partida que conte');

  // B joga sem erro: passa o placar de A, e o servidor dá a vitória na hora
  await play(b, 0);
  await b.goto(path);
  await expect(placar(b)).toContainText('Você venceu!');
  const nameB = (await placar(b).locator('[aria-current="true"] b').textContent())!.replace(' · você', '');
  expect(nameB).toMatch(GENERATED);

  // A vê o resultado, com o nome gerado de B
  await a.goto(path);
  await expect(a.getByRole('heading', { name: 'Seu desafio' })).toBeVisible();
  await expect(placar(a)).toContainText(nameB);
  await expect(placar(a)).toContainText('Passou você');
  await a.goto('/desafio');
  await expect(a.getByRole('region', { name: 'Seus desafios' })).toContainText('1 aceitaram');
  await b.goto('/desafio');
  await expect(b.getByRole('region', { name: 'Seus desafios' })).toContainText(nameA);

  for (const page of [a, b]) {
    await page.goto(path);
    await expect(placar(page)).toBeVisible();
    await expect(page.locator('main')).not.toContainText('@');
    await expect(page.locator('main')).not.toContainText(/desafio-[ab]-/);
  }

  // Com o placar cheio: cabe nos dois tamanhos e em três temas, com toque de 44 px e texto de 12 px
  for (const theme of ['caderno', 'palco', '8-bits']) {
    await a.evaluate((id) => localStorage.setItem('vh:theme', id), theme);
    for (const size of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
      await a.setViewportSize(size);
      for (const at of [path, '/desafio']) {
        await a.goto(at);
        await expect(a.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(at === path ? placar(a).getByText(nameB) : a.getByRole('region', { name: 'Seus desafios' }).getByText('1 aceitaram')).toBeVisible();
        await expectFits(a);
        expect(await tooSmallTargets(a), `${at} ${theme} ${size.width}×${size.height}`).toEqual([]);
        expect(await tinyText(a), `${at} ${theme} ${size.width}×${size.height}`).toEqual([]);
      }
    }
  }
});
