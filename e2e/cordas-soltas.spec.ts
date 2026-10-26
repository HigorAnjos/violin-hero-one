import { tinyText } from './layout';
import { expect, test } from './microphone';

const PROGRESS = /de 4 cordas/;
const NOTHING_HEARD = '0 de 4 cordas · falta Sol, Ré, Lá e Mi';

test('cordas soltas no microfone: passa as quatro e libera o Continuar', async ({ micPage }) => {
  // O arquivo dura ~11,6 s e repete: no pior caso a corda Sol começa no meio e espera uma volta inteira
  test.setTimeout(60000);
  const page = await micPage('cordas-soltas');
  await page.goto('/primeira-vez/cordas');
  await expect(page.getByRole('status').filter({ hasText: PROGRESS })).toHaveText('4 de 4 cordas · tudo certo!', { timeout: 30000 });
  await expect(page.getByRole('button', { name: /Continuar/ })).toBeEnabled();
  // Os cartões das cordas encolhem no celular deitado: nenhum texto abaixo de 12 px
  expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
});

for (const take of ['silencio', 'tv'] as const) {
  test(`${take} no microfone: não passa corda nenhuma`, async ({ micPage }) => {
    test.setTimeout(30000);
    const page = await micPage(take);
    await page.goto('/primeira-vez/cordas');
    const progress = page.getByRole('status').filter({ hasText: PROGRESS });
    await expect(progress).toHaveText(NOTHING_HEARD);
    if (take === 'tv') {
      // Prova que o arquivo chega: sem isso "nenhuma corda" passaria com o microfone mudo
      const volume = page.getByRole('img', { name: /^Volume: / });
      await expect(volume).not.toHaveAttribute('aria-label', /: 0 de 12$/, { timeout: 8000 });
    }
    // Uma volta inteira do arquivo de 10 s, e mais um pouco
    await page.waitForTimeout(11000);
    await expect(progress).toHaveText(NOTHING_HEARD);
    await expect(page.getByRole('button', { name: /Continuar/ })).toBeDisabled();
    await expect(page).toHaveURL(/\/primeira-vez\/cordas$/);
  });
}
