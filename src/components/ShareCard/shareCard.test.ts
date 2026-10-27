import { describe, expect, it, vi } from 'vitest';
import qrcode from 'qrcode-generator';
import { contrast } from '../../assets/styles/themes/color';
import { cadernoTheme, type Theme } from '../../assets/styles/themes';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { pixelTheme } from '../../assets/styles/themes/specials';
import { CARD_HEIGHT, CARD_WIDTH, cardFileName, cardFonts, drawShareCard, renderShareCard, type CardCanvas, type CardContext, type ShareCardData } from './shareCard';

/** Contexto 2D de mentira: grava cada texto com a fonte e a cor do momento. Largura = 0,5 × tamanho por letra. */
function recorder() {
  const texts: { text: string; font: string; color: string; x: number; y: number }[] = [];
  const rects: { x: number; y: number; w: number; h: number; color: string }[] = [];
  const state = { font: '', fillStyle: '' as unknown };
  const noop = () => undefined;
  const ctx = {
    get font() {
      return state.font;
    },
    set font(v: string) {
      state.font = v;
    },
    get fillStyle() {
      return state.fillStyle as string;
    },
    set fillStyle(v: string) {
      state.fillStyle = v;
    },
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    textBaseline: 'alphabetic',
    textAlign: 'left',
    fillText: (text: string, x: number, y: number) => texts.push({ text, font: state.font, color: String(state.fillStyle), x, y }),
    measureText: (text: string) => ({ width: text.length * Number(/(\d+)px/.exec(state.font)?.[1] ?? 10) * 0.5 }) as TextMetrics,
    fillRect: (x: number, y: number, w: number, h: number) => rects.push({ x, y, w, h, color: String(state.fillStyle) }),
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
  } as unknown as CardContext;
  const canvas: CardCanvas = { width: 300, height: 150, getContext: () => ctx };
  return { canvas, texts, rects };
}

const DATA: ShareCardData = {
  songTitle: 'Ode à Alegria',
  mode: 'Cordas 3D',
  level: 'Médio',
  score: 12345,
  accuracy: 98.4,
  tuning: '±7 ¢',
  maxCombo: 55,
  badges: [
    { label: 'Combo 50', kind: 'combo' },
    { label: 'Afinação de ouro', kind: 'afinacao' },
  ],
  name: 'Raposa 1234',
  record: true,
  site: 'https://violinhero.app',
};

const THEMES = [
  ['Caderno', cadernoTheme],
  ['Palco', palcoTheme],
  ['8-Bits', pixelTheme],
] as [string, Theme][];

describe('cartão para compartilhar', () => {
  it.each(THEMES)('QR com matriz M, silêncio e contraste AA em %s', (_name, theme) => {
    for (const link of [undefined, 'https://violinhero.app/desafio/ABC123']) {
      const { canvas, rects, texts } = recorder();
      drawShareCard(canvas, { ...DATA, site: 'violinhero.app', link }, theme);
      const expected = link ?? 'https://violinhero.app';
      const qr = qrcode(0, 'M');
      qr.addData(expected, 'Byte');
      qr.make();
      const count = qr.getModuleCount();
      const step = Math.floor(150 / (count + 8));
      const offset = Math.floor((150 - count * step) / 2);
      const background = rects.findIndex((r) => r.x === 845 && r.y === 1115 && r.w === 150 && r.h === 150);
      expect(background).toBeGreaterThan(0);
      const modules = rects.slice(background + 1);
      const expectedRects = [];
      for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) expectedRects.push({ x: 845 + offset + col * step, y: 1115 + offset + row * step, w: step, h: step });
      }
      expect(modules.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual(expectedRects);
      expect(offset).toBeGreaterThanOrEqual(4 * step);
      expect(contrast(modules[0].color, rects[background].color)).toBeGreaterThanOrEqual(4.5);
      expect(texts.some((t) => t.text === expected)).toBe(true);
    }
  });
  describe.each(THEMES)('tema %s', (_name, theme) => {
    it('1080×1350 com música, modo, nível, nome gerado, pontos, precisão, afinação, combo e selos', () => {
      const { canvas, texts } = recorder();
      drawShareCard(canvas, DATA, theme);
      expect([canvas.width, canvas.height]).toEqual([CARD_WIDTH, CARD_HEIGHT]);
      expect([CARD_WIDTH, CARD_HEIGHT]).toEqual([1080, 1350]);
      const all = texts.map((t) => t.text);
      for (const expected of ['Ode à Alegria', 'Cordas 3D · Médio · Raposa 1234', '12.345', '98,4%', '±7 ¢', '55', 'Combo 50', 'Afinação de ouro', 'Novo recorde!', 'https://violinhero.app', 'PRECISÃO']) {
        expect(all).toContain(expected);
      }
      expect(all).toContain('https://violinhero.app');
      expect(all.join(' ')).not.toMatch(/@/);
      // Tudo dentro do cartão
      for (const t of texts) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeLessThan(CARD_HEIGHT);
      }
    });

    it('números na fonte de interface do tema; o título na de display', () => {
      const { canvas, texts } = recorder();
      drawShareCard(canvas, DATA, theme);
      const fontOf = (text: string) => texts.find((t) => t.text === text)!.font;
      for (const n of ['12.345', '98,4%', '55']) expect(fontOf(n)).toContain(theme.fonts.ui);
      expect(fontOf('Ode à Alegria')).toContain(theme.fonts.display);
      if (theme.special === 'pixel') {
        for (const n of ['12.345', '98,4%', '55']) expect(fontOf(n)).not.toMatch(/Pixelify/);
      }
    });
  });

  it('sem nome (sem sessão), sem recorde e sem selos: o cartão sai sem essas partes; título longo ganha reticências', () => {
    const { canvas, texts } = recorder();
    const title = 'Concerto para Violino em Mi Menor, Op. 64 — Allegro molto appassionato';
    drawShareCard(canvas, { ...DATA, songTitle: title, name: null, record: false, badges: [] }, cadernoTheme);
    const all = texts.map((t) => t.text);
    expect(all).toContain('Cordas 3D · Médio');
    expect(all).not.toContain('Novo recorde!');
    const drawn = all.find((t) => t.startsWith('Concerto'))!;
    expect(drawn.endsWith('…')).toBe(true);
    expect(drawn.length * 30).toBeLessThanOrEqual(920);
  });

  it('carrega as fontes do tema antes de desenhar e devolve um PNG com nome da música', async () => {
    const order: string[] = [];
    const { canvas: base } = recorder();
    const canvas = {
      ...base,
      getContext: (kind: '2d') => {
        order.push('draw');
        return base.getContext(kind);
      },
      toBlob: (cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' })),
    };
    const load = vi.fn(async (font: string) => {
      order.push(`load ${font}`);
      return [];
    });
    const file = await renderShareCard(DATA, pixelTheme, { canvas, fonts: { load } as unknown as FontFaceSet });
    expect(load).toHaveBeenCalledWith(cardFonts(pixelTheme).brand);
    expect(order.at(-1)).toBe('draw');
    expect(order.filter((o) => o.startsWith('load'))).toHaveLength(Object.keys(cardFonts(pixelTheme)).length);
    expect(file.name).toBe('violin-hero-ode-a-alegria.png');
    expect(file.type).toBe('image/png');
  });

  it('fonte que não carrega (sem rede) não impede o cartão', async () => {
    const { canvas: base } = recorder();
    const canvas = { ...base, toBlob: (cb: BlobCallback) => cb(new Blob(['png'])) };
    const load = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(renderShareCard(DATA, cadernoTheme, { canvas, fonts: { load } as unknown as FontFaceSet })).resolves.toBeInstanceOf(File);
    expect(cardFileName('!!!')).toBe('violin-hero-resultado.png');
  });
});
