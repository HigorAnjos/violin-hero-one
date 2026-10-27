import { describe, it, expect } from 'vitest';
import { looksLikeAbc, parseAbcParts } from './abc';

const tune = (body: string, header = 'M:4/4\nL:1/4\nQ:1/4=60\nK:C') => `X:1\nT:Teste\nC:Fulano\n${header}\n${body}\n`;
const one = (body: string, header?: string) => parseAbcParts(tune(body, header), 'arquivo')[0].score;
const notes = (body: string, header?: string) => one(body, header).measures.map((m) => m.notes.map((n) => [n.beat, n.beats, n.midi, ...(n.tie ? ['tie'] : [])]));

describe('parseAbcParts', () => {
  it('cabeçalho: título, compositor, compasso, andamento e armadura', () => {
    const s = one('D E F G |', 'M:3/4\nL:1/8\nQ:3/8=40\nK:Bb');
    expect(s).toMatchObject({ title: 'Teste', composer: 'Fulano', key: { fifths: -2, mode: 'major' }, timeSignature: { beats: 3, unit: 4 } });
    // 3/8 = 40 por minuto → 60 semínimas por minuto
    expect(s.bpm).toBe(60);
  });

  it('oitavas, acidentes da armadura e do compasso (o acidente vale até a barra)', () => {
    expect(notes('C c c\' C, | ^F F =F F | F', 'L:1/4\nK:G')).toEqual([
      [
        [0, 1, 60],
        [1, 1, 72],
        [2, 1, 84],
        [3, 1, 48],
      ],
      [
        [0, 1, 66],
        [1, 1, 66],
        [2, 1, 65],
        [3, 1, 65],
      ],
      [[0, 1, 66]],
    ]);
  });

  it('durações: número, barra, pontuada (> <), quiáltera e pausa', () => {
    const t = (x: number) => Math.round(x * 1e9) / 1e9;
    expect(notes('C D/ E/ F>G | (3cde z c | A<B2 c/', 'L:1/4\nK:C')).toEqual([
      [
        [0, 1, 60],
        [1, 0.5, 62],
        [1.5, 0.5, 64],
        [2, 1.5, 65],
        [3.5, 0.5, 67],
      ],
      [
        [0, t(2 / 3), 72],
        [t(2 / 3), t(2 / 3), 74],
        [t(4 / 3), t(2 / 3), 76],
        [3, 1, 72],
      ],
      [
        [0, 0.5, 69],
        [0.5, 3, 71],
        [3.5, 0.5, 72],
      ],
    ]);
  });

  it('ligadura de prolongamento, também por cima da barra e com o acidente da anterior', () => {
    expect(notes('C2 ^F2- | F4', 'L:1/4\nK:C')).toEqual([
      [
        [0, 2, 60],
        [2, 2, 66],
      ],
      [[0, 4, 66, 'tie']],
    ]);
  });

  it('acorde fica com a nota mais aguda; ornamentos, cifras, apojaturas e ligaduras de expressão são ignorados', () => {
    expect(notes('"G"[GBd]2 !trill!{c}(AB) | .u~c4', 'L:1/4\nK:G')).toEqual([
      [
        [0, 2, 74],
        [2, 1, 69],
        [3, 1, 71],
      ],
      [[0, 4, 72]],
    ]);
  });

  it('repetição com 1ª e 2ª casa e anacruse', () => {
    const s = one('G |: c4 |[1 d4 :|[2 e4 |] f4', 'L:1/4\nK:C');
    expect(s.measures.map((m) => [m.beats, m.notes.map((n) => n.midi)])).toEqual([
      [1, [67]],
      [4, [72]],
      [4, [74]],
      [4, [72]],
      [4, [76]],
      [4, [77]],
    ]);
  });

  it('modos e mudança de armadura no meio (as notas seguem a nova; a ficha fica com a primeira)', () => {
    // Lá dórico: a armadura de Sol maior (1 sustenido)
    expect(one('F', 'K:Ador').key).toEqual({ fifths: 1, mode: 'major' });
    expect(one('F', 'K:Em').key).toEqual({ fifths: 1, mode: 'minor' });
    expect(one('F', 'K:G clef=treble').key).toEqual({ fifths: 1, mode: 'major' });
    const s = one('F4 | [K:F] B4 |', 'L:1/4\nK:G');
    expect(s.measures.map((m) => m.notes[0].midi)).toEqual([66, 70]);
    expect(s.key.fifths).toBe(1);
  });

  it('mudança de compasso alarga a fórmula da música; L padrão segue o compasso', () => {
    const s = one('C D | [M:3/4] E F G |', 'M:2/4\nK:C');
    expect(s.timeSignature).toEqual({ beats: 3, unit: 4 });
    // M:2/4 < 0,75 → L:1/16
    expect(s.measures.map((m) => m.beats)).toEqual([0.5, 0.75]);
  });

  it('várias vozes viram várias partes, com o nome do V:', () => {
    const parts = parseAbcParts(tune('V:1\nc4 |\nV:2\nC4 |', 'M:4/4\nL:1/4\nV:1 name="Violino"\nV:2 name="Baixo"\nK:C'), 'x');
    expect(parts.map((p) => [p.id, p.name, p.score.measures[0].notes[0].midi])).toEqual([
      ['1', 'Violino', 72],
      ['2', 'Baixo', 60],
    ]);
  });

  it('só a primeira música do arquivo; sem T: usa o nome do arquivo', () => {
    const parts = parseAbcParts('X:1\nK:C\nC4|\n\nX:2\nT:Outra\nK:C\nD4|\n', 'minha musica');
    expect(parts).toHaveLength(1);
    expect(parts[0].score.title).toBe('minha musica');
  });

  it.each([
    ['sem K:', 'X:1\nT:x\nC D E F|', /sem armadura/],
    ['compasso estourado', tune('C D E F G |'), /não cabem em 4\/4/],
    ['símbolo estranho', tune('C D # E |'), /não reconhecido/],
    ['compasso não suportado', tune('C |', 'M:3/16\nK:C'), /não suportado/],
  ])('rejeita %s', (_, text, message) => {
    expect(() => parseAbcParts(text, 'x')).toThrow(message);
  });

  it('looksLikeAbc', () => {
    expect(looksLikeAbc(tune('C'))).toBe(true);
    expect(looksLikeAbc('<score-partwise/>')).toBe(false);
  });
});
