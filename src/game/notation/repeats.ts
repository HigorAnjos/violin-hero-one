// Repetição simples escrita por extenso: |: … :|, com 1ª e 2ª casa. Comum ao MusicXML e ao ABC importados.

export interface RepeatMarks {
  /** Começa um trecho repetido (|:). */
  forward?: boolean;
  /** Termina o trecho repetido (:|): volta uma vez para o último |: (ou para o começo). */
  backward?: boolean;
  /** Casa de 1ª/2ª vez: em quais passadas o compasso toca. */
  endings?: readonly number[];
}

/** Teto de compassos depois de desdobrar: repetição malformada não vira laço infinito. */
const MAX_UNFOLD_FACTOR = 4;

/**
 * Compassos na ordem em que tocam. Cada :| volta uma vez só; a casa que não é da passada some.
 * Depois da última casa, o trecho seguinte começa do zero (1ª passada).
 */
export function unfoldRepeats<T>(measures: readonly T[], marks: (measure: T) => RepeatMarks): T[] {
  const out: T[] = [];
  const done = new Set<number>();
  let start = 0;
  let pass = 1;
  for (let i = 0; i < measures.length; ) {
    const m = marks(measures[i]);
    if (m.forward && i !== start) {
      start = i;
      pass = 1;
    }
    if (m.endings && !m.endings.includes(pass)) {
      i++;
      continue;
    }
    out.push(measures[i]);
    if (out.length > measures.length * MAX_UNFOLD_FACTOR) throw new RangeError('repetição sem fim');
    if (m.backward && !done.has(i)) {
      done.add(i);
      pass++;
      i = start;
      continue;
    }
    const next = measures[i + 1] === undefined ? undefined : marks(measures[i + 1]);
    if (m.backward || (m.endings && !next?.endings)) {
      start = i + 1;
      pass = 1;
    }
    i++;
  }
  return out;
}
