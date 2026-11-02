import type { Page } from '@playwright/test';
import { simulateGame } from '../src/game/engine';
import { ODE } from '../src/game/engine/testing';
import { skipOnboarding } from './choose';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectFits, expectVisibleFocus, tinyText, tooSmallTargets } from './layout';
import { expect, test, warmAudio } from './microphone';
import { openWithState } from './state';

// A turma simulada (src/shell/simulatedClassroom.ts): Iniciantes · sábado, código ADGK-NRUX, Ana Clara (PIN 1000),
// Bruno (1001). Os ids do fake saem em sequência: a turma é turma-1, a Ana aluno-turma-2 e a tarefa da escala tarefa-7.
const CODE = 'ADGK-NRUX';
const ESCALA = { assignmentId: 'tarefa-7', classId: 'turma-1', studentId: 'aluno-turma-2', songTitle: 'Escala de Ré maior' };

async function checkLayout(page: Page, tema: string, fonte: 'real' | 'reserva') {
  await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
  await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
  await expectFits(page);
  expect(await tooSmallTargets(page), 'alvos de toque abaixo de 44 px').toEqual([]);
  expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
}

/** Da tela do código até as tarefas, como a aluna: código pelo link, nome digitado e PIN pelo teclado. */
async function enter(page: Page, name = 'Ana Clara', pin = '1000') {
  await page.getByLabel('Seu nome, como o professor cadastrou').fill(name);
  for (const digit of pin) await page.getByRole('group', { name: 'Teclado do PIN' }).getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: /^Entrar/ }).click();
}

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test(`${tema}, fonte ${fonte}: entrar na turma, PIN, tarefas e entrega cabem, com 44 px e foco visível`, async ({ page }) => {
      await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (fonte === 'reserva') await blockWebFonts(page);

      await page.goto(`/turma?codigo=${CODE}&turmas=simulada`);
      await expect(page.getByRole('heading', { name: 'Entrar na turma do seu professor' })).toBeVisible();
      await checkLayout(page, tema, fonte);
      await expectVisibleFocus(page);

      await page.getByRole('button', { name: /Continuar/ }).click();
      await expect(page).toHaveURL(/\/turma\/entrar\?codigo=ADGK-NRUX/);
      await expect(page.getByText(`código ${CODE} ✓`)).toBeVisible();
      await checkLayout(page, tema, fonte);
      await page.getByLabel('Seu nome, como o professor cadastrou').focus();
      await page.keyboard.press('Shift+Tab');
      await expectVisibleFocus(page);

      await enter(page);
      await expect(page).toHaveURL(/\/tarefas$/);
      await expect(page.getByRole('navigation', { name: 'Tarefas' }).getByRole('button')).toHaveCount(3);
      await expect(page.getByText('Iniciantes · sábado · Ana Clara')).toBeVisible();
      await checkLayout(page, tema, fonte);
      await page.getByRole('navigation', { name: 'Tarefas' }).getByRole('button', { name: /Brilha/ }).click();
      await expect(page.getByRole('group', { name: 'Revisão do professor' })).toContainText('Muito bom');
      await checkLayout(page, tema, fonte);

      // A tela inicial da aluna: Tarefas no menu e nada de ranking
      await page.getByRole('link', { name: /Menu/ }).click();
      await expect(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Tarefas 2 a fazer' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Ranking' })).toHaveCount(0);
      await checkLayout(page, tema, fonte);
    });

    test(`${tema}, fonte ${fonte}: a entrega sem gravação pronta cabe e oferece tocar de novo`, async ({ page }) => {
      await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
      if (fonte === 'reserva') await blockWebFonts(page);
      const result = simulateGame({ song: ODE, startAt: 1, noFail: true }, { errors: 2, seed: 2 }).result;
      const task = { ...ESCALA, songTitle: 'Concerto para Violino em Mi Menor, Op. 64 — Allegro molto appassionato', dueAt: new Date(Date.now() + 86400e3).toISOString() };
      await openWithState(page, '/tarefas/entrega', { song: ODE, mode: 'Arcade', result, clientId: 'e2e', recordAudio: true, task });
      await expect(page.getByRole('heading', { name: /Tarefa tocada!/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Tocar de novo/ })).toBeVisible();
      await checkLayout(page, tema, fonte);
    });
  }
}

test('PIN errado dá a mesma mensagem neutra e, depois de 5, bloqueia mesmo com o PIN certo', async ({ page }) => {
  await page.goto(`/turma/entrar?codigo=${CODE}&turmas=simulada`);
  await enter(page, 'Bruno', '9999');
  await expect(page.getByRole('alert')).toHaveText('Código da turma, nome ou PIN não conferem.');
  await expect(page.getByLabel('PIN de 4 números')).toBeFocused();
  await expect(page.getByLabel('PIN de 4 números')).toHaveValue('');
  // Nome que não existe: a mesma resposta
  await enter(page, 'Fulano', '1001');
  await expect(page.getByRole('alert')).toHaveText('Código da turma, nome ou PIN não conferem.');
  for (let i = 0; i < 4; i++) await enter(page, 'Bruno', '9999');
  await enter(page, 'Bruno', '1001');
  await expect(page.getByRole('alert')).toHaveText('Muitas tentativas. Espere 15 minutos ou peça um PIN novo ao professor.');
  await expect(page).toHaveURL(/\/turma\/entrar/);
});

test('a aluna joga a tarefa com o WAV gravando, a entrega espera na fila sem rede e sobe quando a rede volta', async ({ micPage, isMobile }) => {
  test.skip(isMobile, 'gravação pelo microfone só no desktop');
  test.setTimeout(150000);
  const page = await micPage('escala-re-maior', { loop: false });
  await page.addInitScript(() => {
    localStorage.setItem('vh:onboarded', '1');
    localStorage.setItem('vh:orchestra', JSON.stringify({ enabled: false, headphones: true, volume: 0.8 }));
  });
  await warmAudio(page);
  await page.goto(`/turma/entrar?codigo=${CODE}&turmas=simulada`);
  await enter(page);
  await expect(page).toHaveURL(/\/tarefas$/);
  const card = page.getByRole('navigation', { name: 'Tarefas' }).getByRole('button', { name: /Escala de Ré maior/ });
  await card.click();
  await expect(page.getByRole('link', { name: /Tocar a tarefa/ })).toBeVisible();

  // Direto na partida (sem recarregar: a turma simulada vive na memória da aba), com o WAV começando no microfone
  const dueAt = new Date(Date.now() + 5 * 86400e3).toISOString();
  await page.evaluate((state) => {
    history.pushState({ usr: state, key: 'tarefa', idx: 1 }, '', '/jogo?musica=escala-re-maior');
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, { mode: 'Arcade', recordAudio: true, task: { ...ESCALA, dueAt } });
  await expect(page).toHaveURL(/\/tarefas\/entrega$/, { timeout: 90000 });

  await expect(page.getByRole('heading', { name: /Tarefa tocada! Bora mostrar\?/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ouvir a gravação' })).toBeVisible();
  await expect(page.getByText(/Vai junto: a partida .* e o áudio de \d:\d\d/)).toBeVisible();
  await expectFits(page);
  expect(await tooSmallTargets(page)).toEqual([]);

  await page.context().setOffline(true);
  await page.getByRole('button', { name: /Enviar para o professor/ }).click();
  await expect(page.getByText(/Gravação na fila: sobe sozinha quando houver internet/)).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText('Enviada ✓ O professor já pode ouvir e revisar.')).toBeVisible({ timeout: 15000 });

  await page.getByRole('link', { name: /Ver tarefas/ }).click();
  await expect(page.getByRole('navigation', { name: 'Tarefas' }).getByRole('button', { name: /Escala de Ré maior/ })).toContainText('Entregue · esperando');
});
