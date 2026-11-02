import { describe, expect, it } from 'vitest';
import { classInitials } from './ClassBadge';

describe('iniciais da turma', () => {
  it('duas primeiras palavras, sem acento; uma palavra dá as duas primeiras letras', () => {
    expect(classInitials('Iniciantes · sábado')).toBe('IS');
    expect(classInitials('ébano')).toBe('EB');
    expect(classInitials('5º ano B')).toBe('5A');
    expect(classInitials('···')).toBe('T');
  });
});
