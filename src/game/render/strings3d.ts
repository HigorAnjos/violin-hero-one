// Cordas 3D num pedaço próprio: só a tela 5c importa este módulo (com import()), então o three fica fora do download
// inicial e do pedaço da pista. Não exporte nada daqui pelo index do render.
import { CanvasTexture, SRGBColorSpace, WebGLRenderer } from 'three';
import type { Theme } from '../../assets/styles/themes';
import type { EngineNote } from '../engine/types';
import { FpsMeter, type FpsReport } from './fps';
import { prefersReducedMotion } from './present';
import type { JudgmentEvent } from './scene';
import type { SheetClock } from './sheetLayout';
import { BOX } from './strings3dLayout';
import { Strings3DScene, type Baked, type LabelBaker } from './strings3dScene';

export interface Strings3DOptions {
  /** Fixo durante a música: trocar de tema é destruir as cordas e criar outras. */
  theme: Theme;
  notes: readonly EngineNote[];
  width: number;
  height: number;
  /** O tempo da música (o mesmo da partitura): as linhas dos tempos seguem o laço e o andamento da prática. */
  clock?: SheetClock;
  /** Tempo, desde o começo da música, em que cada compasso começa (barras e números). */
  bars?: readonly number[];
  /** Padrão: a preferência "reduzir movimento" do sistema. */
  reducedMotion?: boolean;
  /** Segundos do fundo até a corda (LevelSettings.trackLeadSeconds); padrão LEAD_SECONDS_3D. */
  leadSeconds?: number;
  /** Recebe o relatório de fps a cada segundo. */
  onFps?: (report: FpsReport) => void;
}

export interface Strings3D {
  readonly canvas: HTMLCanvasElement;
  /** Desenha o quadro da hora `now` do AudioContext; chame uma vez por quadro, junto do engine.advance(now). */
  update(now: number): void;
  /** Evento `judgment` do motor (índice da lista de notas atual). */
  onJudgment(event: JudgmentEvent): void;
  /** Troca as notas (a prática: volta nova, troca de andamento), como na pista. */
  setNotes(notes: readonly EngineNote[]): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

const MAX_RESOLUTION = 2;
/** Rótulos assados neste tamanho de fonte (px do canvas) e reduzidos na placa: nítidos até o dobro da densidade. */
const LABEL_PX = 96;

async function loadFonts(theme: Theme): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.allSettled([document.fonts.load(`800 64px ${theme.fonts.display}`), document.fonts.load(`700 16px ${theme.fonts.ui}`)]);
}

const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

function texture(canvas: HTMLCanvasElement): Baked {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return { texture: t, aspect: canvas.width / canvas.height };
}

function context(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d indisponível');
  return [canvas, ctx];
}

let measurer: CanvasRenderingContext2D | null = null;

/** Rótulos em canvas 2D, assados uma vez por cena. */
export const canvasBaker: LabelBaker = {
  text(text, font) {
    const style = `800 ${LABEL_PX}px ${font}`;
    const ruler = (measurer ??= context(1, 1)[1]);
    ruler.font = style;
    const [canvas, ctx] = context(ruler.measureText(text).width + LABEL_PX * 0.2, LABEL_PX * 1.2);
    ctx.font = style;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + LABEL_PX * 0.06);
    return texture(canvas);
  },
  box(text, fill, color, font) {
    const h = LABEL_PX * 1.25;
    const [canvas, ctx] = context((h * BOX.width) / BOX.height, h);
    ctx.fillStyle = css(fill);
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, h * 0.16);
    ctx.fill();
    ctx.font = `800 ${LABEL_PX}px ${font}`;
    ctx.fillStyle = css(color);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + LABEL_PX * 0.06);
    return texture(canvas);
  },
  frame() {
    const [canvas, ctx] = context(LABEL_PX * 2.8, LABEL_PX * 2);
    const line = LABEL_PX * 0.08;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.roundRect(line, line, canvas.width - 2 * line, canvas.height - 2 * line, LABEL_PX * 0.3);
    ctx.stroke();
    return texture(canvas);
  },
};

/**
 * Monta as Cordas 3D num canvas existente ou num contêiner (cria o canvas dentro dele). Como a pista, não tem laço
 * próprio: quem chama update(now) a cada quadro é a tela de jogo.
 */
export async function createStrings3D(host: HTMLCanvasElement | HTMLElement, options: Strings3DOptions): Promise<Strings3D> {
  const { theme, onFps } = options;
  await loadFonts(theme);

  const renderer = new WebGLRenderer({
    canvas: host instanceof HTMLCanvasElement ? host : undefined,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, MAX_RESOLUTION));
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(options.width, options.height);
  if (!(host instanceof HTMLCanvasElement)) host.appendChild(renderer.domElement);

  const scene = new Strings3DScene(canvasBaker, {
    theme,
    notes: options.notes,
    clock: options.clock,
    bars: options.bars,
    reducedMotion: options.reducedMotion ?? prefersReducedMotion(),
    leadSeconds: options.leadSeconds,
  });
  scene.layout(options.width, options.height);

  const meter = new FpsMeter(1000);
  let lastFrame = -1;
  let destroyed = false;
  const draw = () => renderer.render(scene.scene, scene.camera);

  return {
    canvas: renderer.domElement,
    update(now) {
      if (destroyed) return;
      const t = performance.now();
      if (lastFrame >= 0) {
        const report = meter.frame(t - lastFrame);
        if (report) onFps?.(report);
      }
      lastFrame = t;
      scene.update(now);
      draw();
    },
    onJudgment(event) {
      if (!destroyed) scene.judge(event);
    },
    setNotes(notes) {
      if (!destroyed) scene.setNotes(notes);
    },
    resize(width, height) {
      if (destroyed) return;
      renderer.setSize(width, height);
      scene.layout(width, height);
      draw();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      scene.destroy();
      renderer.dispose();
      // Libera o contexto WebGL já: entrar e sair da tela várias vezes não esgota o limite do navegador
      renderer.forceContextLoss();
      if (!(host instanceof HTMLCanvasElement)) renderer.domElement.remove();
    },
  };
}
