import { expect, test, type Locator, type Page } from '@playwright/test';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { launchWith } from './launch';
import { expectFits, expectFitsWidth, overlappingTargets, tinyText, tooSmallTargets } from './layout';

// Duas tarefas da mesma música em modos diferentes: o professor distingue as duas pelo nível e pelo modo no painel
// de tarefas, nas colunas da tabela de alunos e na lista da nova tarefa (?turmas=simulada, sem backend).
test.use({ launchOptions: launchWith(), locale: 'pt-BR' });

const SONG = 'Escala de Ré maior';
const MODES = ['Arcade', 'Cordas 3D'] as const;

/** Desktop nos dois tamanhos de mesa; o projeto celular (toque) deitado e em pé. */
const sizesOf = (isMobile: boolean) =>
  isMobile
    ? [
        { width: 844, height: 390, portrait: false },
        { width: 390, height: 844, portrait: true },
      ]
    : [
        { width: 1280, height: 720, portrait: false },
        { width: 1580, height: 870, portrait: false },
      ];

async function checkScreen(page: Page, what: string, portrait: boolean) {
  await (portrait ? expectFitsWidth(page) : expectFits(page));
  expect(await tooSmallTargets(page), `${what}: toque abaixo de 44 px`).toEqual([]);
  expect(await tinyText(page), `${what}: texto abaixo de 12 px`).toEqual([]);
  expect(await overlappingTargets(page), `${what}: controles sobrepostos`).toEqual([]);
}

/** O texto aparece inteiro: sem reticências, sem linha escondida pelo corte de linhas, dentro da janela. */
async function expectWhole(text: Locator, what: string) {
  await text.scrollIntoViewIfNeeded();
  await expect(text, what).toBeInViewport({ ratio: 1 });
  const cut = await text.evaluate((el) => el.scrollWidth - el.clientWidth > 0.5 || el.scrollHeight - el.clientHeight > 1);
  expect(cut, `${what}: cortado`).toBe(false);
}

async function createTask(page: Page, mode: (typeof MODES)[number]) {
  await page.getByRole('link', { name: /Nova tarefa/ }).click();
  await expect(page.getByRole('heading', { name: 'Nova tarefa' })).toBeVisible();
  const song = page.getByRole('combobox');
  await expect(song).toBeEnabled();
  await song.selectOption({ label: SONG });
  await page.getByRole('group', { name: 'Nível' }).getByRole('button', { name: 'Fácil' }).click();
  await page.getByRole('group', { name: 'Modo de jogo' }).getByRole('button', { name: mode }).click();
  await page.getByRole('button', { name: /Enviar para/ }).click();
  await expect(page.getByRole('region', { name: 'Tarefas', exact: true })).toBeVisible();
}

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test(`${tema}, fonte ${fonte}: duas tarefas da mesma música se distinguem por nível e modo`, async ({ page, isMobile }) => {
      test.setTimeout(90000);
      await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
      if (fonte === 'reserva') await blockWebFonts(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });

      await page.goto('/professor?turmas=simulada');
      await page.getByLabel('Nome da turma').fill('Violino 1 · sábado');
      await page.getByRole('button', { name: 'Criar turma' }).click();
      await page.getByRole('textbox', { name: 'Nome do aluno' }).fill('Ana');
      await page.getByRole('button', { name: 'Cadastrar' }).click();
      await page.getByRole('alertdialog', { name: 'PIN de Ana' }).getByRole('button', { name: 'Anotei o PIN' }).click();
      for (const mode of MODES) await createTask(page, mode);
      await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));

      // A turma simulada vive na memória da página: troca o tamanho e navega pelo app, sem recarregar
      for (const { width, height, portrait } of sizesOf(isMobile)) {
        const at = `${width}×${height}`;
        await page.setViewportSize({ width, height });
        await expect(page.getByRole('heading', { name: 'Violino 1 · sábado' })).toBeVisible();

        // 1. Painel Tarefas: a música numa linha e "Fácil · Arcade · até …" na de baixo, inteiras
        const tasks = page.getByRole('region', { name: 'Tarefas', exact: true });
        for (const mode of MODES) {
          const item = tasks.getByRole('link', { name: `Entregas de ${SONG} · Fácil · ${mode}` });
          await expect(item).toBeVisible();
          const variant = tasks.getByText(new RegExp(`^Fácil · ${mode} · até `));
          await expectWhole(variant, `${at} tarefas: Fácil · ${mode}`);
        }
        for (const song of await tasks.getByText(SONG, { exact: true }).all()) await expectWhole(song, `${at} tarefas: ${SONG}`);

        // 2. Tabela de alunos (só na mesa; deitado e em pé a situação fica no painel de tarefas): cada coluna diz nível e modo
        const table = page.getByRole('table');
        if (!isMobile) {
          const headers = table.getByRole('columnheader');
          for (const mode of MODES) {
            const header = table.getByRole('columnheader', { name: `${SONG} · Fácil · ${mode}` });
            await expect(header).toContainText(`Fácil · ${mode}`);
            await expectWhole(header, `${at} coluna ${mode}`);
            // O selo da Ana está na coluna da tarefa: mesma posição do cabeçalho
            const index = await header.evaluate((th) => [...th.parentElement!.children].indexOf(th));
            await expect(table.getByRole('row').filter({ hasText: 'Ana' }).getByRole('cell').nth(index)).toHaveText(/Sem entrega|Revisar|Tocou/);
          }
          await expect(headers).toHaveCount(5);
          const wide = await table.evaluate((t) => t.getBoundingClientRect().right - t.parentElement!.getBoundingClientRect().right);
          expect(wide, `${at}: tabela passa do painel`).toBeLessThanOrEqual(0.5);
        }
        // 4. Para revisar: a entrega diz de qual das duas tarefas é
        const inbox = page.getByRole('region', { name: 'Para revisar' });
        for (const mode of MODES) await expect(inbox.getByRole('link', { name: new RegExp(`Ana · ${SONG}\\s*Fácil · ${mode} · `) })).toBeVisible();
        await checkScreen(page, `${at} turma`, portrait);

        // 3. Nova tarefa, "Tarefas da turma": cada item com nível e modo
        await page.getByRole('link', { name: /Nova tarefa/ }).click();
        const list = page.getByRole('region', { name: 'Tarefas da turma' });
        for (const mode of MODES) {
          const item = list.getByRole('listitem', { name: `${SONG} · Fácil · ${mode}` });
          await expect(item).toBeAttached();
          await expectWhole(item.getByText(`Fácil · ${mode}`, { exact: true }), `${at} nova tarefa: ${mode}`);
          await expectWhole(item.getByText(SONG, { exact: true }), `${at} nova tarefa: ${SONG}`);
        }
        await checkScreen(page, `${at} nova tarefa`, portrait);
        await page.getByRole('link', { name: 'Violino 1 · sábado' }).click();
      }
    });
  }
}
