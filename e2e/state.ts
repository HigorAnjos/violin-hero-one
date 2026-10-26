import type { Page } from '@playwright/test';

/** Abre uma tela com o estado de navegação que a partida deixaria (o BrowserRouter lê history.state.usr). */
export async function openWithState(page: Page, path: string, state: unknown) {
  await page.goto('/');
  await page.evaluate(([p, s]) => history.replaceState({ usr: s, key: 'e2e', idx: 0 }, '', p as string), [path, state] as const);
  await page.reload();
}
