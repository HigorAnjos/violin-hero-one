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
