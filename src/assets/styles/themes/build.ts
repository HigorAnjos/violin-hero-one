import { base } from './base';
import { contrast, ensureContrast, mix, readableOn, rgba } from './color';
import type { Palette, StringColors, StringName, Theme, ToneColors } from './types';

/** Texto e valores precisam ser lidos (4.5:1); indicadores, bordas e notas, se destacar (3:1). */
const AA = 4.5;
const UI = 3;

function toneColors(raw: string, mode: Palette['mode'], surface: string, background: string): ToneColors {
  const alpha = mode === 'dark' ? 0.12 : 0.1;
  const main = ensureContrast(raw, [surface], UI);
  return {
    main,
    surface: rgba(main, alpha),
    border: rgba(main, 0.35),
    text: ensureContrast(raw, [surface, background, mix(surface, main, alpha)], AA),
  };
}

/** `onNeon`: letra clara sobre a nota (no Caderno, a cor do papel, como o --ink-on-neon do design). */
function stringColors(raw: string, track: string, onNeon: string): StringColors {
  const main = ensureContrast(raw, [track], UI);
  // Letra clara sempre que ela se destaca (3:1, texto curto e grosso); senão, a mais legível
  const text = contrast(onNeon, main) >= UI ? onNeon : readableOn(main, '#0b0b0f', onNeon);
  return { main, text, glow: rgba(main, 0.25) };
}

/** Transforma a paleta crua num Theme completo, com contraste AA garantido. */
export function buildTheme(p: Palette): Theme {
  const dark = p.mode === 'dark';
  const surfaces = [p.surface, p.background];
  const text = ensureContrast(p.text, [...surfaces, p.surfaceHover], AA);
  // A primária aparece como texto (links, valores) e como fundo de botão: precisa dos dois contrastes
  const primary = ensureContrast(p.primary, surfaces, AA);
  const hover = mix(primary, dark ? '#ffffff' : '#000000', 0.18);
  const shadow = dark ? 'rgba(0, 0, 0, 0.45)' : rgba(text, 0.16);
  const strings = Object.fromEntries(
    (Object.entries(p.strings) as [StringName, string][]).map(([name, hex]) => [name, stringColors(hex, p.track, dark ? '#ffffff' : p.background)])
  ) as Record<StringName, StringColors>;

  return {
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    mode: p.mode,
    colors: {
      background: p.background,
      surface: p.surface,
      surfaceHover: p.surfaceHover,
      surfaceBorder: p.surfaceBorder,
      text,
      textMuted: ensureContrast(p.textMuted, surfaces, AA),
      overlay: dark ? rgba(p.background, 0.75) : rgba(text, 0.35),
      shadow,
      primary: {
        main: primary,
        text: readableOn(primary),
        hover,
        surface: rgba(primary, 0.12),
        border: rgba(primary, 0.35),
      },
      danger: toneColors(p.danger, p.mode, p.surface, p.background),
      warning: toneColors(p.warning, p.mode, p.surface, p.background),
      success: toneColors(p.success, p.mode, p.surface, p.background),
      info: toneColors(p.strings.A, p.mode, p.surface, p.background),
    },
    game: {
      strings,
      track: p.track,
      trackLine: p.trackLine,
      hitLine: ensureContrast(p.hitLine, [p.track], UI),
      judgments: {
        perfect: ensureContrast(p.judgments.perfect, [p.track], UI),
        great: ensureContrast(p.judgments.great, [p.track], UI),
        good: ensureContrast(p.judgments.good, [p.track], UI),
        miss: ensureContrast(p.judgments.miss, [p.track], UI),
      },
      // Cada seção herda a cor de uma corda, como no Orchestra.dc: cordas magenta, percussão violeta
      orchestra: {
        strings: strings.D.main,
        woodwinds: strings.A.main,
        brass: strings.E.main,
        percussion: strings.G.main,
      },
      noteShape: 'round',
      glow: 0,
    },
    art: p.art,
    ...base,
    shadows: {
      card: dark ? `0 0.25rem 0.5rem ${shadow}` : `0 0.1875rem 0 ${p.surfaceBorder}`,
    },
  };
}
