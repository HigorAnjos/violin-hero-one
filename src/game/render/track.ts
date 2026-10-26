import { Application } from 'pixi.js';
import type { Theme } from '../../assets/styles/themes';
import type { EngineNote } from '../engine/types';
import { FpsMeter, type FpsReport } from './fps';
import { prefersReducedMotion } from './present';
import { TrackScene, type JudgmentEvent } from './scene';

export interface TrackOptions {
  /** Fixo durante a música: trocar de tema é destruir esta pista e criar outra. */
  theme: Theme;
  notes: readonly EngineNote[];
  width: number;
  height: number;
  /** Padrão: a preferência "reduzir movimento" do sistema. */
  reducedMotion?: boolean;
  /** Segundos do topo da pista à linha de acerto (LevelSettings.trackLeadSeconds); padrão LEAD_SECONDS. */
  leadSeconds?: number;
  /** Mostra fps e pior quadro no canto da pista. */
  showFps?: boolean;
  /** Recebe o relatório de fps a cada segundo (com ou sem showFps). */
  onFps?: (report: FpsReport) => void;
}

export interface Track {
  readonly canvas: HTMLCanvasElement;
  /** Desenha o quadro da hora `now` do AudioContext; chame uma vez por requestAnimationFrame. */
  update(now: number): void;
  /** Evento `judgment` do motor, para o feedback (acerto, erro com motivo, combo). */
  onJudgment(event: JudgmentEvent): void;
  /** Troca as notas (a prática: volta nova, troca de andamento); o índice de onJudgment é o desta lista. */
  setNotes(notes: readonly EngineNote[]): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

const MAX_RESOLUTION = 2;

async function loadFonts(theme: Theme): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.allSettled([document.fonts.load(`800 64px ${theme.fonts.display}`), document.fonts.load(`800 16px ${theme.fonts.ui}`)]);
}

/**
 * Monta a pista Arcade num canvas existente ou num contêiner (cria o canvas dentro dele). Não tem
 * laço próprio: quem chama update(now) a cada quadro é a tela de jogo, junto do engine.advance(now).
 */
export async function createTrack(host: HTMLCanvasElement | HTMLElement, options: TrackOptions): Promise<Track> {
  const { theme, notes, showFps = false, onFps } = options;
  // As texturas de texto são assadas uma vez: a fonte do tema precisa estar carregada antes
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

  let scene: TrackScene;
  try {
    scene = new TrackScene(app.renderer, { theme, notes, reducedMotion: options.reducedMotion ?? prefersReducedMotion(), leadSeconds: options.leadSeconds });
    app.stage.addChild(scene);
    scene.layout(options.width, options.height);
  } catch (error) {
    // Ninguém recebe a pista para destruir: o contexto WebGL não pode ficar preso
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
