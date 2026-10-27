import { expect, test, type Page } from '@playwright/test';
import type { BadgeId } from '../../src/game/engine/types';
import { songDurationSeconds } from '../../src/game/notation/song';
import { chooseSong } from '../choose';
import { queued, serverRows, SHORTEST } from './aparelho';

/**
 * A fila de partidas contra o Supabase local: a partida termina sem internet, fica no IndexedDB do aparelho e, quando
 * a rede volta, sobe sozinha (sem recarregar) e aparece em violinhero.plays para o jogador.
 */
const ALL_BADGES: BadgeId[] = ['primeira-musica', 'sem-erros', 'combo-25', 'combo-50', 'combo-100', 'afinacao-de-ouro'];

test.skip(({ isMobile }) => isMobile, 'a partida em tempo real só no desktop');

/** As partidas do jogador da sessão com este client_id (a RLS decide o que vem). */
const playsOnServer = (page: Page, clientId: string) =>
  serverRows<{ client_id: string; song_id: string; mode: string; finished: boolean; duration_ms: number }>(
    page,
    `plays?select=client_id,song_id,mode,finished,duration_ms&client_id=eq.${clientId}`
  );

test(`sem internet a partida fica na fila; a rede volta e ela chega ao Supabase (${SHORTEST.sheet.title})`, async ({ page, context }) => {
  const seconds = songDurationSeconds(SHORTEST.charts.easy);
  test.setTimeout((seconds + 60) * 1000);
  await page.addInitScript((badges) => localStorage.setItem('vh:badges', JSON.stringify(badges)), ALL_BADGES);
  await page.goto('/?ouvido=simulado');
  await chooseSong(page, new RegExp(`^${SHORTEST.sheet.title.replace(/[()]/g, '\\$&')}$`), 'Arcade', 'easy');
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.getByRole('button', { name: /Pular contagem/ }).click();
  await expect(page).toHaveURL(/\/jogo$/);

  await context.setOffline(true);
  await expect(page).toHaveURL(/\/resultado$/, { timeout: (seconds + 20) * 1000 });
  const clientId = await page.evaluate(() => (history.state as { usr?: { clientId?: string } }).usr?.clientId ?? '');
  expect(clientId).toMatch(/^[0-9a-f-]{36}$/);
  await expect.poll(() => queued(page), { message: 'partida esperando no aparelho' }).toBe(1);
  // Sem rede, nada chegou ao servidor
  await page.waitForTimeout(1000);
  expect(await queued(page)).toBe(1);

  await context.setOffline(false);
  await expect.poll(() => queued(page), { message: 'a fila esvazia quando a rede volta', timeout: 20000 }).toBe(0);
  const rows = await playsOnServer(page, clientId);
  expect(rows).toEqual([{ client_id: clientId, song_id: SHORTEST.sheet.id, mode: 'arcade', finished: true, duration_ms: expect.any(Number) }]);
  expect(rows[0].duration_ms).toBeGreaterThan(seconds * 1000 * 0.8);
});
