import { randomUUID } from 'node:crypto';
import { LINK_EMAIL_SENT, LOGIN_LINK_SENT } from '../../src/services/account';
import { accountSession, expect, linkFromMail, MAILPIT, playShortest, SECONDS, storedSession, test } from './aparelho';

/**
 * Conta de ponta a ponta no Supabase local: o convidado joga (a partida sobe pela fila do aparelho), cria conta pelo
 * link mágico (o mesmo usuário), outro aparelho entra com o mesmo e-mail e vê o que ele fez; sair volta a um convidado
 * novo, sem nada da conta. O link chega na caixa local do supabase start (Mailpit, porta 54324). Google não tem e2e
 * (sem provedor local).
 */

/** Cada aparelho é um contexto novo, sem a sessão compartilhada do sessao.setup.ts. */
test.use({ storageState: { cookies: [], origins: [] } });
// O fluxo é o mesmo no celular; o layout das telas da conta fica no e2e/conta.spec.ts
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'só no desktop'));

test('convidado joga, cria conta pelo link mágico e outro aparelho entra e vê o que ele fez; sair limpa', async ({ newDevice }) => {
  test.setTimeout((2 * SECONDS + 150) * 1000);
  const email = `violinista-${randomUUID().slice(0, 8)}@t.test`;

  // Aparelho 1: convidado joga a música mais curta; a partida sobe pela fila
  const one = await newDevice();
  const guest = await storedSession(one);
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
  const two = await newDevice();
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
  const mails = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${nobody}"`)}`);
  expect(((await mails.json()) as { messages: unknown[] }).messages).toEqual([]);
  await two.getByLabel('E-mail').fill(email);
  await two.getByRole('button', { name: 'Mandar link' }).click();
  await expect(two.getByRole('alertdialog')).toContainText('(1 música e');
  await two.getByRole('button', { name: 'Ficar' }).click();
  await two.getByRole('button', { name: 'Mandar link' }).click();
  await two.getByRole('button', { name: 'Entrar mesmo assim' }).click();
  await expect(two.getByRole('status')).toHaveText(LOGIN_LINK_SENT);
  await two.goto(await linkFromMail(email, 2));
  await expect(two.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
  expect((await accountSession(two)).user.id).toBe(guest.user.id);
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
  // O menu volta antes de o convidado novo ser gravado: espera a sessão trocar
  await expect.poll(async () => (await storedSession(two)).user.is_anonymous, { message: 'convidado novo no aparelho' }).toBe(true);
  const after = await storedSession(two);
  expect(after.user.id).not.toBe(guest.user.id);
  await two.goto('/perfil');
  await expect(two.getByRole('region', { name: 'Sequência' })).toContainText('0 dias');
  await expect(two.getByText('0 / 6 selos')).toBeVisible();

  // O aparelho 1 segue na conta (sair é só deste aparelho)
  await one.reload();
  await expect(one.getByRole('region', { name: 'Conta' })).toContainText(email);
});
