import { expect, type Page } from '@playwright/test';

/** Título comprido de propósito: as telas com o nome da música precisam cortar ou quebrar sem passar da janela. */
export const LONG_TITLE = 'Concerto para Violino em Mi Menor, Op. 64 — Allegro molto appassionato (versão completa com cadência)';

/**
 * Botões com ▸ ou ◂ (fora do subset latin, desenhados por outra fonte): a seta não muda a altura do botão
 * (medida com e sem ela) e fica no meio do texto, na mesma linha dos botões vizinhos.
 */
export async function expectArrowsAligned(page: Page) {
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a[href]')]
      .filter((el) => el.offsetParent !== null && /[▸◂]/.test(el.textContent ?? ''))
      .map((el) => {
        const arrow = [...el.querySelectorAll('[aria-hidden="true"]')].find((s) => /^[▸◂]$/.test((s.textContent ?? '').trim()))!;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let text: DOMRect | null = null;
        while (!text && walker.nextNode()) {
          const node = walker.currentNode;
          if (arrow.contains(node) || !node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          text = range.getBoundingClientRect();
        }
        const range = document.createRange();
        range.selectNodeContents(arrow);
        const a = range.getBoundingClientRect();
        const mid = (r: DOMRect) => (r.top + r.bottom) / 2;
        const box = el.getBoundingClientRect();
        (arrow as HTMLElement).style.display = 'none';
        const without = el.getBoundingClientRect().height;
        (arrow as HTMLElement).style.display = '';
        const neighbors = [...(el.parentElement?.children ?? [])].filter((s) => s !== el && s.matches('button, a[href]'));
        const half = (n: number) => Math.round(n * 2) / 2;
        return {
          label: (el.textContent ?? '').trim(),
          growth: half(box.height - without),
          offset: text ? half(Math.abs(mid(a) - mid(text))) : 0,
          rowShift: half(Math.max(0, ...neighbors.map((s) => Math.abs(mid(s.getBoundingClientRect()) - mid(box))))),
        };
      })
  );
  expect(buttons.length, 'botões com seta na tela').toBeGreaterThan(0);
  for (const b of buttons) {
    expect(b.growth, `altura que a seta acrescenta a "${b.label}" (px)`).toBe(0);
    expect(b.offset, `seta de "${b.label}" fora do meio do texto (px)`).toBeLessThanOrEqual(2);
    expect(b.rowShift, `"${b.label}" desalinhado dos botões vizinhos (px)`).toBeLessThanOrEqual(0.5);
  }
}

/**
 * Nada passa da janela: sem rolagem e nenhum elemento visível além da borda direita ou de baixo. O que um ancestral
 * recorta (overflow: as notas da partitura dentro da SVG, listas que rolam por dentro) conta só pela parte que aparece.
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

/** Botões, links, campos e opções visíveis abaixo de 44 px de toque. */
export async function tooSmallTargets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, [role="radio"]')]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.height < 43.5 || box.width < 43.5)
      .map(({ el, box }) => `${el.textContent?.trim() || el.getAttribute('aria-label')}: ${Math.round(box.width)}×${Math.round(box.height)}`)
  );
}

/** Tab até o primeiro controle: o foco aparece (contorno sólido ou anel de foco do campo). */
export async function expectVisibleFocus(page: Page) {
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'sem foco';
    const own = getComputedStyle(el).outlineStyle;
    const field = el.closest('label') ? getComputedStyle(el.closest('label')!).outlineStyle : 'none';
    return own === 'solid' || field === 'solid' ? 'solid' : `${own}/${field}`;
  });
  expect(ring, 'contorno de foco').toBe('solid');
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
