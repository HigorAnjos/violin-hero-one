import { describe, it, expect } from 'vitest';
import { unfoldRepeats, type RepeatMarks } from './repeats';

/** Compasso de teste: o nome e as marcas de repetição. */
const m = (name: string, marks: RepeatMarks = {}) => ({ name, marks });
const play = (...measures: ReturnType<typeof m>[]) => unfoldRepeats(measures, (x) => x.marks).map((x) => x.name).join(' ');

describe('unfoldRepeats', () => {
  it('sem repetição, a mesma ordem', () => {
    expect(play(m('a'), m('b'))).toBe('a b');
  });

  it(':| sem |: volta para o começo, uma vez só', () => {
    expect(play(m('a'), m('b', { backward: true }), m('c'))).toBe('a b a b c');
  });

  it('|: … :| repete só o trecho', () => {
    expect(play(m('a'), m('b', { forward: true }), m('c', { backward: true }), m('d'))).toBe('a b c b c d');
  });

  it('1ª e 2ª casa: a 1ª só na 1ª passada, a 2ª só na 2ª', () => {
    expect(
      play(m('a', { forward: true }), m('b'), m('c1', { endings: [1], backward: true }), m('c2', { endings: [2] }), m('d')),
    ).toBe('a b c1 a b c2 d');
  });

  it('dois trechos repetidos seguidos, o segundo sem |:, voltam cada um para o seu começo', () => {
    expect(play(m('a'), m('b', { backward: true }), m('c'), m('d', { backward: true }))).toBe('a b a b c d c d');
  });

  it('casa de 1ª vez com dois compassos', () => {
    expect(
      play(m('a', { forward: true }), m('x', { endings: [1] }), m('y', { endings: [1], backward: true }), m('z', { endings: [2] }), m('b')),
    ).toBe('a x y a z b');
  });
});
