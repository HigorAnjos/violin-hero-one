// Gera, a partir de public/icons/icon.svg (o ícone do Caderno), as imagens das lojas e os ícones nativos, rasterizadas
// pelo Chromium do Playwright. Uso: npm run store:graphics — rode de novo depois de mudar o icon.svg. Os PNG vão no
// repositório: o build não depende do navegador.
//   store/play-icon-512.png             ícone da ficha da Play (512×512, 32 bits)
//   store/feature-graphic-1024x500.png  gráfico de destaque da Play (1024×500, PNG 24 bits sem alfa, como a Play pede)
//   android/.../mipmap-*/ic_launcher*.png e values/ic_launcher_background.xml   ícone do app no Android (adaptável)
//   android/.../drawable*/splash.png    abertura do app no Android, no tamanho de cada arquivo
//   ios/.../AppIcon-512@2x.png          ícone do app no iOS (1024×1024 sem alfa: a App Store recusa transparência)
//   ios/.../Splash.imageset/*.png       abertura do app no iOS
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'icons', 'icon.svg'), 'utf8');
/** A arte sem o fundo (o papel creme entra por cor de fundo, onde o sistema pede). */
const art = svg.replace(/<rect [^>]*\/>/, '');
const PAPER = '#fbf6ea';
const INK = '#1f2a44';
const res = join(root, 'android', 'app', 'src', 'main', 'res');
const iosAssets = join(root, 'ios', 'App', 'App', 'Assets.xcassets');

const font = (pkg, file) => `data:font/woff2;base64,${readFileSync(join(root, 'node_modules', '@fontsource', pkg, 'files', file)).toString('base64')}`;
const FONTS = `
  @font-face { font-family: 'Baloo 2'; font-weight: 800; src: url(${font('baloo-2', 'baloo-2-latin-800-normal.woff2')}) format('woff2'); }
  @font-face { font-family: 'Nunito'; font-weight: 700; src: url(${font('nunito', 'nunito-latin-700-normal.woff2')}) format('woff2'); }`;

// ---------- PNG: tamanho, decodificação (8 bits, sem entrelaçamento) e PNG RGB sem alfa ----------
function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** Pixels RGBA de um PNG de 8 bits RGB ou RGBA (o que o Chromium grava). */
function decodePng(buf) {
  const { width, height } = pngSize(buf);
  const colorType = buf[25];
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (buf[24] !== 8 || !channels || buf[28] !== 0) throw new Error('PNG fora do formato esperado (8 bits, RGB/RGBA, sem entrelaçar)');
  const idat = [];
  for (let at = 8; at < buf.length; ) {
    const len = buf.readUInt32BE(at);
    if (buf.toString('ascii', at + 4, at + 8) === 'IDAT') idat.push(buf.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      line[i] = (line[i] + [0, a, b, (a + b) >> 1, paeth][filter]) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) out[(y * width + x) * 4 + k] = line[x * channels + k];
      out[(y * width + x) * 4 + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    prev = line;
  }
  return { width, height, rgba: out };
}

/** O mesmo PNG sem o canal alfa (24 bits), com o fundo já opaco. */
function opaquePng(buf) {
  const { width, height, rgba } = decodePng(buf);
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rgba.copy(raw, y * (width * 3 + 1) + 1 + x * 3, (y * width + x) * 4, (y * width + x) * 4 + 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- cenas ----------
const page = (w, h, body, background = 'transparent') =>
  `<!doctype html><style>${FONTS} html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${background}}</style>${body}`;

/** A arte centrada, com `scale` do lado menor (o ícone foi desenhado dentro do círculo de 80% do lado). */
const centered = (w, h, scale) => {
  const size = Math.round(Math.min(w, h) * scale);
  return `<div style="display:grid;place-items:center;width:${w}px;height:${h}px">${art.replace('<svg ', `<svg style="width:${size}px;height:${size}px;display:block" `)}</div>`;
};

const featureGraphic = page(
  1024,
  500,
  `<div style="position:relative;width:1024px;height:500px;font-family:'Nunito';color:${INK}">
    <div style="position:absolute;left:20px;top:60px;width:380px;height:380px">${art.replace('<svg ', '<svg style="width:380px;height:380px;display:block" ')}</div>
    <div style="position:absolute;left:420px;top:130px;width:580px">
      <div style="font-family:'Baloo 2';font-weight:800;font-size:96px;line-height:100px;white-space:nowrap">Violin Hero</div>
      <div style="margin-top:18px;font-weight:700;font-size:30px;line-height:40px">Toque o seu violino de verdade.<br>O jogo ouve a nota, o tempo e a afinação.</div>
      <div style="display:flex;gap:14px;margin-top:26px">
        ${['#6b4bd8', '#d63a8a', '#0b8fa8', '#b87800'].map((c) => `<span style="width:56px;height:12px;border-radius:6px;background:${c}"></span>`).join('')}
      </div>
    </div>
  </div>`,
  PAPER,
);

const ANDROID_DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch();
try {
  const shot = async (w, h, html, clip) => {
    const tab = await browser.newPage({ viewport: { width: w, height: h } });
    await tab.setContent(html);
    await tab.evaluate(() => document.fonts.ready);
    const buf = await tab.screenshot({ omitBackground: true, ...(clip ? { clip } : {}) });
    await tab.close();
    return buf;
  };
  const save = (path, buf) => {
    writeFileSync(path, buf);
    const { width, height } = pngSize(buf);
    console.log(`${path.slice(root.length + 1)} (${width}×${height})`);
  };

  mkdirSync(join(root, 'store'), { recursive: true });
  save(join(root, 'store', 'play-icon-512.png'), await shot(512, 512, page(512, 512, centered(512, 512, 1), PAPER)));
  save(join(root, 'store', 'feature-graphic-1024x500.png'), opaquePng(await shot(1024, 500, featureGraphic)));

  // Android: o adaptável (fundo creme + arte no primeiro plano de 108 dp, dentro do círculo seguro de 66 dp) e os
  // antigos (quadrado e redondo) para Android 7
  writeFileSync(
    join(res, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${PAPER.toUpperCase()}</color>\n</resources>\n`,
  );
  for (const [density, k] of Object.entries(ANDROID_DENSITIES)) {
    const dir = join(res, `mipmap-${density}`);
    const fg = Math.round(108 * k);
    save(join(dir, 'ic_launcher_foreground.png'), await shot(fg, fg, page(fg, fg, centered(fg, fg, 66 / 108 / 0.8))));
    const legacy = Math.round(48 * k);
    save(join(dir, 'ic_launcher.png'), await shot(legacy, legacy, page(legacy, legacy, centered(legacy, legacy, 1), PAPER)));
    save(
      join(dir, 'ic_launcher_round.png'),
      await shot(legacy, legacy, page(legacy, legacy, `<div style="width:${legacy}px;height:${legacy}px;border-radius:50%;overflow:hidden;background:${PAPER}">${centered(legacy, legacy, 1)}</div>`)),
    );
  }
  const splashes = readdirSync(res).filter((d) => d.startsWith('drawable')).map((d) => join(res, d, 'splash.png'));
  splashes.push(...readdirSync(join(iosAssets, 'Splash.imageset')).filter((f) => f.endsWith('.png')).map((f) => join(iosAssets, 'Splash.imageset', f)));
  for (const path of splashes) {
    let size;
    try {
      size = pngSize(readFileSync(path));
    } catch {
      continue;
    }
    // A arte com 30% do lado menor, no papel creme (a abertura não leva texto: muda de tamanho em cada aparelho)
    save(path, opaquePng(await shot(size.width, size.height, page(size.width, size.height, centered(size.width, size.height, 0.3), PAPER))));
  }
  save(join(iosAssets, 'AppIcon.appiconset', 'AppIcon-512@2x.png'), opaquePng(await shot(1024, 1024, page(1024, 1024, centered(1024, 1024, 1), PAPER))));
} finally {
  await browser.close();
}
