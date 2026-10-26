// Gera os PNG do manifest (public/icons/) a partir de public/icons/icon.svg, rasterizados pelo Chromium do Playwright.
// Uso: npm run icons — rode depois de mudar o icon.svg. O PNG vai no repositório: o build não depende do navegador.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
const SIZES = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };

const browser = await chromium.launch();
try {
  for (const [name, size] of Object.entries(SIZES)) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.locator('svg').screenshot({ path: join(dir, name) });
    await page.close();
    console.log(`${name} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
