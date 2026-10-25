// Cores em #rrggbb: contraste WCAG, misturas e ajuste até atingir um contraste mínimo.
// Usado para derivar os temas e para o teste que garante AA em todos eles.

type RGB = [number, number, number];

export function parseHex(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}

export const toHex = ([r, g, b]: RGB) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** Mistura `a` com `b`: weight 0 = a, 1 = b. */
export function mix(a: string, b: string, weight: number): string {
  const [x, y] = [parseHex(a), parseHex(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * weight) as RGB);
}

/** Cor translúcida pintada sobre um fundo opaco (como o navegador a mostra). */
export const over = (color: string, alpha: number, base: string) => mix(base, color, alpha);

export const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG (1 a 21). */
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/**
 * Clareia (tema escuro) ou escurece (tema claro) `color` até atingir `min` contra todos os fundos.
 * Mexe só na luminosidade: matiz e saturação ficam, então um vermelho continua vermelho.
 * Muda o mínimo possível: a cor original fica intacta quando já passa.
 */
export function ensureContrast(color: string, backgrounds: string[], min: number): string {
  const passes = (c: string) => backgrounds.every((bg) => contrast(c, bg) >= min);
  if (passes(color)) return color;
  const darkBg = backgrounds.every((bg) => luminance(bg) < 0.5);
  const [h, s, l] = toHsl(color);
  for (let step = 0.01; step <= 1; step += 0.01) {
    const candidate = fromHsl(h, s, Math.min(1, Math.max(0, darkBg ? l + step : l - step)));
    if (passes(candidate)) return candidate;
  }
  return darkBg ? '#ffffff' : '#000000';
}

function toLab(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  // sRGB → XYZ (D65), normalizado pelo branco de referência
  const xyz = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ].map((t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
}

/**
 * Diferença perceptual entre duas cores (ΔE CIE76). Abaixo de ~10 parecem parentes;
 * acima de ~25 ninguém confunde. Usado para manter as 4 cordas distantes entre si.
 */
export function deltaE(a: string, b: string): number {
  const [x, y] = [toLab(a), toLab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Branco ou quase-preto: o que der mais contraste sobre `bg`. */
export function readableOn(bg: string, dark = '#0b0b0f', light = '#ffffff'): string {
  return contrast(light, bg) >= contrast(dark, bg) ? light : dark;
}
