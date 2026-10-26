import type { Graphics } from 'pixi.js';
import type { Theme } from '../../assets/styles/themes';

/**
 * Como as notas aparecem, lido do tema (forma e brilho dos especiais) e das opções do jogador (padrões do modo
 * daltônico, nome da nota). Fixo na vida da cena, como o tema.
 */
export interface NoteLook {
  /** 8-Bits: nota e caixa de canto reto. */
  square: boolean;
  /** Neon: 0 a 1, halo em volta da nota e das linhas da pista. */
  glow: number;
  /** Modo daltônico: cada corda com um padrão próprio por cima da cor. */
  patterns: boolean;
  /** Nome da nota (Dó, Ré…) ao lado dela na pista. */
  noteNames: boolean;
}

export interface LookOptions {
  patterns?: boolean;
  noteNames?: boolean;
}

export function noteLook(theme: Theme, options: LookOptions = {}): NoteLook {
  return {
    square: theme.game.noteShape === 'square',
    glow: Math.max(0, Math.min(1, theme.game.glow)),
    patterns: options.patterns ?? false,
    noteNames: options.noteNames ?? false,
  };
}

/** Raio do canto: zero no 8-Bits. */
export const corner = (look: NoteLook, radius: number) => (look.square ? 0 : radius);

/**
 * Camadas do halo do Neon, de fora para dentro: quanto cresce além da forma (fração do menor lado) e a opacidade.
 * Sem brilho, nenhuma camada.
 */
export function glowLayers(look: NoteLook): { spread: number; alpha: number }[] {
  if (look.glow <= 0) return [];
  return [
    { spread: 0.45, alpha: 0.1 * look.glow },
    { spread: 0.28, alpha: 0.16 * look.glow },
    { spread: 0.14, alpha: 0.24 * look.glow },
  ];
}

/**
 * Padrão de cada corda no modo daltônico, G D A E: lisa, pontos, listras diagonais e listras deitadas. A forma
 * distingue a corda mesmo quando duas cores parecem iguais; a letra continua aparecendo sempre.
 */
export const STRING_PATTERNS = ['plain', 'dots', 'diagonal', 'bars'] as const;
export type StringPattern = (typeof STRING_PATTERNS)[number];

/** Desenha o padrão dentro do retângulo (x, y, w, h), na cor `color`; `plain` não desenha nada. */
export function drawPattern(g: Graphics, pattern: StringPattern, x: number, y: number, w: number, h: number, color: number, alpha = 0.55): void {
  const step = h / 3;
  switch (pattern) {
    case 'plain':
      return;
    case 'dots': {
      const r = h * 0.09;
      for (let cy = y + step / 2; cy < y + h; cy += step) for (let cx = x + step / 2; cx < x + w; cx += step) g.circle(cx, cy, r);
      g.fill({ color, alpha });
      return;
    }
    case 'diagonal': {
      const width = h * 0.1;
      // Riscos a 45°, cortados nas bordas do retângulo
      for (let start = -h; start < w; start += step) {
        const x0 = Math.max(0, start);
        const x1 = Math.min(w, start + h);
        if (x1 <= x0) continue;
        g.moveTo(x + x0, y + h - (x0 - start)).lineTo(x + x1, y + h - (x1 - start));
      }
      g.stroke({ color, width, alpha });
      return;
    }
    case 'bars': {
      const width = h * 0.1;
      for (let k = 1; k < 3; k++) g.moveTo(x + w * 0.08, y + k * step).lineTo(x + w * 0.92, y + k * step);
      g.stroke({ color, width, alpha });
      return;
    }
  }
}

const SOLFEGE = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];

/** Nome curto da nota na pista (sem oitava): "Ré", "Fá♯". */
export function noteLabel(midi: number): string {
  return SOLFEGE[((midi % 12) + 12) % 12];
}
