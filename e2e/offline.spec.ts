import { expect, test, type Page } from '@playwright/test';
import { ODE } from '../src/game/engine/testing';
import { SONG_DB_NAME, SONG_DB_STORE, type CachedSong } from '../src/services/songCache';
import { chooseSong, skipOnboarding } from './choose';

/** As embutidas (src/game/notation/fixedSongs.json; o Playwright não importa JSON sem atributo). */
const EMBEDDED_TITLES = ['Escala de Ré maior', 'Ode à Alegria', 'Brilha Brilha Estrelinha'];

// O único spec com o service worker ligado (os outros o bloqueiam: o page.route não vê o que ele responde).
// Sem gesto o Chromium não libera o áudio; a política de autoplay deixa a partida começar sozinha.
test.use({ serviceWorkers: 'allow', launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

/** Uma música do catálogo aberta antes, com internet: o que o cache do aparelho guardou dela. */
const BAIXADA: CachedSong = {
  id: 'greensleeves',
  level: 'medium',
  hash: 'a'.repeat(64),
  sheet: {
    id: 'greensleeves',
    title: 'Greensleeves',
    composer: 'Tradicional',
    bpm: 90,
    timeSignature: { beats: 3, unit: 4 },
    key: 'A minor',
    durationSeconds: 70,
    origin: 'catalog',
  },
  song: { ...ODE, id: 'greensleeves', title: 'Greensleeves', level: 'medium' },
  savedAt: 1,
  openedAt: 1,
};

/** A primeira visita, com internet: o service worker instala (guarda o app inteiro) e a página passa a ser dele. */
async function firstVisit(page: Page) {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

/** Grava a baixada no IndexedDB como o app gravaria depois de abrir a música (o build do e2e não tem Supabase). */
async function saveSong(page: Page, entry: CachedSong) {
  await page.evaluate(
    ([name, store, value]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(name, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(store, { keyPath: ['id', 'level'] });
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(store, 'readwrite');
          tx.objectStore(store).put(value);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    [SONG_DB_NAME, SONG_DB_STORE, entry] as const
  );
}

test('depois de uma visita, sem internet: abre, mostra embutidas e baixadas e joga uma embutida até o resultado', async ({ page, context }) => {
  test.setTimeout(90000);
  await skipOnboarding(page);
  await firstVisit(page);
  await saveSong(page, BAIXADA);

  await context.setOffline(true);
  await page.goto('/?ouvido=simulado');
  await expect(page.getByRole('heading', { name: /Violin\s*Hero/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();

  // Os worklets do microfone (afinação e latência) carregam do cache
  const worklets = await page.evaluate(async () => {
    const urls = (await Promise.all((await caches.keys()).map(async (k) => (await caches.open(k)).keys())))
      .flat()
      .map((r) => r.url)
      .filter((u) => /\/worklet-[^/]+\.js/.test(u));
    const audio = new AudioContext();
    for (const url of urls) await audio.audioWorklet.addModule(url);
    await audio.close();
    return urls.length;
  });
  expect(worklets).toBe(2);

  const menu = page.getByRole('navigation', { name: 'Menu principal' });
  await expect(menu.getByRole('link', { name: /Biblioteca/ })).toContainText(String(EMBEDDED_TITLES.length + 1));
  await menu.getByRole('link', { name: /Biblioteca/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sem internet' })).toContainText('do app e as baixadas');
  const cards = page.getByRole('list', { name: 'Músicas' }).getByRole('link');
  await expect(cards).toHaveCount(EMBEDDED_TITLES.length + 1);
  for (const title of EMBEDDED_TITLES) await expect(cards.filter({ hasText: title })).toHaveCount(1);
  await expect(cards.filter({ hasText: 'Greensleeves' })).toContainText('Baixada');
  await expect(cards.filter({ hasText: 'Greensleeves' })).toContainText('Médio');

  // A baixada abre do aparelho, no nível guardado, até a afinação
  await cards.filter({ hasText: 'Greensleeves' }).click();
  // A biblioteca pede o modo antes da seleção
  await page.getByRole('button', { name: /Continuar com Arcade/ }).click();
  await page.getByRole('complementary', { name: 'Detalhes da música' }).getByRole('link', { name: /Tocar/ }).click();
  await expect(page).toHaveURL(/\/afinar(\?.*)?$/);
  await page.goto('/?ouvido=simulado');

  await chooseSong(page, /Escala/);
  await page.getByRole('button', { name: /Começar/ }).click();
  await expect(page).toHaveURL(/\/jogo$/, { timeout: 15000 });
  await expect(page).toHaveURL(/\/selo-novo$/, { timeout: 45000 });
  await page.getByRole('link', { name: /Ver resultado/ }).click();
  await expect(page.getByTestId('resultado')).toContainText('Escala de Ré maior');
  await expect(page.getByTestId('resultado')).toContainText('100,0%');
});
