/** Alfabeto do código da turma (sem 0/O/1/I, como o banco gera). */
const CODE_SYMBOLS = /[^A-HJ-NP-Z2-9]/g;

/** O que o aluno digitou no código: maiúsculas, sem hífen, espaço nem símbolo que o código não tem; no máximo 8. */
export function cleanClassCode(raw: string): string {
  return raw.toUpperCase().replace(CODE_SYMBOLS, '').slice(0, 8);
}

/** "ADGKNRUX" → "ADGK-NRUX", como o professor vê. */
export function formatClassCode(code: string): string {
  const clean = cleanClassCode(code);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/** Só os dígitos do PIN, até 4. */
export function cleanPin(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 4);
}

export type PinKey = `${number}` | 'apagar' | 'limpar';

/** O PIN depois de uma tecla do teclado numérico. */
export function pressPinKey(pin: string, key: PinKey): string {
  if (key === 'apagar') return pin.slice(0, -1);
  if (key === 'limpar') return '';
  return cleanPin(pin + key);
}
