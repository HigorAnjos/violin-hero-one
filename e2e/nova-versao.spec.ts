import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './choose';
import { fontsReady } from './fonts';

// ?nova-versao (build do e2e): o aviso de versão nova aparece sem trocar o service worker
const MENUS = [
  ['tela inicial', '/'],
  ['modos', '/tocar'],
  ['seleção de música', '/tocar/musica?modo=arcade'],
  ['biblioteca', '/biblioteca'],
] as const;

const notice = (page: Page) => page.getByRole('region', { name: 'Nova versão' });

/**
 * Controles da tela que ficam embaixo da barra: o ponto do controle que cai na área dela é o controle (ou algo
 * dentro dele) quando a barra some por um instante. Controle cortado por rolagem interna não conta: ali o ponto é
 * de outro elemento.
 */
async function coveredControls(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('[role="region"][aria-label="Nova versão"]')!;
    const area = bar.getBoundingClientRect();
    const controls = [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, [role="radio"]')].filter(
      (el) => !bar.contains(el) && el.offsetParent !== null
    );
    bar.style.visibility = 'hidden';
    const covered = controls.filter((el) => {
      const r = el.getBoundingClientRect();
      const left = Math.max(r.left, area.left);
      const right = Math.min(r.right, area.right);
      const top = Math.max(r.top, area.top);
      const bottom = Math.min(r.bottom, area.bottom);
      if (left >= right || top >= bottom) return false;
      for (const x of [left + 1, (left + right) / 2, right - 1])
        for (const y of [top + 1, (top + bottom) / 2, bottom - 1]) if (el.contains(document.elementFromPoint(x, y))) return true;
      return false;
    });
    bar.style.visibility = '';
    return covered.map((el) => el.textContent?.trim() || el.getAttribute('aria-label') || el.tagName);
  });
}

for (const [name, path] of MENUS) {
  test(`aviso de versão nova na ${name}: não cobre controle, não pega o foco, vem por último no Tab`, async ({ page }) => {
    await skipOnboarding(page);
    await page.goto(`${path}${path.includes('?') ? '&' : '?'}nova-versao`);
    await expect(notice(page)).toBeVisible();
    await expect(notice(page).getByRole('status')).toContainText('Nova versão do Violin Hero');
    await fontsReady(page);

    // Não é modal: o foco fica onde estava (na página, nada focado)
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

    for (const label of ['Atualizar', 'Depois']) {
      const box = (await notice(page).getByRole('button', { name: label }).boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(43.5);
    }

    // Último no Tab: Atualizar e Depois fecham a ordem dos focáveis
    const order = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, [tabindex="0"]')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => el.textContent?.trim())
    );
    expect(order.slice(-2)).toEqual(['Atualizar', 'Depois']);

    // Tela que cabe na janela: nada embaixo da barra. Tela mais alta que a janela (seleção de música no celular
    // deitado): a página ganha o espaço da barra embaixo e, rolando até o fim, nenhum controle fica coberto
    const atTop = await coveredControls(page);
    if (atTop.length) expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await coveredControls(page)).toEqual([]);
    test.info().annotations.push({ type: 'cobertos com a página no topo', description: atTop.join(', ') || 'nenhum' });

    // Depois: some e a tela volta a ocupar a janela inteira
    await notice(page).getByRole('button', { name: 'Depois' }).click();
    await expect(notice(page)).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).paddingBottom)).toBe('0px');
  });
}

/**
 * Com o service worker de verdade: o sw.js do build ganha uma versão 2 (que responde "v2" a quem perguntar) enquanto o
 * app está aberto, o aviso aparece e um clique em Atualizar põe a página na versão 2.
 */
test.describe('versão nova de verdade: um clique em Atualizar troca de versão', () => {
  test.use({ serviceWorkers: 'allow' });
  const SW = path.resolve(import.meta.dirname, '../dist/sw.js');
  const V2 = `\nself.addEventListener('message', (e) => { if (e.data === 'versao') e.ports[0].postMessage('v2'); });\n`;

  /** Pergunta a versão ao service worker que controla a página; a versão 1 não responde. */
  const version = (page: Page) =>
    page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const controller = navigator.serviceWorker.controller;
          if (!controller) return resolve('sem controlador');
          const channel = new MessageChannel();
          channel.port1.onmessage = (e) => resolve(e.data);
          controller.postMessage('versao', [channel.port2]);
          setTimeout(() => resolve('v1'), 1000);
        })
    );
  const registration = (page: Page) =>
    page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return { waiting: !!r?.waiting, installing: !!r?.installing };
    });

  let original: string;
  test.beforeEach(async ({ page }) => {
    original = await readFile(SW, 'utf8');
    await skipOnboarding(page);
  });
  test.afterEach(async () => {
    await writeFile(SW, original);
  });

  // A versão 2 sai enquanto o app está aberto; a conferência de hora em hora (ou a próxima navegação) a encontra
  async function deployAndFind(page: Page) {
    await writeFile(SW, original + V2);
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await expect(notice(page)).toBeVisible({ timeout: 15000 });
  }

  async function updateOnce(page: Page) {
    const reloaded = page.waitForEvent('load');
    await notice(page).getByRole('button', { name: 'Atualizar' }).click();
    await reloaded;
    await expect(notice(page)).toHaveCount(0);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    expect(await version(page)).toBe('v2');
    expect(await registration(page)).toEqual({ waiting: false, installing: false });
  }

  test('página já controlada pela versão 1: a versão 2 espera e entra no primeiro clique', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    expect(await version(page)).toBe('v1');
    await deployAndFind(page);
    expect((await registration(page)).waiting).toBe(true);
    await updateOnce(page);
  });

  test('primeira visita (página sem controlador): a versão 2 ativa sozinha e o primeiro clique a carrega', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    expect(await version(page)).toBe('sem controlador');
    await deployAndFind(page);
    await updateOnce(page);
  });
});
