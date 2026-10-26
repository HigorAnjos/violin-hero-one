// Cordas 3D: só a tela 5c importa este módulo (com import()). É Pixi, como a pista e a partitura, então divide com
// elas o pedaço do Pixi e só a cena própria vem a mais.
import { Application } from 'pixi.js';
import type { Theme } from '../../assets/styles/themes';
import type { EngineNote } from '../engine/types';
import { FpsMeter, type FpsReport } from './fps';
import { prefersReducedMotion } from './present';
import type { JudgmentEvent } from './scene';
import type { SheetClock } from './sheetLayout';
import { Strings3DScene } from './strings3dScene';

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

/** Menos que a pista (2): as cordas enchem a tela toda e a meta é 60 fps no celular médio. */
const MAX_RESOLUTION = 1.5;

async function loadFonts(theme: Theme): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.allSettled([document.fonts.load(`800 64px ${theme.fonts.display}`), document.fonts.load(`800 16px ${theme.fonts.ui}`)]);
}

/**
 * Monta as Cordas 3D num canvas existente ou num contêiner (cria o canvas dentro dele). Como a pista, não tem laço
 * próprio: quem chama update(now) a cada quadro é a tela de jogo.
 */
export async function createStrings3D(host: HTMLCanvasElement | HTMLElement, options: Strings3DOptions): Promise<Strings3D> {
  const { theme, onFps } = options;
  // As texturas de texto são assadas uma vez: a fonte do tema precisa estar carregada antes
  await loadFonts(theme);

  const density = globalThis.devicePixelRatio || 1;
  const app = new Application();
  await app.init({
    canvas: host instanceof HTMLCanvasElement ? host : undefined,
    width: options.width,
    height: options.height,
    backgroundAlpha: 0,
    // Com tela densa (dpr ≥ 2) o serrilhado quase não aparece e o MSAA custa caro no celular
    antialias: density < 2,
    autoDensity: true,
    resolution: Math.min(density, MAX_RESOLUTION),
    autoStart: false,
    sharedTicker: false,
    preference: 'webgl',
  });
  if (!(host instanceof HTMLCanvasElement)) host.appendChild(app.canvas);

  const scene = new Strings3DScene(app.renderer, {
    theme,
    notes: options.notes,
    clock: options.clock,
    bars: options.bars,
    reducedMotion: options.reducedMotion ?? prefersReducedMotion(),
    leadSeconds: options.leadSeconds,
  });
  app.stage.addChild(scene);
  scene.layout(options.width, options.height);

  const meter = new FpsMeter(1000);
  let lastFrame = -1;
  let destroyed = false;

  return {
    canvas: app.canvas,
    update(now) {
      if (destroyed) return;
      const t = performance.now();
      if (lastFrame >= 0) {
        const report = meter.frame(t - lastFrame);
        if (report) onFps?.(report);
      }
      lastFrame = t;
      scene.update(now);
      app.render();
    },
    onJudgment(event) {
      if (!destroyed) scene.judge(event);
    },
    setNotes(notes) {
      if (!destroyed) scene.setNotes(notes);
    },
    resize(width, height) {
      if (destroyed) return;
      app.renderer.resize(width, height);
      scene.layout(width, height);
      app.render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      scene.destroy();
      app.destroy({ removeView: !(host instanceof HTMLCanvasElement) }, { children: true });
    },
  };
}
