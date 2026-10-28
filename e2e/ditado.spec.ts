import type { Page } from '@playwright/test';
import { DEVICE_DB_NAME, DEVICE_DB_VERSION, SONGS_STORE } from '../src/services/deviceDb';
import type { CachedSong } from '../src/services/songCache';
import { skipOnboarding } from './choose';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectFits, tinyText, tooSmallTargets } from './layout';
import { expect, test, warmAudio } from './microphone';

// Sem backend: ?importacao=simulada troca a Edge Function pelo fake
const DICTATION = '/editor/ditar?importacao=simulada';
/** A escala de Ré maior do WAV: as 8 notas da subida e a descida (15 semínimas). */
const D_MAJOR = [62, 64, 66, 67, 69, 71, 73, 74];
const UP_AND_DOWN = [...D_MAJOR, ...D_MAJOR.slice(0, -1).reverse()];

const notes = (page: Page) => page.getByTestId('nota');

/** As músicas que o salvar deixou no aparelho (IndexedDB), para conferir a Song que foi para o importador. */
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
    [DEVICE_DB_NAME, DEVICE_DB_VERSION, SONGS_STORE] as const,
  );
}

test('ditar a escala de Ré maior pelo microfone: as notas na pauta e na música salva', async ({ micPage }) => {
  test.setTimeout(60000);
  // O WAV começa ao abrir o microfone, com o primeiro tempo 2,1 s depois (2 s mais a latência padrão): em 2/4 a
  // ♩ = 60, a contagem de 1 compasso dura 2 s e o ditado começa junto com a escala
  const page = await micPage('escala-re-maior', { loop: false });
  await skipOnboarding(page);
  await warmAudio(page);
  await page.goto(DICTATION);
  await page.getByRole('combobox', { name: 'Compasso' }).selectOption('2/4');
  await page.getByRole('combobox', { name: 'Andamento' }).selectOption('60');
  await page.getByRole('textbox', { name: 'Título da música' }).fill('Escala ditada');

  const panel = page.getByRole('region', { name: 'Ditado pelo microfone' });
  await page.getByRole('button', { name: 'Começar ditado' }).click();
  await expect(panel).toContainText('Contagem');
  await expect(panel).toContainText('Ouvindo…', { timeout: 5000 });
  // As notas aparecem enquanto a escala toca
  await expect(notes(page)).toHaveCount(3, { timeout: 6000 });
  await expect(notes(page)).toHaveCount(8, { timeout: 8000 });
  // Parar logo depois de uma nota corre contra o ataque da seguinte (100 ms): espera a escala acabar
  await expect(notes(page)).toHaveCount(UP_AND_DOWN.length, { timeout: 10000 });
  await page.keyboard.press('Escape');

  await expect(page).toHaveURL(/\/editor\?importacao=simulada$/);
  await expect(page.getByRole('tab', { name: /Na pauta/ })).toHaveAttribute('aria-selected', 'true');
  await expect(notes(page)).toHaveCount(UP_AND_DOWN.length);
  await expect(page.getByText(/Tudo cabe no violino \(Ré4 – Ré5\)/)).toBeVisible();

  await page.getByRole('button', { name: /^Salvar/ }).click();
  await expect(page.getByText(/Só você vê esta música/)).toBeVisible();
  const [saved] = (await savedSongs(page)).filter((s) => s.song.title === 'Escala ditada');
  const melody = saved.song.measures.flatMap((m, i) => m.notes.map((n) => ({ at: i * 2 + n.beat, beats: n.beats, midi: n.midi })));
  expect(melody).toEqual(UP_AND_DOWN.map((midi, at) => ({ at, beats: 1, midi })));
});

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test(`aba Ditar tocando, ${tema}, fonte ${fonte}: cabe, toque de 44 px, texto de 12 px`, async ({ page, isMobile }) => {
      await skipOnboarding(page);
      await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
      if (fonte === 'reserva') await blockWebFonts(page);
      await page.goto(DICTATION);
      await expect(page.getByRole('region', { name: 'Ditado pelo microfone' })).toBeVisible();
      await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
      await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
      // No celular deitado o editor rola na vertical, como na aba Na pauta
      if (isMobile) expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem horizontal').toBeLessThanOrEqual(0);
      else await expectFits(page);
      expect(await tooSmallTargets(page)).toEqual([]);
      expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
    });
  }
}

test('foco visível nas abas e no painel do ditado', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto(DICTATION);
  await page.getByRole('button', { name: 'Começar ditado' }).focus();
  await page.keyboard.press('Shift+Tab');
  const focused = await page.evaluate(() => ({ text: document.activeElement?.textContent, outline: getComputedStyle(document.activeElement!).outlineStyle }));
  expect(focused).toEqual({ text: 'semicolcheia', outline: 'solid' });
});

test('a aba Na pauta não abre o microfone; o ditado só pede ao começar', async ({ micPage }) => {
  const page = await micPage('silencio');
  await skipOnboarding(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as unknown as { pedidos: number }).pedidos = 0;
    navigator.mediaDevices.getUserMedia = (constraints) => {
      (window as unknown as { pedidos: number }).pedidos += 1;
      return original(constraints);
    };
  });
  await page.goto('/editor?importacao=simulada');
  await page.getByRole('tab', { name: /Ditar tocando/ }).click();
  await expect(page).toHaveURL(/\/editor\/ditar\?importacao=simulada$/);
  expect(await page.evaluate(() => (window as unknown as { pedidos: number }).pedidos)).toBe(0);
  await page.getByRole('button', { name: 'Começar ditado' }).click();
  await expect(page.getByRole('region', { name: 'Ditado pelo microfone' })).toContainText('Contagem');
  expect(await page.evaluate(() => (window as unknown as { pedidos: number }).pedidos)).toBe(1);
  // Voltar para a pauta fecha o microfone (MicGuard) e encerra o ditado
  await page.getByRole('tab', { name: /Na pauta/ }).click();
  await expect(page.getByRole('region', { name: 'Ditado pelo microfone' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Na pauta/ })).toHaveAttribute('aria-selected', 'true');
});
