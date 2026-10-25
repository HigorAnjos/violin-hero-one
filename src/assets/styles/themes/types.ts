/** Cor de status: borda/indicador, fundo tintado, borda tintada e texto legível. */
export interface ToneColors {
  main: string;
  surface: string;
  border: string;
  text: string;
}

/** Cordas do violino, da mais grave para a mais aguda. A letra aparece sempre junto da cor. */
export type StringName = 'G' | 'D' | 'A' | 'E';

export interface StringColors {
  /** Nota, trilha e brilho da corda. Contraste 3:1 sobre a pista. */
  main: string;
  /** Letra (G, D, A, E) escrita sobre a nota. */
  text: string;
  /** Halo translúcido do acerto. */
  glow: string;
}

export type Judgment = 'perfect' | 'great' | 'good' | 'miss';

export type OrchestraSection = 'strings' | 'woodwinds' | 'brass' | 'percussion';

/**
 * Tudo que muda de um tema para outro é cor. Espaçamento, raios e tipografia são iguais em todos
 * (vêm de `base`), para ninguém reaprender a tela ao trocar de tema. Exceção: os especiais.
 */
export interface Theme {
  id: string;
  name: string;
  /** Uma frase de personalidade, mostrada no seletor. */
  tagline: string;
  mode: 'dark' | 'light';
  /** Exceção isolada: tema com estética própria (fonte, cantos), fora do catálogo de cor. */
  special?: 'pixel' | 'neon';
  colors: {
    /** Fundo da página (camada mais profunda). */
    background: string;
    /** Cartões, painéis, diálogos. */
    surface: string;
    surfaceHover: string;
    surfaceBorder: string;
    text: string;
    textMuted: string;
    /** Véu atrás de modal e gaveta. */
    overlay: string;
    /** Cor das sombras projetadas. */
    shadow: string;
    primary: {
      main: string;
      /** Texto sobre botão primário (contraste automático). */
      text: string;
      hover: string;
      surface: string;
      border: string;
    };
    danger: ToneColors;
    warning: ToneColors;
    success: ToneColors;
    /** Ciano da corda Lá como tom de informação: links, "ouvindo", contadores. Texto já em AA. */
    info: ToneColors;
  };
  /** Bloco do jogo: lido pelas telas e pelo render (PixiJS/Three.js recebem o tema como objeto). */
  game: {
    strings: Record<StringName, StringColors>;
    /** Fundo da pista. */
    track: string;
    /** Linhas que separam as trilhas das cordas. */
    trackLine: string;
    /** Linha de acerto. */
    hitLine: string;
    /** Texto do julgamento, escrito sobre a pista. */
    judgments: Record<Judgment, string>;
    orchestra: Record<OrchestraSection, string>;
  };
  fonts: { display: string; ui: string };
  spacing: { xxs: string; xs: string; sm: string; md: string; lg: string; xl: string };
  borderRadius: { sm: string; md: string; lg: string; pill: string };
  shadows: { card: string };
}

/** Paleta crua de um tema, antes de virar Theme pelo buildTheme. */
export interface Palette {
  id: string;
  name: string;
  tagline: string;
  mode: 'dark' | 'light';
  background: string;
  surface: string;
  surfaceHover: string;
  surfaceBorder: string;
  text: string;
  textMuted: string;
  primary: string;
  danger: string;
  warning: string;
  success: string;
  track: string;
  trackLine: string;
  hitLine: string;
  strings: Record<StringName, string>;
  judgments: Record<Judgment, string>;
}
