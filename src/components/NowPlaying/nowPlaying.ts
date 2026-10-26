import { STRING_SOLFEGE, type StringIndex } from '../../game/notation/violin';

const ORDINAL = ['', '1º', '2º', '3º', '4º'];

/** "corda Lá · 3º dedo" ou "corda Mi solta". */
export function placeLine(string: StringIndex, finger: number): string {
  return finger === 0 ? `corda ${STRING_SOLFEGE[string]} solta` : `corda ${STRING_SOLFEGE[string]} · ${ORDINAL[finger]} dedo`;
}

/** Quanto segurar a nota, em tempos arredondados ao meio: "meio tempo", "1 tempo", "1 tempo e meio", "2 tempos". */
export function holdText(beats: number): string {
  const halves = Math.max(1, Math.round(beats * 2));
  if (halves === 1) return 'meio tempo';
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (half) return `${whole} ${whole === 1 ? 'tempo' : 'tempos'} e meio`;
  return `${whole} ${whole === 1 ? 'tempo' : 'tempos'}`;
}
