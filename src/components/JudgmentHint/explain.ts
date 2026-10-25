import { judgmentDetail } from '../../game/render/present';
import { DEFAULT_TOLERANCE_CENTS, DEFAULT_WINDOWS, TUNING_GREAT, TUNING_PERFECT } from '../../game/engine/score';
import type { Judgment, NoteJudgment } from '../../game/engine/types';
import type { Finger } from '../../game/notation/song';
import { OPEN_STRING_MIDI, STRING_SOLFEGE, type StringIndex } from '../../game/notation/violin';
import { noteName } from '../CountIn/countIn';

const ORDINAL = ['', '1º', '2º', '3º', '4º'];

/** Trecho do texto; `tone` destaca como no design (alvo na cor da corda, erro em amarelo). */
export interface HintPart {
  text: string;
  tone?: 'target' | 'played' | 'issue';
}

export interface Ruler {
  kind: 'timing' | 'tuning';
  /** Posição do marcador, de 0 a 100. */
  at: number;
  /** Faixas Perfeito e Ótimo, de 0 a 100 (início, largura). */
  perfect: [number, number];
  great: [number, number];
  label: string;
  ends: [string, string, string];
}

export interface Explanation {
  judgment: Judgment;
  chip: string;
  hint: HintPart[];
  /** Linha pequena embaixo (latência descontada). */
  note: string | null;
  ruler: Ruler | null;
  string: StringIndex;
  /** String em que a nota tocada errada caiu, para pintar o "VOCÊ". */
  playedString: StringIndex | null;
}

export interface TargetNote {
  midi: number;
  string: StringIndex;
  finger: Finger;
}

/** "corda Lá, 3º dedo" ou "corda Mi solta". */
export function placeOf(string: StringIndex, finger: number): string {
  return finger === 0 ? `corda ${STRING_SOLFEGE[string]} solta` : `corda ${STRING_SOLFEGE[string]}, ${ORDINAL[finger]} dedo`;
}

/** Corda mais aguda onde a nota cabe na 1ª posição: o palpite de onde a nota errada foi tocada. */
export function likelyString(midi: number): StringIndex {
  for (const s of [3, 2, 1, 0] as const) if (midi >= OPEN_STRING_MIDI[s]) return s;
  return 0;
}

const zone = (half: number, range: number): [number, number] => [50 - (half / range) * 50, (half / range) * 100];
const clamp = (v: number) => Math.max(2, Math.min(98, v));

/** 5d · Por que a nota não saiu Perfeito, no texto do design, a partir do julgamento do motor. */
export function explainJudgment(j: NoteJudgment, target: TargetNote, latencyMs?: number): Explanation | null {
  if (!j.issue) return null;
  const chip = judgmentDetail({ ...j, state: { combo: 0 } });
  const name = noteName(target.midi);
  const where = placeOf(target.string, target.finger);
  const base = { judgment: j.judgment, chip, string: target.string, playedString: null, note: null, ruler: null };

  switch (j.issue) {
    case 'wrong-note': {
      const played = j.playedMidi ?? target.midi;
      const string = likelyString(played);
      const open = played === OPEN_STRING_MIDI[string];
      return {
        ...base,
        playedString: string,
        hint: [
          { text: 'Você tocou ' },
          { text: noteName(played), tone: 'played' },
          { text: `, corda ${STRING_SOLFEGE[string]}${open ? ' solta' : ''}. O alvo era ` },
          { text: name, tone: 'target' },
          { text: `: ${where}.` },
        ],
      };
    }
    case 'not-played':
      return { ...base, hint: [{ text: 'Não ouvimos a nota ' }, { text: name, tone: 'target' }, { text: `: ${where}.` }] };
    case 'early':
    case 'late': {
      const ms = Math.abs(Math.round(j.offsetMs ?? 0));
      const late = j.issue === 'late';
      const range = DEFAULT_WINDOWS.good;
      return {
        ...base,
        hint: [
          { text: j.judgment === 'miss' ? 'Nota certa, mas ' : 'Nota e afinação certas, mas ' },
          { text: `${ms} ms ${late ? 'atrasada' : 'adiantada'}`, tone: 'issue' },
          { text: late ? '. Comece o arco um pouco antes da linha.' : '. Espere a nota chegar na linha para começar o arco.' },
        ],
        note: latencyMs !== undefined ? `Já descontados ${Math.round(latencyMs)} ms de latência do seu aparelho.` : null,
        ruler: {
          kind: 'timing',
          at: clamp(50 + ((j.offsetMs ?? 0) / range) * 50),
          perfect: zone(DEFAULT_WINDOWS.perfect, range),
          great: zone(DEFAULT_WINDOWS.great, range),
          label: `Tempo: ${ms} milissegundos ${late ? 'atrasado' : 'adiantado'}`,
          ends: ['◂ CEDO', '0', 'TARDE ▸'],
        },
      };
    }
    case 'sharp':
    case 'flat': {
      const cents = Math.abs(Math.round(j.cents ?? 0));
      const sharp = j.issue === 'sharp';
      const range = DEFAULT_TOLERANCE_CENTS;
      const fix =
        target.finger === 0
          ? ` Confira a afinação da corda ${STRING_SOLFEGE[target.string]}.`
          : sharp
            ? ` Recue o ${ORDINAL[target.finger]} dedo um pouco, em direção à voluta.`
            : ` Avance o ${ORDINAL[target.finger]} dedo um pouco, em direção ao cavalete.`;
      return {
        ...base,
        hint: [
          { text: j.judgment === 'miss' ? 'Nota certa, mas ' : 'Nota e tempo certos, mas ' },
          { text: `${cents} ¢ ${sharp ? 'alta' : 'baixa'}`, tone: 'issue' },
          { text: `.${fix}` },
        ],
        ruler: {
          kind: 'tuning',
          at: clamp(50 + ((j.cents ?? 0) / range) * 50),
          perfect: zone(TUNING_PERFECT * range, range),
          great: zone(TUNING_GREAT * range, range),
          label: `Afinação: ${cents} cents ${sharp ? 'acima' : 'abaixo'}`,
          ends: ['◂ BAIXO', '0 ¢', 'ALTO ▸'],
        },
      };
    }
  }
}

/** "COMBO 128 → 0 · ×1" no erro; "COMBO 129 · +50" no acerto. */
export function comboLine(j: NoteJudgment, previousCombo: number, combo: number, multiplier: number): { lost: string | null; text: string } {
  if (j.judgment === 'miss') return { lost: previousCombo > 0 ? `COMBO ${previousCombo}` : null, text: `→ 0 · ×${multiplier}` };
  return { lost: null, text: `COMBO ${combo} · +${j.points}` };
}
