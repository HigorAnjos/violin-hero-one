import { expect, test } from '@playwright/test';
import { LEVEL_NAMES } from '../../src/components/CountIn/countIn';
import type { BadgeId, GameResult } from '../../src/game/engine/types';
import { attacks, LEVELS, songDurationSeconds, type Level } from '../../src/game/notation/song';
import { chooseSong } from '../choose';
import { CATALOG } from './catalogo';

/**
 * As 10 do catálogo, nos 3 níveis, de ponta a ponta contra o Supabase local: estante → modo → música → nível →
 * carregando (get_song) → afinar → contagem → partida inteira com o ouvido simulado (toca as notas certas no tempo)
 * → resultado. Cada música × nível toca uma vez, num modo que gira (quadrado latino): toda música passa por todos
 * os modos e todo modo por todos os níveis, sem tocar 10 × 3 × modos partidas em tempo real.
 */
const MODES = [
  { name: 'Arcade', route: /\/jogo$/ },
  { name: 'Partitura', route: /\/jogo\/partitura$/ },
] as const;

const ALL_BADGES: BadgeId[] = ['primeira-musica', 'sem-erros', 'combo-25', 'combo-50', 'combo-100', 'afinacao-de-ouro'];

test.skip(({ isMobile }) => isMobile, 'as partidas do catálogo só no desktop: o celular confere as telas');

test('a estante traz as 10 do banco na ordem do catálogo, com os 3 níveis', async ({ page }) => {
  await page.goto('/tocar/musica?modo=arcade');
  const songs = page.getByRole('radiogroup', { name: 'Músicas' }).getByRole('radio');
  // A primeira consulta ao PostgREST recém-subido monta o cache do schema: leva alguns segundos
  await expect(songs).toHaveCount(CATALOG.length, { timeout: 15000 });
  expect(await songs.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual(CATALOG.map((s) => s.sheet.title));
  await expect(page.getByRole('status').filter({ hasText: 'Sem internet' })).toHaveCount(0);
  const details = page.getByRole('complementary', { name: 'Detalhes da música' });
  for (const { sheet } of CATALOG) {
    await page.getByRole('radio', { name: sheet.title, exact: true }).click();
    await expect(details).toContainText(sheet.title);
    for (const level of LEVELS) await expect(details.getByRole('button', { name: LEVEL_NAMES[level], exact: true })).toBeEnabled();
  }
  await page.goto('/biblioteca');
  await expect(page.getByRole('list', { name: 'Músicas' }).getByRole('link')).toHaveCount(CATALOG.length);
});

CATALOG.forEach(({ sheet, charts }, songIndex) => {
  LEVELS.forEach((level: Level, levelIndex) => {
    const mode = MODES[(songIndex + levelIndex) % MODES.length];
    const chart = charts[level];
    const notes = attacks(chart).length;

    test(`${sheet.title} · ${LEVEL_NAMES[level]} · ${mode.name}: do menu ao resultado sem errar`, async ({ page }) => {
      // A música em tempo real, mais menus, carregando e o atraso até o resultado
      test.setTimeout((songDurationSeconds(chart) + 45) * 1000);
      // Todos os selos já ganhos: o fim vai direto ao /resultado
      await page.addInitScript((badges) => localStorage.setItem('vh:badges', JSON.stringify(badges)), ALL_BADGES);
      await page.goto('/?ouvido=simulado');
      await chooseSong(page, new RegExp(`^${sheet.title.replace(/[()]/g, '\\$&')}$`), mode.name, level);
      // O chart que chegou do banco é o do nível pedido
      await expect(page.getByText(`Antes de tocar · ${sheet.title} · ${LEVEL_NAMES[level]}`)).toBeAttached();
      await page.getByRole('button', { name: /Começar/ }).click();
      await page.getByRole('button', { name: /Pular contagem/ }).click();
      await expect(page).toHaveURL(mode.route);
      await expect(page).toHaveURL(/\/resultado$/, { timeout: (songDurationSeconds(chart) + 20) * 1000 });

      const result = await page.evaluate(() => (window as Window & { __vhResult?: GameResult }).__vhResult);
      expect(result?.status).toBe('finished');
      expect(result?.judgments.length, 'notas julgadas = ataques do chart').toBe(notes);
      const offsets = result?.judgments.slice(0, 4).map((j) => j.offsetMs && Math.round(j.offsetMs));
      expect(
        result?.judgments.filter((j) => j.judgment === 'miss').map((j) => `${j.index}:${j.issue}`),
        `notas erradas (atraso das 4 primeiras, ms: ${offsets?.join(', ')})`
      ).toEqual([]);
      await expect(page.getByTestId('resultado')).toContainText(sheet.title);
      await expect(page.getByTestId('resultado')).toContainText(mode.name);
    });
  });
});
