// Gera src/assets/styles/themes/omarchy.ts a partir das paletas oficiais do Omarchy
// (/usr/share/omarchy/themes/*/colors.toml), no mesmo padrão do pontoreferencial. Só a paleta crua
// vai para o app; o resto (contraste, status, hover...) é derivado em build.ts.
//   node scripts/themes/import-omarchy.mjs [pasta-dos-temas]
// Além das cores de interface, escolhe as 4 cordas: as mais distantes entre si depois do ajuste de
// contraste sobre a pista. Paleta que não consegue 4 cordas distantes (as monocromáticas) fica de fora.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaE, ensureContrast } from '../../src/assets/styles/themes/color.ts';

const src = process.argv[2] ?? '/usr/share/omarchy/themes';
const out = join(dirname(fileURLToPath(import.meta.url)), '../../src/assets/styles/themes/omarchy.ts');

/** Mesmo mínimo do themes.test.ts: abaixo disso duas cordas começam a parecer a mesma cor. */
const MIN_STRING_DISTANCE = 25;

// Nomes e personalidade (os mesmos do pontoreferencial). A diversão mora nos nomes.
const meta = {
  'tokyo-night': ['Tokyo Night', 'Neon calmo das madrugadas urbanas'],
  catppuccin: ['Catppuccin', 'O sorvete pastel favorito da internet'],
  nord: ['Nord', 'Fjordo nórdico, frio e sereno'],
  gruvbox: ['Gruvbox', 'Retrô quente, terra e café'],
  everforest: ['Everforest', 'Floresta permanente, verde musgo'],
  kanagawa: ['Kanagawa', 'A onda de Hokusai em tinta sumi-e'],
  miasma: ['Miasma', 'Névoa oliva, minimalismo cru'],
  'matte-black': ['Matte Black', 'Preto fosco com detalhe laranja de fábrica'],
  vantablack: ['Vantablack', 'O tema mais escuro possível, para tocar à meia-luz'],
  lumon: ['Lumon', 'Corredores brancos, tela escura'],
  hackerman: ['Hackerman', 'Terminal verde-matrix, orgulhoso do clichê'],
  'retro-82': ['Retro 82', 'Synthwave de folhinha de 1982'],
  'last-horizon': ['Last Horizon', 'Quase-preto poético, acento rosé'],
  solitude: ['Solitude', 'Cinza-azulado discreto, o tema do silêncio'],
  ethereal: ['Ethereal', 'Azul profundo com pêssego, etéreo e onírico'],
  'osaka-jade': ['Osaka Jade', 'Jade de Osaka, verde profundo e dourado suave'],
  ristretto: ['Ristretto', 'Café curto, marrom-coral acolhedor'],
  'catppuccin-latte': ['Catppuccin Latte', 'A manhã do Catppuccin, macchiato'],
  'rose-pine': ['Rosé Pine', 'Rosé do fim de tarde, quente e literário'],
  'flexoki-light': ['Flexoki Light', 'Papel de livro, tinta azul'],
  lupine: ['Lupine', 'Luz do dia, acento elétrico'],
  white: ['White', 'Papel em branco, contraste máximo'],
};

const pick = (toml, key, fallback) => {
  const m = new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm').exec(toml);
  if (m) return m[1].toLowerCase();
  if (fallback !== undefined) return fallback;
  throw new Error(`campo ${key} ausente`);
};

const hue = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = 60 * (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  return h < 0 ? h + 360 : h;
};

const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const minDistance = (colors) => Math.min(...colors.flatMap((a, i) => colors.slice(i + 1).map((b) => deltaE(a, b))));

/** Matiz-alvo de cada corda, como no Caderno: G violeta, D magenta, A ciano, E âmbar. */
const ROLE_HUES = { G: 260, D: 330, A: 190, E: 45 };

/**
 * Prefere magenta/vermelho/ciano/amarelo nos papéis do Caderno; se ficarem parecidas, procura as 4 mais distantes entre
 * todas as cores da paleta e distribui pelos papéis pela matiz mais próxima.
 */
function pickStrings(t, track) {
  const names = ['magenta', 'red', 'cyan', 'yellow', 'blue', 'green', 'orange', 'bright_magenta', 'bright_red', 'bright_cyan', 'bright_yellow', 'bright_blue', 'bright_green', 'accent'];
  const raw = [...new Set(names.map((n) => pick(t, n, '')).filter(Boolean))];
  const lit = new Map(raw.map((c) => [c, ensureContrast(c, [track], 3)]));
  const preferred = ['magenta', 'red', 'cyan', 'yellow'].map((n) => pick(t, n, ''));
  let best = preferred.every(Boolean) ? preferred : null;
  let bestScore = best ? minDistance(best.map((c) => lit.get(c))) : 0;
  if (bestScore < 30) {
    for (let a = 0; a < raw.length; a++)
      for (let b = a + 1; b < raw.length; b++)
        for (let c = b + 1; c < raw.length; c++)
          for (let d = c + 1; d < raw.length; d++) {
            const set = [raw[a], raw[b], raw[c], raw[d]];
            const score = minDistance(set.map((x) => lit.get(x)));
            if (score > bestScore) [best, bestScore] = [set, score];
          }
  }
  if (!best || bestScore < MIN_STRING_DISTANCE) return null;
  // Papel a papel, a cor livre de matiz mais próxima
  const free = [...best];
  const strings = {};
  for (const [role, target] of Object.entries(ROLE_HUES)) {
    free.sort((x, y) => hueGap(hue(x), target) - hueGap(hue(y), target));
    strings[role] = free.shift();
  }
  return { G: strings.G, D: strings.D, A: strings.A, E: strings.E };
}

const palettes = [];
const skipped = [];
for (const id of Object.keys(meta)) {
  const file = join(src, id, 'colors.toml');
  if (!existsSync(file)) {
    console.warn(`(sem ${id} em ${src})`);
    continue;
  }
  const t = readFileSync(file, 'utf8');
  const [name, tagline] = meta[id];
  const mode = pick(t, 'mode');
  const background = pick(t, 'background');
  const darkBackground = pick(t, 'dark_background');
  const lighter = pick(t, 'lighter_background');
  const selection = pick(t, 'selection');
  const foreground = pick(t, 'foreground');
  // Escuro: cartão mais claro que a página. Claro: página um tom abaixo, cartão no fundo do tema (como o Caderno).
  const page = mode === 'dark' ? background : darkBackground;
  const surface = mode === 'dark' ? lighter : background;
  const track = mode === 'dark' ? darkBackground : selection;
  const strings = pickStrings(t, track);
  if (!strings) {
    skipped.push(id);
    continue;
  }
  palettes.push({
    id,
    name,
    tagline,
    mode,
    background: page,
    surface,
    surfaceHover: selection,
    surfaceBorder: pick(t, 'muted', selection),
    text: foreground,
    textMuted: pick(t, 'dark_foreground'),
    primary: pick(t, 'accent'),
    danger: pick(t, 'red'),
    warning: pick(t, 'yellow'),
    success: pick(t, 'green'),
    track,
    trackLine: mode === 'dark' ? selection : pick(t, 'muted', lighter),
    hitLine: foreground,
    strings,
    judgments: { perfect: foreground, great: strings.A, good: strings.E, miss: pick(t, 'red') },
    art: { wood: pick(t, 'orange', pick(t, 'yellow')), ebony: darkBackground, halo: selection },
  });
}

const unknown = readdirSync(src).filter((d) => !meta[d]);
if (unknown.length) console.warn(`Temas do Omarchy sem nome no catálogo (ignorados): ${unknown.join(', ')}`);
if (skipped.length) console.warn(`Sem 4 cordas distantes (fora do catálogo): ${skipped.join(', ')}`);

const body = palettes.map((p) => `  ${JSON.stringify(p)},`).join('\n');
writeFileSync(
  out,
  `// GERADO por scripts/themes/import-omarchy.mjs a partir das paletas oficiais do Omarchy. Não edite à mão.\n` +
    `import type { Palette } from './types';\n\n` +
    `export const OMARCHY_PALETTES: Palette[] = [\n${body}\n];\n`
);
console.log(`${palettes.length} paletas → ${out}`);
