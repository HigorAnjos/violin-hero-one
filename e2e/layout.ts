import { expect, type Page } from '@playwright/test';

/**
 * Nada passa da janela: sem rolagem e nenhum elemento visível além da borda direita ou de baixo. O que um ancestral
 * recorta (overflow, como as notas da partitura dentro da SVG) conta só pela parte que aparece.
 */
export async function expectFits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem horizontal').toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), 'rolagem vertical').toBeLessThanOrEqual(1);
  const outside = await page.evaluate(() => {
    const visible = (el: Element) => {
      const box = el.getBoundingClientRect();
      let { right, bottom } = box;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const style = getComputedStyle(p);
        if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
        const clip = p.getBoundingClientRect();
        right = Math.min(right, clip.right);
        bottom = Math.min(bottom, clip.bottom);
      }
      return { width: box.width, right, bottom };
    };
    return [...document.querySelectorAll('main *')]
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => ({ el, box: visible(el) }))
      .filter(({ box }) => box.width > 0 && (box.right > window.innerWidth + 0.5 || box.bottom > window.innerHeight + 0.5))
      .map(({ el, box }) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}": ${Math.round(box.right)}×${Math.round(box.bottom)}`);
  });
  expect(outside, 'elementos fora da janela').toEqual([]);
}

/** Botões, links e campos visíveis abaixo de 44 px de toque. */
export async function tooSmallTargets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a[href], input, [role="radio"]')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.height < 43.5 || box.width < 43.5)
      .map(({ el, box }) => `${el.textContent?.trim() || el.getAttribute('aria-label')}: ${Math.round(box.width)}×${Math.round(box.height)}`)
  );
}

/** Texto visível menor que `min` px (rótulos que encolheram no celular). */
export async function tinyText(page: Page, min = 12) {
  return page.evaluate((limit) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !node.textContent?.trim() || el.closest('[aria-hidden="true"]') || el.offsetParent === null) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < limit - 0.01) out.push(`"${node.textContent.trim().slice(0, 24)}": ${size}px`);
    }
    return out;
  }, min);
}
