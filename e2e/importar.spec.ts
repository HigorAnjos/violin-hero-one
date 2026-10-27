import { expect, test } from '@playwright/test';
import { skipOnboarding } from './choose';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectFits, tinyText, tooSmallTargets } from './layout';

test.beforeEach(async ({page}) => {await skipOnboarding(page);});
const upload = (name:string) => ({name, mimeType:'application/xml', buffer:Buffer.from('<score/>')});

test('importar, escolher parte, jogar e apagar da biblioteca', async ({page}) => {
  await page.goto('/biblioteca');
  await page.getByRole('link',{name:'Importar música'}).click();
  await expect(page).toHaveURL(/\/importar$/);
  await page.goto('/importar?importacao=simulada');
  await page.getByLabel('Escolher partitura').setInputFiles(upload('quarteto.xml'));
  await page.getByRole('button',{name:/Violino II/}).click();
  await expect(page.getByText('Violino II',{exact:true})).toBeVisible();
  await expect(page.getByText(/Só você vê esta música/)).toBeVisible();
  await page.getByRole('link',{name:'Jogar agora'}).click();
  await expect(page).toHaveURL(/\/tocar\?musica=importada-1$/);
  await expect(page.getByRole('heading',{level:1})).toHaveText('Escolha o modo');
  await page.goto('/biblioteca?importacao=simulada');
  await expect(page.getByText('Importada · Só você')).toBeVisible();
  await page.getByRole('button',{name:'Apagar quarteto'}).click();
  const dialog=page.getByRole('dialog',{name:'Apagar música?'});
  await expect(dialog.getByRole('button',{name:'Cancelar'})).toBeFocused();
  await dialog.getByRole('button',{name:'Cancelar'}).click();
  await page.getByRole('button',{name:'Apagar quarteto'}).click();
  await page.getByRole('button',{name:'Apagar música',exact:true}).click();
  await expect(page.getByRole('button',{name:'Apagar quarteto'})).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Importada · Só você')).toHaveCount(0);
});

test('sem rede informa que importar exige internet', async ({page,context}) => {
  await page.goto('/importar?importacao=simulada');
  await context.setOffline(true);
  await expect(page.getByRole('status')).toContainText('Importar precisa de internet');
  await expect(page.getByLabel('Escolher partitura')).toBeDisabled();
});

for (const tema of ['caderno','palco','8-bits'] as const) {
  for (const fonte of ['real','reserva'] as const) {
    test(`${tema}, fonte ${fonte}: prévia, layout, texto e toque`, async ({page,isMobile}) => {
      await page.addInitScript(id=>localStorage.setItem('vh:theme',id),tema);
      if(fonte==='reserva') await blockWebFonts(page);
      await page.goto('/importar?importacao=simulada');
      await page.getByLabel('Escolher partitura').setInputFiles(upload('minueto.xml'));
      await expect(page.getByRole('link',{name:'Jogar agora'})).toBeVisible();
      await (fonte==='real' ? fontsReady(page,tema):fallbackFontsReady(page,tema));
      if(isMobile) expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(0);
      else await expectFits(page);
      expect(await tinyText(page)).toEqual([]);
      expect(await tooSmallTargets(page)).toEqual([]);
    });
  }
}
