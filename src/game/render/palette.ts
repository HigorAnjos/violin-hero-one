import type { Theme } from '../../assets/styles/themes';
import type { Judgment } from '../engine/types';
import { STRING_LETTERS } from '../notation/violin';

/** Cor no formato do Pixi (0xrrggbb) com a transparência separada. */
export interface Tint {
  color: number;
  alpha: number;
}

export interface LanePalette {
  letter: (typeof STRING_LETTERS)[number];
  /** Nota, linha da corda e alvo. */
  main: number;
  /** Letra escrita sobre a nota. */
  onNote: number;
  /** Halo do acerto. */
  glow: Tint;
}

export interface TrackPalette {
  lanes: readonly [LanePalette, LanePalette, LanePalette, LanePalette];
  track: number;
  trackLine: number;
  hitLine: number;
  /** Miolo do alvo vazio. */
  target: number;
  judgments: Record<Judgment, number>;
  /** Linha de detalhe do julgamento (combo, ms, ¢) e medidor de fps. */
  muted: number;
}

const RGBA = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/** '#rrggbb', '#rgb' ou 'rgba(r, g, b, a)' (o que o tema produz) para cor do Pixi. */
export function toTint(css: string): Tint {
  const m = RGBA.exec(css.trim());
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    return { color: (r << 16) | (g << 8) | b, alpha: m[4] === undefined ? 1 : Number(m[4]) };
  }
  const hex = css.trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Cor inválida no tema: ${css}`);
  return { color: parseInt(full, 16), alpha: 1 };
}

const solid = (css: string) => toTint(css).color;

export interface SheetPalette {
  /** Papel da faixa (o mesmo fundo da pista). */
  paper: number;
  /** Linhas da pauta, barras de compasso, números de compasso e nome da nota. */
  line: number;
  /** Clave, armadura, hastes e acidentes. */
  ink: number;
  /** Cabeça, dedo e letra de cada corda, G D A E. */
  strings: readonly [number, number, number, number];
  /** Agulha do "agora" e o rótulo dela (texto em AA). */
  needle: number;
  needleText: number;
  judgments: Record<Judgment, number>;
  /** Laço A–B: banda, marcadores, arco de volta e o texto sobre a bandeirinha (o magenta da prática). */
  loop: number;
  loopText: number;
}

/** Cores da faixa de partitura, todas do tema. */
export function sheetPalette(theme: Theme): SheetPalette {
  const g = theme.game;
  const [G, D, A, E] = STRING_LETTERS.map((letter) => solid(g.strings[letter].main));
  return {
    paper: solid(g.track),
    line: solid(theme.colors.textMuted),
    ink: solid(theme.colors.text),
    strings: [G, D, A, E],
    needle: solid(theme.colors.info.main),
    needleText: solid(theme.colors.info.text),
    judgments: {
      perfect: solid(g.judgments.perfect),
      great: solid(g.judgments.great),
      good: solid(g.judgments.good),
      miss: solid(g.judgments.miss),
    },
    loop: solid(theme.colors.primary.main),
    loopText: solid(theme.colors.primary.text),
  };
}

function lane(theme: Theme, i: 0 | 1 | 2 | 3): LanePalette {
  const letter = STRING_LETTERS[i];
  const s = theme.game.strings[letter];
  return { letter, main: solid(s.main), onNote: solid(s.text), glow: toTint(s.glow) };
}

const lanes = (theme: Theme) => [lane(theme, 0), lane(theme, 1), lane(theme, 2), lane(theme, 3)] as const;

export interface Strings3DPalette {
  /** Corda, letra G D A E, caixa da nota, haste, cauda e coluna da casa da vez. */
  strings: readonly [LanePalette, LanePalette, LanePalette, LanePalette];
  /** Chão do braço (o fundo da pista). */
  floor: number;
  /** Divisas das casas e linhas dos tempos. */
  grid: number;
  /** Barras de compasso, números das casas e medidor de fps. */
  muted: number;
  /** Contorno do chão (o magenta do design). */
  border: number;
  /** Contorno do acerto em volta da caixa. */
  ink: number;
}

/** Cores das Cordas 3D, todas do tema, como a pista. */
export function strings3dPalette(theme: Theme): Strings3DPalette {
  return {
    strings: lanes(theme),
    floor: solid(theme.game.track),
    grid: solid(theme.game.trackLine),
    muted: solid(theme.colors.textMuted),
    border: solid(theme.colors.primary.main),
    ink: solid(theme.colors.text),
  };
}

/** Todas as cores da pista saem do tema; o render não tem cor própria. */
export function trackPalette(theme: Theme): TrackPalette {
  const g = theme.game;
  return {
    lanes: lanes(theme),
    track: solid(g.track),
    trackLine: solid(g.trackLine),
    hitLine: solid(g.hitLine),
    target: solid(theme.colors.surface),
    judgments: {
      perfect: solid(g.judgments.perfect),
      great: solid(g.judgments.great),
      good: solid(g.judgments.good),
      miss: solid(g.judgments.miss),
    },
    muted: solid(theme.colors.textMuted),
  };
}
