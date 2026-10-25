export interface FpsReport {
  frames: number;
  averageFps: number;
  worstMs: number;
}

/** Estatística de quadros em janelas fixas de tempo; reaproveita o mesmo objeto de relatório. */
export class FpsMeter {
  private frames = 0;
  private elapsed = 0;
  private worst = 0;
  private readonly report: FpsReport = { frames: 0, averageFps: 0, worstMs: 0 };

  constructor(private readonly windowMs: number) {}

  /** Duração de um quadro; devolve o relatório quando a janela fecha, senão null. */
  frame(deltaMs: number): FpsReport | null {
    this.frames++;
    this.elapsed += deltaMs;
    if (deltaMs > this.worst) this.worst = deltaMs;
    if (this.elapsed < this.windowMs) return null;
    this.report.frames = this.frames;
    this.report.averageFps = (this.frames * 1000) / this.elapsed;
    this.report.worstMs = this.worst;
    this.frames = 0;
    this.elapsed = 0;
    this.worst = 0;
    return this.report;
  }
}

export function formatFps(report: FpsReport): string {
  return `${Math.round(report.averageFps)} fps · pior ${Math.round(report.worstMs)} ms`;
}

/** `?fps=1` na URL liga o medidor. */
export function parseFpsFlag(search: string): boolean {
  const value = new URLSearchParams(search).get('fps');
  return value === '1' || value === 'true';
}
