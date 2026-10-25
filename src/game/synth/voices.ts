import type { Part } from './arrange';

/**
 * Senoides puras com envelopes lineares. Senoide não tem harmônico: um Dó3 com 2º harmônico poria energia em cima do
 * Dó4 da melodia, e o microfone ouviria. Os naipes se distinguem por registro, ritmo e envelope, não por timbre.
 */
export interface Voice {
  /** Nível de cada nota em dB, antes do volume geral. */
  gainDb: number;
  attack: number;
  decay: number;
  /** 0 a 1. */
  sustain: number;
  release: number;
  /** Instâncias monofônicas: notas simultâneas da parte. */
  polyphony: number;
  /** Tímpano: a altura começa em `octaves` × a nota e desce até ela em `pitchDecay` s (MembraneSynth). */
  membrane?: { octaves: number; pitchDecay: number };
}

export const VOICES: Readonly<Record<Part, Voice>> = {
  bass: { gainDb: -10, attack: 0.02, decay: 0.01, sustain: 1, release: 0.12, polyphony: 1 },
  pad: { gainDb: -18, attack: 0.08, decay: 0.01, sustain: 1, release: 0.25, polyphony: 3 },
  // Ataque e queda lentos: colcheias com ataque de 10 ms modulam o nível o bastante para o Motor perder notas.
  arpeggio: { gainDb: -18, attack: 0.08, decay: 0.1, sustain: 0.8, release: 0.15, polyphony: 1 },
  brass: { gainDb: -17, attack: 0.15, decay: 0.2, sustain: 0.8, release: 0.2, polyphony: 2 },
  timpani: {
    gainDb: -8,
    attack: 0.002,
    decay: 0.7,
    sustain: 0,
    release: 0.3,
    polyphony: 1,
    membrane: { octaves: 1.5, pitchDecay: 0.05 },
  },
};

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}
