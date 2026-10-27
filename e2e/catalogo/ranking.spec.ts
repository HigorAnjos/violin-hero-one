import { randomUUID } from 'node:crypto';
import { test, type Browser, type Page } from '@playwright/test';
import { LINK_EMAIL_SENT } from '../../src/services/account';
import { expectFits, tinyText, tooSmallTargets } from '../layout';
import { expect, linkFromMail, playShortest, SECONDS, SHORTEST, storedSession } from './aparelho';

/**
 * Ranking de ponta a ponta no Supabase local: dois convidados jogam a mesma música, cada um cria conta pelo convite do
 * ranking (o mesmo usuário: a partida de convidado vai junto) e um vê o outro com o nome gerado (bicho + número),
 * nunca o e-mail.
 */
test.use({ storageState: { cookies: [], origins: [] } });
// O fluxo é o mesmo no celular; o tamanho 844×390 é conferido no fim, na mesma página
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'só no desktop'));

const RANKING = `/ranking?musica=${SHORTEST.sheet.id}&nivel=facil&periodo=semana`;
const GENERATED = /^(Raposa|Pinguim|Gato|Violinista) \d{4}$/;

/** Aparelho novo: contexto próprio, convidado anônimo do primeiro toque. */
async function newDevice(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.addInitScript(() => localStorage.setItem('vh:onboarded', '1'));
  await page.goto('/');
  expect((await storedSession(page)).user.is_anonymous).toBe(true);
  return page;
}

/** Pelo convite do ranking: cria a conta com o link mágico e volta para o ranking. */
async function createAccountFromRanking(page: Page, email: string) {
  await page.goto(RANKING);
  await expect(page.getByText(/Você está jogando sem conta/)).toBeVisible();
  await page.getByRole('link', { name: 'Criar conta' }).click();
  const prompt = page.getByRole('dialog', { name: 'Quer aparecer no ranking?' });
  await prompt.getByRole('button', { name: 'Usar e-mail' }).click();
  await prompt.getByLabel('E-mail').fill(email);
  await prompt.getByRole('button', { name: 'Mandar link' }).click();
  await expect(prompt.getByRole('status')).toHaveText(LINK_EMAIL_SENT);
  await page.goto(await linkFromMail(email, 1));
  await expect(page).toHaveURL(new RegExp(`/ranking\\?musica=${SHORTEST.sheet.id}`));
  expect((await storedSession(page)).user.is_anonymous).toBe(false);
}

/** O nome que o ranking dá ao jogador da página (a linha ou o lugar no pódio marcado como dele). */
async function myName(page: Page): Promise<string> {
  const mine = page.locator('[aria-current="true"]');
  await expect(mine).toContainText('· você');
  const name = (await mine.textContent())?.match(/(Raposa|Pinguim|Gato|Violinista) \d{4} · você/)?.[0].replace(' · você', '');
  expect(name).toMatch(GENERATED);
  return name!;
}

test('duas contas jogam a mesma música e uma vê a outra no ranking com o nome gerado, sem e-mail', async ({ browser, baseURL }) => {
  test.setTimeout((2 * SECONDS + 200) * 1000);
  const emails = [`ranking-a-${randomUUID().slice(0, 8)}@t.test`, `ranking-b-${randomUUID().slice(0, 8)}@t.test`];

  // Convidado A joga; no ranking vê o convite (anônimo não aparece) e cria a conta: a partida de antes já vale
  const one = await newDevice(browser, baseURL);
  await playShortest(one);
  await createAccountFromRanking(one, emails[0]);
  const nameA = await myName(one);

  // Convidado B, em outro aparelho, joga a mesma música e cria a conta
  const two = await newDevice(browser, baseURL);
  await playShortest(two);
  await createAccountFromRanking(two, emails[1]);
  const nameB = await myName(two);
  expect(nameB).not.toBe(nameA);

  // Cada um vê o outro pelo nome gerado, sem "você", e nenhum e-mail na tela
  await expect(two.getByText(nameA, { exact: true })).toBeVisible();
  await one.reload();
  await expect(one.getByText(nameB, { exact: true })).toBeVisible();
  expect(await myName(one)).toBe(nameA);
  for (const page of [one, two]) {
    await expect(page.locator('main')).not.toContainText('@');
    await expect(page.locator('main')).not.toContainText(/ranking-[ab]-/);
  }

  // Com a lista cheia: cabe na tela nos dois tamanhos e em três temas, com toque de 44 px e texto de 12 px
  for (const theme of ['caderno', 'palco', '8-bits']) {
    await one.evaluate((id) => localStorage.setItem('vh:theme', id), theme);
    for (const size of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
      await one.setViewportSize(size);
      await one.reload();
      await expect(one.getByText(nameB, { exact: true })).toBeVisible();
      await expect(one.locator('html')).toHaveAttribute('data-theme', theme);
      await expectFits(one);
      // Nada do pódio sobra para fora do degrau (o nome some atrás do avatar quando o degrau é baixo)
      const outside = await one.evaluate(() =>
        [...document.querySelectorAll('[aria-label="Pódio"] > li')].flatMap((li) => {
          const box = li.getBoundingClientRect();
          return [...li.children].filter((c) => c.getBoundingClientRect().top < box.top - 0.5).map((c) => c.textContent);
        })
      );
      expect(outside, `pódio ${theme}`).toEqual([]);
      expect(await tooSmallTargets(one), `${theme} ${size.width}×${size.height}`).toEqual([]);
      expect(await tinyText(one), `${theme} ${size.width}×${size.height}`).toEqual([]);
    }
  }
});
