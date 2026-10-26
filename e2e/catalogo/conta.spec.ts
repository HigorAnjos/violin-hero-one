import { randomUUID } from 'node:crypto';
import { expect as baseExpect, test, type Page } from '@playwright/test';

// O Kong do Supabase local às vezes segura por ~7 s as primeiras chamadas de uma página nova, e o primeiro e-mail
// do GoTrue leva o mesmo: 5 s não bastam
const expect = baseExpect.configure({ timeout: 20000 });

/**
 * Conta de ponta a ponta no Supabase local: o convidado joga, cria conta pelo link mágico (o mesmo usuário), outro
 * aparelho entra com o mesmo e-mail e vê o que ele fez; sair volta a um convidado novo, sem nada da conta.
 * O link chega na caixa local do supabase start (Mailpit, porta 54324). Google não tem e2e (sem provedor local).
 */
const API = process.env.E2E_SUPABASE_URL!;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY!;
const MAILPIT = process.env.E2E_MAILPIT_URL || 'http://127.0.0.1:54324';
const SONG = 'escala-re-maior';
const LEVEL = 'medium';

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

async function rpc<T>(token: string, fn: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'content-profile': 'violinhero', 'accept-profile': 'violinhero' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

type Chart = { bpm: number; measures: { beats: number; notes: { string: number; tie?: boolean }[] }[] };

/**
 * "Joga" a música inteira sem errar, como o app mandaria pelo submit_play (o envio pela fila é do ciclo3-sync).
 * Pontos como score.ts: 100 por Perfeito, ×1 nos 10 primeiros seguidos, até ×4.
 */
async function playPerfectly(token: string) {
  const [row] = await rpc<{ chart: Chart }[]>(token, 'get_song', { p_song_id: SONG, p_level: LEVEL });
  const attacks = row.chart.measures.flatMap((m) => m.notes).filter((n) => !n.tie);
  const score = attacks.reduce((sum, _n, i) => sum + 100 * Math.min(4, 1 + Math.floor(i / 10)), 0);
  const strings = new Set(attacks.map((n) => n.string));
  const seconds = row.chart.measures.reduce((sum, m) => sum + m.beats, 0) * (60 / row.chart.bpm);
  return rpc<{ record: { improved: boolean } }>(token, 'submit_play', {
    p_play: {
      client_id: randomUUID(), song_id: SONG, level: LEVEL, mode: 'arcade', finished: true, no_fail: false, looped: false,
      speed: 1, score, accuracy: 100, counts: { perfect: attacks.length, great: 0, good: 0, miss: 0 }, max_combo: attacks.length,
      mean_abs_cents: 4, string_cents: [0, 1, 2, 3].map((s) => (strings.has(s) ? 4 : null)),
      duration_ms: Math.round(seconds * 1000) + 500, played_at: new Date().toISOString(),
    },
  });
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
  test.setTimeout(120000);
  const email = `violinista-${randomUUID().slice(0, 8)}@t.test`;

  // Aparelho 1: convidado, joga a Escala de Ré maior no Médio sem errar
  const one = await (await browser.newContext({ baseURL })).newPage();
  await one.addInitScript(() => localStorage.setItem('vh:onboarded', '1'));
  await one.goto('/');
  const guest = await storedSession(one);
  expect(guest.user.is_anonymous).toBe(true);
  await playPerfectly(guest.access_token);

  // Conta pedida (outro aparelho): o que já é dele aparece e vai junto
  await one.goto('/configuracoes?secao=conta');
  await one.getByRole('link', { name: 'Criar conta' }).click();
  const prompt = one.getByRole('dialog', { name: 'Quer usar em outro aparelho?' });
  await expect(prompt.getByText('música tocada', { exact: true })).toBeVisible();
  await prompt.getByRole('button', { name: 'Usar e-mail' }).click();
  await prompt.getByLabel('E-mail').fill(email);
  await prompt.getByRole('button', { name: 'Mandar link' }).click();
  await expect(prompt.getByRole('status')).toContainText(`Mandamos um link para ${email}`);

  // O link confirma o e-mail no MESMO usuário e volta para as Configurações › Conta
  await one.goto(await linkFromMail(email, 1));
  await expect(one).toHaveURL(/\/configuracoes\?secao=conta/);
  await expect(one.getByRole('region', { name: 'Conta' })).toContainText(email);
  const linked = await storedSession(one);
  expect(linked.user.id).toBe(guest.user.id);
  expect(linked.user.is_anonymous).toBe(false);

  // Aparelho 2: primeira vez, entra com o mesmo e-mail e vê o que foi feito no aparelho 1
  const two = await (await browser.newContext({ baseURL })).newPage();
  await two.goto('/');
  await expect(two).toHaveURL(/\/entrar$/);
  const otherGuest = await storedSession(two);
  await two.getByRole('button', { name: 'Entrar com e-mail' }).click();
  await two.getByLabel('E-mail').fill(email);
  await two.getByRole('button', { name: 'Mandar link' }).click();
  await expect(two.getByRole('status')).toContainText('Mandamos um link');
  await two.goto(await linkFromMail(email, 2));
  await expect(two.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
  expect((await storedSession(two)).user.id).toBe(guest.user.id);
  // O aparelho passou a ser da conta: o convidado de antes foi esquecido
  await expect.poll(() => two.evaluate(() => localStorage.getItem('vh:usuario'))).toBe(guest.user.id);
  expect(otherGuest.user.id).not.toBe(guest.user.id);
  await two.goto('/perfil');
  await expect(two.getByRole('region', { name: 'Músicas aprendidas' })).toContainText(/^Músicas aprendidas\s*1/);
  await expect(two.getByRole('region', { name: 'Sequência' })).toContainText('1 dia');

  // Sair no aparelho 2: convidado novo, nada da conta
  await two.goto('/configuracoes?secao=conta');
  await two.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(two.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
  const after = await storedSession(two);
  expect(after.user.is_anonymous).toBe(true);
  expect(after.user.id).not.toBe(guest.user.id);
  await two.goto('/perfil');
  await expect(two.getByRole('region', { name: 'Músicas aprendidas' })).toContainText(/^Músicas aprendidas\s*0/);
  await expect(two.getByRole('region', { name: 'Sequência' })).toContainText('0 dias');

  // O aparelho 1 segue na conta (sair é só deste aparelho)
  await one.reload();
  await expect(one.getByRole('region', { name: 'Conta' })).toContainText(email);
});
