import { expect, test, type Page } from '@playwright/test';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { launchWith } from './launch';
import { expectFits, expectVisibleFocus, tinyText, tooSmallTargets } from './layout';

// Sem backend: ?turmas=simulada troca as turmas do Supabase pelo fake (src/shell/teacherDemo.ts). Cada tarefa nova
// recebe na hora a entrega dos dois primeiros alunos, para ter o que revisar sem o aparelho do aluno.
test.use({ launchOptions: launchWith(), locale: 'pt-BR' });

async function checkScreen(page: Page, what: string) {
  await expectFits(page);
  expect(await tooSmallTargets(page), `${what}: toque abaixo de 44 px`).toEqual([]);
  expect(await tinyText(page), `${what}: texto abaixo de 12 px`).toEqual([]);
}

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test(`${tema}, fonte ${fonte}: cria turma, cadastra 3 alunos, cria tarefa e revisa uma entrega`, async ({ page }) => {
      await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
      if (fonte === 'reserva') await blockWebFonts(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });

      await page.goto('/professor?turmas=simulada');
      await expect(page.getByRole('heading', { name: 'Crie sua primeira turma' })).toBeVisible();
      await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
      await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
      await checkScreen(page, 'primeira turma');

      await page.getByLabel('Nome da turma').fill('Iniciantes · sábado');
      await page.getByRole('button', { name: 'Criar turma' }).click();
      await expect(page.getByRole('heading', { name: 'Iniciantes · sábado' })).toBeVisible();
      await expect(page.getByText('Código para alunos entrarem')).toBeVisible();

      for (const name of ['Ana', 'Bruno', 'Carla']) {
        await page.getByRole('textbox', { name: 'Nome do aluno' }).fill(name);
        await page.getByRole('button', { name: 'Cadastrar' }).click();
        const pin = page.getByRole('alertdialog', { name: `PIN de ${name}` });
        await expect(pin).toContainText('não aparece de novo');
        if (name === 'Ana') await checkScreen(page, 'PIN do aluno');
        await pin.getByRole('button', { name: 'Anotei o PIN' }).click();
      }
      await expect(page.getByText('Alunos · 3 de 10')).toBeVisible();
      await expect(page.getByRole('table').getByRole('row').nth(1)).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('button', { name: 'Redefinir PIN de Ana' })).toBeInViewport({ ratio: 1 });
      await checkScreen(page, 'painel da turma');

      // Redefinir PIN pede confirmação; "Manter o PIN" é o padrão
      await page.getByRole('button', { name: 'Redefinir PIN de Ana' }).click();
      const resetPin = page.getByRole('alertdialog', { name: 'Redefinir PIN de Ana' });
      await expect(resetPin).toContainText('para de funcionar');
      await expect(resetPin.getByRole('button', { name: 'Manter o PIN' })).toBeFocused();
      await resetPin.scrollIntoViewIfNeeded();
      await expect(resetPin).toBeInViewport({ ratio: 1 });
      await checkScreen(page, 'confirmar novo PIN');
      await page.keyboard.press('Enter');
      await expect(resetPin).toHaveCount(0);

      // Convite do responsável: informação, com copiar e compartilhar
      await page.getByRole('button', { name: 'Convite do responsável de Ana' }).click();
      const invite = page.getByRole('status', { name: 'Convite do responsável de Ana' });
      await expect(invite.getByRole('button', { name: 'Copiar código' })).toBeVisible();
      await expect(invite.getByRole('button', { name: 'Compartilhar' })).toBeVisible();
      await invite.scrollIntoViewIfNeeded();
      await checkScreen(page, 'convite do responsável');
      await invite.getByRole('button', { name: 'Fechar' }).click();

      await page.getByRole('link', { name: /Nova tarefa/ }).click();
      await expect(page.getByRole('heading', { name: 'Nova tarefa' })).toBeVisible();
      // A primeira turma já abre com o nome focado; aqui o foco começa do zero
      await expectVisibleFocus(page);
      await page.getByRole('group', { name: 'Modo de jogo' }).getByRole('button', { name: 'Partitura' }).click();
      await page.getByRole('button', { name: 'Capriche na afinação.' }).click();
      await checkScreen(page, 'nova tarefa');
      // Prazo no passado: aviso do app em pt-BR (não o balão do navegador) e Enviar desligado
      const due = page.getByLabel('Prazo');
      const valid = await due.inputValue();
      await due.fill('2020-01-01');
      await expect(page.getByRole('alert')).toHaveText('O prazo não pode ser antes de hoje.');
      await expect(page.getByRole('button', { name: /Enviar para 3 alunos/ })).toBeDisabled();
      await checkScreen(page, 'prazo inválido');
      await due.fill(valid);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.getByRole('button', { name: /Enviar para 3 alunos/ }).click();

      const inbox = page.getByRole('region', { name: 'Para revisar' });
      await expect(inbox.getByRole('link')).toHaveCount(2);
      await checkScreen(page, 'painel com entregas');
      await inbox.getByRole('link', { name: /^Ana · / }).click();

      await expect(page.getByRole('heading', { name: /^Ana · / })).toBeVisible();
      await expect(page.getByLabel('Afinação por corda')).toContainText('−14 ¢');
      await expect(page.getByText('0:00 / 0:02')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tocar gravação de Ana' })).toBeInViewport({ ratio: 1 });
      await expect(page.getByText(/O áudio fica guardado até 30 dias/)).toBeInViewport({ ratio: 1 });
      await checkScreen(page, 'revisão');
      await page.getByRole('button', { name: 'Tocar gravação de Ana' }).click();
      await expect(page.getByRole('button', { name: 'Pausar gravação de Ana' })).toBeVisible();
      await page.getByRole('group', { name: 'Conceito' }).getByRole('button', { name: 'Ótimo' }).click();
      await page.getByRole('textbox', { name: 'Comentário' }).fill('Som lindo! Arco reto no fim.');
      await page.getByRole('button', { name: 'Enviar revisão' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Ótimo' })).toBeVisible();
      await expect(page.getByText(/O áudio será apagado em/)).toBeVisible();
      await checkScreen(page, 'revisão enviada');

      await page.getByRole('link', { name: /Próxima: Bruno/ }).click();
      await expect(page.getByRole('heading', { name: /^Bruno · / })).toBeVisible();
      await page.getByRole('link', { name: 'Para revisar' }).click();
      await expect(page.getByRole('region', { name: 'Para revisar' }).getByRole('link')).toHaveCount(1);
    });
  }
}

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  test(`${tema}: apagar o aluno fora da turma pede confirmação que cabe na tela, e ele some`, async ({ page }) => {
    await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/professor?turmas=simulada');
    await page.getByLabel('Nome da turma').fill('Cordas');
    await page.getByRole('button', { name: 'Criar turma' }).click();
    for (const name of ['Ana', 'Bruno']) {
      await page.getByRole('textbox', { name: 'Nome do aluno' }).fill(name);
      await page.getByRole('button', { name: 'Cadastrar' }).click();
      await page.getByRole('alertdialog', { name: `PIN de ${name}` }).getByRole('button', { name: 'Anotei o PIN' }).click();
    }
    await fontsReady(page, tema);
    await expect(page.getByRole('button', { name: 'Apagar Bruno' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Desativar Bruno' }).click();
    await page.getByRole('button', { name: 'Apagar Bruno' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Apagar Bruno' });
    await expect(dialog.getByRole('button', { name: 'Manter' })).toBeFocused();
    await dialog.scrollIntoViewIfNeeded();
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await checkScreen(page, 'apagar aluno');
    await dialog.getByRole('button', { name: 'Apagar para sempre' }).click();
    await expect(page.getByRole('button', { name: 'Reativar Bruno' })).toHaveCount(0);
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
  });
}

test('"Sou professor" na entrada; sem backend, a área avisa que está sem conexão', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByRole('link', { name: /Sou professor/ }).click();
  // O build do e2e não tem Supabase: a sessão fica offline e a área avisa
  await expect(page.getByRole('heading', { name: 'Sem conexão' })).toBeVisible();
  await checkScreen(page, 'sem conexão');
});
