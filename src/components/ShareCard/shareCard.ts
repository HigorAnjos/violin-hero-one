import type { Theme } from '../../assets/styles/themes';
import { ensureContrast } from '../../assets/styles/themes/color';
import qrcode from 'qrcode-generator';
import type { Badge } from '../../game/engine';
import { badgeColor } from '../Badge/Badge';
import { formatPercent, formatPoints } from '../ScoreCard/ScoreCard';

/** 16b · Card para compartilhar: retrato 4:5, o tamanho que as redes mostram inteiro. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/** O que vai no cartão: nada de e-mail, apelido digitado nem foto; o nome é o gerado (bicho + número). */
export interface ShareCardData {
  songTitle: string;
  mode: string;
  level: string;
  score: number;
  accuracy: number;
  /** "±7 ¢" ou "—" sem acerto. */
  tuning: string;
  maxCombo: number;
  /** Selos ganhos nesta partida. */
  badges: Pick<Badge, 'label' | 'kind'>[];
  name: string | null;
  record: boolean;
  /** Onde jogar (o endereço do app, sem caminho). */
  site: string;
  /** Link completo do desafio, quando houver. */
  link?: string;
}

/** Só o que o desenho usa do contexto 2D: o teste troca por um gravador. */
export type CardContext = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'font'
  | 'textBaseline'
  | 'textAlign'
  | 'fillRect'
  | 'strokeRect'
  | 'fillText'
  | 'measureText'
  | 'beginPath'
  | 'closePath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'ellipse'
  | 'fill'
  | 'stroke'
  | 'save'
  | 'restore'
  | 'translate'
  | 'rotate'
>;

export interface CardCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): CardContext | null;
}

const MARGIN = 80;
const INNER = CARD_WIDTH - 2 * MARGIN;
/** Largura de cada selo no rodapé: cabe "Afinação de ouro" inteiro. */
const BADGE_SLOT = 160;

/** As fontes do cartão: título no display do tema, números e texto na de interface (no 8-Bits a Pixelify desenha o 5 como S). */
export function cardFonts(theme: Theme) {
  const display = theme.fonts.display;
  const ui = theme.fonts.ui;
  return {
    brand: `800 72px ${display}`,
    title: `700 60px ${display}`,
    pill: `800 24px ${ui}`,
    subtitle: `400 30px ${ui}`,
    score: `400 132px ${ui}`,
    label: `600 22px ${ui}`,
    stat: `400 56px ${ui}`,
    footer: `400 34px ${ui}`,
    footerBold: `800 34px ${ui}`,
    badge: `700 18px ${ui}`,
  };
}

/** Carrega as faces do cartão antes de desenhar: canvas não espera a fonte e desenharia na reserva. Sem rede, segue com a reserva. */
export async function loadCardFonts(theme: Theme, fonts: Pick<FontFaceSet, 'load'> | undefined = globalThis.document?.fonts): Promise<void> {
  if (!fonts) return;
  await Promise.all(Object.values(cardFonts(theme)).map((font) => fonts.load(font).catch(() => [])));
}

/** O texto que cabe em `max` px, com reticências. */
function fit(ctx: CardContext, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function text(ctx: CardContext, value: string, x: number, y: number, font: string, color: string, max = INNER) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(fit(ctx, value, max), x, y);
}

/** O violino de pé, inclinado, como o do design: corpo, espelho, voluta e as quatro cordas nas cores do tema. */
function drawViolin(ctx: CardContext, theme: Theme) {
  const ink = theme.colors.text;
  ctx.save();
  ctx.translate(790, 330);
  ctx.rotate((14 * Math.PI) / 180);
  ctx.lineWidth = 6;
  ctx.strokeStyle = ink;
  ctx.fillStyle = theme.art.wood;
  for (const [y, rx, ry] of [
    [-40, 74, 64],
    [110, 92, 84],
  ]) {
    ctx.beginPath();
    ctx.ellipse(0, y, rx, ry, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillRect(-52, -10, 104, 90);
  ctx.fillStyle = theme.art.ebony;
  ctx.fillRect(-13, -250, 26, 220);
  ctx.strokeRect(-13, -250, 26, 220);
  ctx.beginPath();
  ctx.arc(0, -272, 20, 0, 2 * Math.PI);
  ctx.stroke();
  const strings = ['G', 'D', 'A', 'E'] as const;
  ctx.lineWidth = 3.5;
  strings.forEach((s, i) => {
    ctx.strokeStyle = theme.game.strings[s].main;
    ctx.beginPath();
    ctx.moveTo(-6 + i * 4, -250);
    ctx.lineTo(-6 + i * 4, 130);
    ctx.stroke();
  });
  ctx.restore();
}

/** Hexágono do selo na cor do tipo, com o nome embaixo. */
function drawBadge(ctx: CardContext, theme: Theme, badge: ShareCardData['badges'][number], cx: number, top: number, fonts: ReturnType<typeof cardFonts>) {
  const color = badgeColor(theme, badge.kind);
  const r = 34;
  const cy = top + r;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = theme.colors.background;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.textAlign = 'center';
  text(ctx, badge.label, cx, top + 2 * r + 14, fonts.badge, theme.colors.text, BADGE_SLOT - 4);
  ctx.textAlign = 'left';
}

/** Desenha o cartão no canvas, já em 1080×1350. As fontes precisam estar carregadas (loadCardFonts). */
export function drawShareCard(canvas: CardCanvas, data: ShareCardData, theme: Theme): void {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponível');
  const fonts = cardFonts(theme);
  const { colors, game, art } = theme;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Pauta ao fundo, o halo e o violino
  ctx.strokeStyle = colors.surfaceBorder;
  ctx.lineWidth = 3;
  for (let y = 300; y <= 420; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CARD_WIDTH, y);
    ctx.stroke();
  }
  ctx.fillStyle = art.halo;
  ctx.beginPath();
  ctx.arc(790, 380, 250, 0, 2 * Math.PI);
  ctx.fill();
  drawViolin(ctx, theme);
  for (const [x, y, s] of [
    [520, 250, 'G'],
    [1010, 560, 'A'],
  ] as const) {
    ctx.fillStyle = game.strings[s].main;
    ctx.beginPath();
    ctx.ellipse(x, y, 16, 12, (-20 * Math.PI) / 180, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 14, y - 2);
    ctx.lineTo(x + 14, y - 60);
    ctx.stroke();
  }

  // Marca e "Novo recorde!"
  ctx.font = fonts.brand;
  ctx.fillStyle = colors.text;
  ctx.fillText('Violin ', MARGIN, MARGIN);
  const brandWidth = ctx.measureText('Violin ').width;
  ctx.fillStyle = game.strings.A.main;
  ctx.fillText('Hero', MARGIN + brandWidth, MARGIN);
  if (data.record) {
    ctx.font = fonts.pill;
    const label = 'Novo recorde!';
    const width = ctx.measureText(label).width + 36;
    ctx.fillStyle = colors.primary.main;
    // Pílula redonda; no 8-Bits, de cantos retos como o resto do tema
    if (theme.borderRadius.pill === '0') {
      ctx.fillRect(MARGIN, 168, width, 44);
    } else {
      ctx.beginPath();
      ctx.arc(MARGIN + 22, 190, 22, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.arc(MARGIN + width - 22, 190, 22, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = colors.primary.text;
    ctx.fillText(label, MARGIN + 18, 177);
  }

  // Música, modo, nível e nome; os pontos e os números na fonte de interface
  text(ctx, data.songTitle, MARGIN, 660, fonts.title, colors.text);
  text(ctx, [data.mode, data.level, data.name].filter(Boolean).join(' · '), MARGIN, 738, fonts.subtitle, colors.textMuted);
  text(ctx, formatPoints(data.score), MARGIN, 800, fonts.score, colors.text);
  const stats: [string, string][] = [
    ['PRECISÃO', formatPercent(data.accuracy)],
    ['AFINAÇÃO', data.tuning],
    ['COMBO', String(data.maxCombo)],
  ];
  stats.forEach(([label, value], i) => {
    const x = MARGIN + i * 300;
    text(ctx, label, x, 960, fonts.label, colors.textMuted, 280);
    text(ctx, value, x, 990, fonts.stat, colors.text, 280);
  });
  const bar = (INNER - 3 * 12) / 4;
  (['G', 'D', 'A', 'E'] as const).forEach((s, i) => {
    ctx.fillStyle = game.strings[s].main;
    ctx.fillRect(MARGIN + i * (bar + 12), 1072, bar, 14);
  });

  // Selos abaixo da ilustração, sem disputar espaço com o endereço e o QR.
  data.badges.slice(0, 3).forEach((badge, i) => drawBadge(ctx, theme, badge, MARGIN + (i + 0.5) * BADGE_SLOT, 540, fonts));

  // Rodapé: o mesmo endereço no texto e na matriz, com quatro módulos de silêncio.
  const boxTop = CARD_HEIGHT - MARGIN - 160;
  ctx.strokeStyle = colors.primary.main;
  ctx.lineWidth = 3;
  ctx.strokeRect(MARGIN, boxTop, INNER, 160);
  const link = data.link ?? `https://${data.site.replace(/^https?:\/\//, '')}`;
  const textMax = INNER - 64 - 150;
  text(ctx, 'Consegue me passar?', MARGIN + 32, boxTop + 36, fonts.footer, colors.text, textMax);
  // Reduz só até 12 px para manter o endereço completo visível.
  let size = 34;
  do { ctx.font = `800 ${size}px ${theme.fonts.ui}`; } while (ctx.measureText(link).width > textMax && --size >= 12);
  text(ctx, link, MARGIN + 32, boxTop + 84, `800 ${Math.max(12, size)}px ${theme.fonts.ui}`, colors.text, textMax);
  const qr = qrcode(0, 'M');
  qr.addData(link, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const step = Math.floor(150 / (count + 8));
  const x = MARGIN + INNER - 155;
  const y = boxTop + 5;
  ctx.fillStyle = colors.surface;
  ctx.fillRect(x, y, 150, 150);
  ctx.fillStyle = ensureContrast(colors.text, [colors.surface], 4.5);
  const offset = Math.floor((150 - count * step) / 2);
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) ctx.fillRect(x + offset + col * step, y + offset + row * step, step, step);
    }
  }
}

/** O nome do arquivo: a música sem acento nem espaço. */
export function cardFileName(songTitle: string): string {
  const slug = songTitle
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `violin-hero-${slug || 'resultado'}.png`;
}

type PngCanvas = CardCanvas & Pick<HTMLCanvasElement, 'toBlob'>;

/** Gera o PNG no aparelho: espera as fontes do tema, desenha e devolve o arquivo para compartilhar. */
export async function renderShareCard(
  data: ShareCardData,
  theme: Theme,
  { canvas = document.createElement('canvas') as PngCanvas, fonts = document.fonts as Pick<FontFaceSet, 'load'> | undefined } = {}
): Promise<File> {
  await loadCardFonts(theme, fonts);
  drawShareCard(canvas, data, theme);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('não deu para gerar a imagem');
  return new File([blob], cardFileName(data.songTitle), { type: 'image/png' });
}
