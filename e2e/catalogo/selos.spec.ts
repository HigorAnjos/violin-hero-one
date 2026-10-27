import { expect, test, type Page } from '@playwright/test';
import { BADGES } from '../../src/game/engine/badges';
import type { BadgeId, GameResult } from '../../src/game/engine/types';
import { songDurationSeconds } from '../../src/game/notation/song';
import { chooseSong } from '../choose';
import { serverRows, SHORTEST } from './aparelho';

/**
 * Selos e sequência contra o Supabase local, com um jogador novo (sem selo nenhum no servidor): a partida inteira
 * comemora o selo que o servidor confirmou, a coleção mostra a data e a partida, a tela inicial mostra a sequência e,
 * de outro aparelho (sem vh:badges), o mesmo selo não comemora de novo.
 */
const TITLE = new RegExp(`^${SHORTEST.sheet.title.replace(/[()]/g, '\\$&')}$`);

test.skip(({ isMobile }) => isMobile, 'a partida em tempo real só no desktop');
// Jogador novo: o login anônimo da suíte já tem selos das outras partidas
test.use({ storageState: { cookies: [], origins: [] } });

/** Selos do jogador da sessão, pelo PostgREST com o token dele (a RLS só devolve os dele). */
const serverBadges = async (page: Page) => (await serverRows<{ badge_id: BadgeId }>(page, 'badges_earned?select=badge_id')).map((r) => r.badge_id);

async function playShortest(page: Page) {
  await chooseSong(page, TITLE, 'Arcade', 'easy');
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.getByRole('button', { name: /Pular contagem/ }).click();
  await expect(page).toHaveURL(/\/jogo$/);
}

test(`selo novo vem do servidor, entra na coleção com data e partida e não comemora duas vezes (${SHORTEST.sheet.title})`, async ({ page }) => {
  const seconds = songDurationSeconds(SHORTEST.charts.easy);
  test.setTimeout((2 * seconds + 90) * 1000);
  await page.addInitScript(() => localStorage.setItem('vh:onboarded', '1'));
  await page.goto('/?ouvido=simulado');
  await expect(page.getByRole('status').filter({ hasText: 'Jogando como convidado' })).toBeVisible({ timeout: 25000 });
  expect(await serverBadges(page)).toEqual([]);

  // 1ª partida: o selo novo é o que o servidor confirmou (submit_play pela fila)
  const answered = page.waitForResponse((r) => r.url().includes('/rpc/submit_play') && r.ok(), { timeout: (seconds + 30) * 1000 });
  await playShortest(page);
  await expect(page).toHaveURL(/\/selo-novo$/, { timeout: (seconds + 20) * 1000 });
  const outcome = (await (await answered).json()) as { badges: BadgeId[]; duplicate: boolean };
  expect(outcome.duplicate).toBe(false);
  const local = (await page.evaluate(() => (window as Window & { __vhResult?: GameResult }).__vhResult))!.badges;
  expect(outcome.badges.length, 'a partida inteira sem erro dá selo').toBeGreaterThan(0);
  expect(outcome.badges.every((id) => local.includes(id)), 'mesma regra dos dois lados').toBe(true);
  const featured = [...BADGES].reverse().find((b) => outcome.badges.includes(b.id))!;
  await expect(page.getByRole('heading', { name: `Selo novo: ${featured.label}` })).toBeVisible();
  expect((await serverBadges(page)).sort()).toEqual([...outcome.badges].sort());

  // Resultado → coleção: data de hoje (São Paulo), a música e o nível
  await page.getByRole('link', { name: /Ver resultado/ }).click();
  await page.getByRole('link', { name: new RegExp(`Selo conquistado nesta partida: ${featured.label}`) }).click();
  await expect(page).toHaveURL(/\/selos$/);
  const today = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date());
  for (const id of outcome.badges) {
    const label = BADGES.find((b) => b.id === id)!.label;
    const cell = page.getByRole('listitem').filter({ has: page.getByRole('img', { name: `Selo ${label}`, exact: true }) });
    await expect(cell).toContainText(`Ganho em ${today} · ${SHORTEST.sheet.title} (Fácil)`);
  }
  await expect(page.getByRole('progressbar', { name: 'Selos conquistados' })).toHaveAttribute('aria-valuenow', String(outcome.badges.length));

  // Tela inicial: o dia de hoje marcou a sequência no servidor
  await page.goto('/?ouvido=simulado');
  await expect(page.getByTestId('sequencia')).toHaveText('Sequência: 1 dia');

  // 2ª partida "de outro aparelho": sem vh:badges, o app aprende os selos da conta ao abrir e não comemora de novo
  await page.evaluate(() => localStorage.removeItem('vh:badges'));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('vh:badges') ?? '[]') as string[]).sort()), { message: 'selos da conta no aparelho' })
    .toEqual([...outcome.badges].sort());
  await page.evaluate(() => {
    const w = window as Window & { __sawBadge?: boolean };
    w.__sawBadge = false;
    new MutationObserver(() => {
      if ([...document.querySelectorAll('h1')].some((h) => h.textContent?.startsWith('Selo novo'))) w.__sawBadge = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  const again = page.waitForResponse((r) => r.url().includes('/rpc/submit_play') && r.ok(), { timeout: (seconds + 30) * 1000 });
  await playShortest(page);
  await expect(page).toHaveURL(/\/resultado$/, { timeout: (seconds + 20) * 1000 });
  expect(((await (await again).json()) as { badges: BadgeId[] }).badges).toEqual([]);
  expect(await page.evaluate(() => (window as Window & { __sawBadge?: boolean }).__sawBadge), 'o selo não comemorou de novo').toBe(false);
  await expect(page.getByRole('link', { name: 'Seus selos' })).toBeVisible();
});
