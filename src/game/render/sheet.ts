import { Application } from 'pixi.js';
import type { Theme } from '../../assets/styles/themes';
import type { Song } from '../notation/song';
import { FpsMeter, type FpsReport } from './fps';
import { prefersReducedMotion } from './present';
import type { JudgmentEvent } from './scene';
import type { SheetClock } from './sheetLayout';
import { SheetScene } from './sheetScene';

export interface SheetOptions {
  /** Fixo durante a música: trocar de tema é destruir esta faixa e criar outra. */
  theme: Theme;
  song: Song;
  /**
   * O tempo da música no relógio do AudioContext: steadyClock(startAt, bpm) numa partida comum, ou o relógio da prática
   * (laço A–B e andamento, os segments da orquestra). A faixa segue as voltas sozinha: não precisa ser recriada.
   */
  clock: SheetClock;
  width: number;
  height: number;
  /** Padrão: a preferência "reduzir movimento" do sistema. */
  reducedMotion?: boolean;
  showFps?: boolean;
  onFps?: (report: FpsReport) => void;
}

export interface Sheet {
  readonly canvas: HTMLCanvasElement;
  /** Desenha o quadro da hora `now` do AudioContext; chame uma vez por quadro, junto do engine.advance(now). */
  update(now: number): void;
  /** Evento `judgment` de qualquer motor da partida: a marca vai para a nota (noteIndex) da volta que acabou de tocar. */
  onJudgment(event: JudgmentEvent): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

const MAX_RESOLUTION = 2;

async function loadFonts(theme: Theme): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.allSettled([
    document.fonts.load(`700 24px ${theme.fonts.ui}`),
    document.fonts.load(`400 24px ${theme.fonts.ui}`),
    document.fonts.load(`800 24px ${theme.fonts.display}`),
    document.fonts.load(`40px ${theme.fonts.music}`, '𝄞♯♭♮'),
  ]);
}

/**
 * Monta a faixa de partitura num canvas existente ou num contêiner (cria o canvas dentro dele). Como a pista, não tem
 * laço próprio: quem chama update(now) a cada quadro é a tela de jogo.
 */
export async function createSheet(host: HTMLCanvasElement | HTMLElement, options: SheetOptions): Promise<Sheet> {
  const { theme, showFps = false, onFps } = options;
  // Clave, acidentes e textos são assados uma vez: as fontes precisam estar carregadas antes
  await loadFonts(theme);

  const density = globalThis.devicePixelRatio || 1;
  const app = new Application();
  await app.init({
    canvas: host instanceof HTMLCanvasElement ? host : undefined,
    width: options.width,
    height: options.height,
    backgroundAlpha: 0,
    // Como nas Cordas 3D: com tela densa (dpr ≥ 2) o serrilhado quase não aparece, e o MSAA pesa no celular
    antialias: density < 2,
    autoDensity: true,
    resolution: Math.min(density, MAX_RESOLUTION),
    autoStart: false,
    sharedTicker: false,
    preference: 'webgl',
  });
  if (!(host instanceof HTMLCanvasElement)) host.appendChild(app.canvas);

  let scene: SheetScene;
  try {
    scene = new SheetScene(app.renderer, {
      theme,
      song: options.song,
      clock: options.clock,
      reducedMotion: options.reducedMotion ?? prefersReducedMotion(),
    });
    app.stage.addChild(scene);
    scene.layout(options.width, options.height);
  } catch (error) {
    // Ninguém recebe a faixa para destruir: o contexto WebGL não pode ficar preso
    app.destroy({ removeView: !(host instanceof HTMLCanvasElement) }, { children: true, texture: true, textureSource: true });
    throw error;
  }

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
        if (report) {
          onFps?.(report);
          if (showFps) scene.showFps(report);
        }
      }
      lastFrame = t;
      scene.update(now);
      app.render();
    },
    onJudgment(event) {
      if (!destroyed) scene.judge(event);
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
