import { expect as baseExpect, type Page } from '@playwright/test';
import { songDurationSeconds } from '../../src/game/notation/song';
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

/** Partidas esperando na fila do aparelho (IndexedDB do ciclo3-sync). */
export const queued = (page: Page) =>
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
