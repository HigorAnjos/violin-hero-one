import { describe, expect, it } from 'vitest';
import {
  createEditor,
  cursorPosition,
  cursorStops,
  deleteNote,
  editorFromDoc,
  editorFromSong,
  editorProblems,
  editorSong,
  insertLetter,
  insertNote,
  insertRest,
  KEY_CHOICES,
  letterMidi,
  moveCursor,
  noteName,
  octaveNote,
  rangeProblem,
  rangeSummary,
  redo,
  selectedNote,
  setAccidental,
  setBpm,
  setCursor,
  setDuration,
  setFinger,
  setKey,
  setString,
  setTimeSignature,
  setTitle,
  songToSave,
  stepNote,
  TIME_SIGNATURES,
  toggleDot,
  toggleTie,
  undo,
  type EditorState,
  type Letter,
} from './editor';
import { parseSong, songProblems, timeline } from './song';
import { HIGHEST_MIDI, LOWEST_MIDI } from './violin';

const D_MAJOR = [62, 64, 66, 67, 69, 71, 73, 74];
const write = (state: EditorState, ...midis: number[]) => midis.reduce((s, m) => insertNote(s, m), state);
const letters = (state: EditorState, keys: string) => [...keys].reduce((s, k) => insertLetter(s, k as Letter), state);
const melody = (state: EditorState) => timeline(editorSong(state)).map((n) => `${n.at}:${n.beats}:${n.midi}${n.tie ? '~' : ''}`);

/** A Song do editor é sempre jogável: parseSong não lança e songProblems não acha nada (fora "sem notas"). */
function expectValid(state: EditorState) {
  expect(editorProblems(state)).toEqual([]);
  if (state.doc.notes.length) expect(() => parseSong(JSON.parse(JSON.stringify(editorSong(state))))).not.toThrow();
}

describe('editor: partitura nova', () => {
  it('começa vazia em 4/4, Ré maior, ♩ = 72, com 4 compassos cheios de pausa', () => {
    const state = createEditor();
    const song = editorSong(state);
    expect(song.measures).toHaveLength(4);
    expect(song.measures.every((m) => m.beats === 4 && m.notes.length === 0)).toBe(true);
    expect(song).toMatchObject({ key: 'D major', bpm: 72, timeSignature: { beats: 4, unit: 4 }, level: 'hard', formatVersion: 1 });
    expect(editorProblems(state)).toEqual([]);
    expect(songProblems(song)).toEqual(['música sem notas']);
  });

  it('sem título, a Song sai "Sem título" (o modelo não aceita vazio)', () => {
    expect(editorSong(createEditor()).title).toBe('Sem título');
    expect(editorSong(setTitle(createEditor(), '  Valsa  ')).title).toBe('Valsa');
  });
});

describe('editor: escrever notas', () => {
  it('a escala de Ré maior em semínimas preenche 2 compassos, com dedilhado de 1ª posição', () => {
    const state = write(createEditor(), ...D_MAJOR);
    expectValid(state);
    const song = editorSong(state);
    expect(song.measures[0].notes.map((n) => n.midi)).toEqual([62, 64, 66, 67]);
    expect(song.measures[1].notes.map((n) => n.midi)).toEqual([69, 71, 73, 74]);
    expect(song.measures[0].notes.map((n) => `${'GDAE'[n.string]}${n.finger}`)).toEqual(['D0', 'D1', 'D2', 'D3']);
    expect(song.measures[1].notes.map((n) => `${'GDAE'[n.string]}${n.finger}`)).toEqual(['A0', 'A1', 'A2', 'A3']);
    expect(state.cursor).toBe(8);
  });

  it('pelas letras, com a armadura (F e C viram sustenido em Ré maior) e na oitava mais perto da anterior', () => {
    const state = letters(insertNote(createEditor(), 62), 'EFGABCD');
    expect(state.doc.notes.map((n) => n.midi)).toEqual(D_MAJOR);
  });

  it('a primeira letra sai perto do Sol 4; a letra fora do alcance procura a oitava que cabe', () => {
    const empty = createEditor();
    expect(letterMidi(empty, 'G')).toBe(67);
    expect(letterMidi(empty, 'D')).toBe(62);
    const low = insertNote(empty, LOWEST_MIDI);
    expect(letterMidi(low, 'F')).toBe(66); // Fá♯3 não existe no violino
  });

  it('nota fora do violino é recusada com o motivo, sem mexer na partitura', () => {
    const state = createEditor();
    const low = insertNote(state, LOWEST_MIDI - 1);
    expect(low.refusal).toBe('Fá♯3 não cabe no violino (Sol3 a Mi6).');
    expect(low.doc).toBe(state.doc);
    expect(insertNote(state, HIGHEST_MIDI + 1).refusal).toMatch(/não cabe no violino/);
    expect(insertNote(state, 62.5).refusal).toMatch(/não cabe/);
    expect(rangeProblem(LOWEST_MIDI)).toBeNull();
    expect(rangeProblem(HIGHEST_MIDI)).toBeNull();
  });

  it('a recusa some na próxima operação que dá certo', () => {
    const refused = insertNote(createEditor(), 20);
    expect(insertNote(refused, 62).refusal).toBeNull();
  });

  it('as figuras e o ponto: mínima pontuada + semínima fecham o 4/4', () => {
    let state = setDuration(createEditor(), 2, true);
    state = insertNote(state, 62);
    state = setDuration(state, 1);
    state = insertNote(state, 64);
    expect(melody(state)).toEqual(['0:3:62', '3:1:64']);
    expectValid(state);
  });

  it('a nota que passa da barra vira duas, ligadas, e o cursor segue no compasso seguinte', () => {
    let state = setCursor(createEditor(), 3);
    state = setDuration(state, 2);
    state = insertNote(state, 69);
    expect(melody(state)).toEqual(['3:1:69', '4:1:69~']);
    expect(state.cursor).toBe(5);
    const [a, b] = timeline(editorSong(state));
    expect([a.string, a.finger]).toEqual([b.string, b.finger]);
    expectValid(state);
  });

  it('escrever por cima: encurta a nota que começa antes e tira as que começam no trecho', () => {
    let state = setDuration(createEditor(), 2);
    state = write(state, 62, 64); // mínimas em 0 e 2
    // O cursor no meio de uma nota só vem pela API (o ditado): o toque e as setas param no começo dela
    state = insertNote({ ...state, cursor: 1 }, 66); // mínima em 1: encurta o Ré, apaga o Mi
    expect(melody(state)).toEqual(['0:1:62', '1:2:66']);
    expectValid(state);
  });

  it('chegando ao fim, a pauta ganha um compasso vazio para continuar', () => {
    const state = write(createEditor({}, 1), 62, 64, 66, 67);
    expect(state.doc.measures).toBe(2);
    expect(cursorPosition(state)).toEqual({ measure: 1, beat: 1 });
  });

  it('pausa: apaga o trecho, anda o cursor e o vão aparece como silêncio na Song', () => {
    let state = write(createEditor(), 62, 64, 66, 67);
    state = setCursor(state, 1);
    state = insertRest(state);
    expect(melody(state)).toEqual(['0:1:62', '2:1:66', '3:1:67']);
    expect(state.cursor).toBe(2);
    expectValid(state);
  });
});

describe('editor: cursor e seleção', () => {
  it('← e → param nas notas e, no vazio, em cada tempo', () => {
    let state = setDuration(createEditor({}, 2), 2);
    state = insertNote(state, 62);
    expect(cursorStops(state.doc)).toEqual([0, 2, 3, 4, 5, 6, 7]);
    state = moveCursor(state, -1);
    expect(state.cursor).toBe(0);
    expect(moveCursor(state, -1).cursor).toBe(0);
    state = moveCursor(moveCursor(state, 1), 1);
    expect(state.cursor).toBe(3);
  });

  it('andar pelo compasso vazio do fim não cria outro; escrever no último compasso cria', () => {
    let state = createEditor({}, 1);
    for (let i = 0; i < 10; i++) state = moveCursor(state, 1);
    expect(state.doc.measures).toBe(1);
    expect(state.cursor).toBe(3);
    state = insertNote(state, 62);
    expect(state.doc.measures).toBe(2);
  });

  it('logo depois de escrever, a selecionada é a que acabou de entrar; com o cursor numa nota, é ela', () => {
    let state = write(createEditor(), 62, 64);
    expect(selectedNote(state)?.midi).toBe(64);
    state = moveCursor(state, -1);
    expect(state.cursor).toBe(1);
    expect(selectedNote(state)?.midi).toBe(64);
    state = moveCursor(state, -1);
    expect(selectedNote(state)?.midi).toBe(62);
  });

  it('toque na pauta: cai no começo da nota tocada ou na grade da figura dentro do compasso', () => {
    let state = setDuration(createEditor(), 2);
    state = insertNote(state, 62);
    expect(setCursor(state, 1.7).cursor).toBe(0);
    expect(setCursor(state, 3.4).cursor).toBe(2);
    expect(setCursor(setDuration(state, 0.5), 3.4).cursor).toBe(3);
    expect(setCursor(state, 99).cursor).toBe(16);
    expect(setCursor(state, -3).cursor).toBe(0);
  });

  it('posição do cursor em compasso e tempo, contando de 1 no tempo', () => {
    const state = setCursor(setDuration(createEditor(), 0.5), 5.5);
    expect(cursorPosition(state)).toEqual({ measure: 1, beat: 2.5 });
  });
});

describe('editor: mudar a nota', () => {
  it('↑ e ↓ andam um grau da escala com a armadura; Shift, a oitava', () => {
    let state = insertNote(createEditor(), 64); // Mi4
    state = stepNote(state, 1);
    expect(selectedNote(state)?.midi).toBe(66); // Fá♯4 em Ré maior
    state = stepNote(state, -2);
    expect(selectedNote(state)?.midi).toBe(62);
    state = octaveNote(state, 1);
    expect(selectedNote(state)?.midi).toBe(74);
    expect(octaveNote(octaveNote(state, 1), 1).refusal).toMatch(/não cabe no violino/);
  });

  it('♯, ♭ e ♮ alteram a letra da nota, inclusive contra a armadura', () => {
    let state = insertNote(createEditor(), 66); // Fá♯4
    state = setAccidental(state, 'natural');
    expect(selectedNote(state)?.midi).toBe(65);
    state = setAccidental(state, 'sharp');
    expect(selectedNote(state)?.midi).toBe(66);
    state = setAccidental(state, 'flat');
    expect(selectedNote(state)?.midi).toBe(64); // Fá♭
    expectValid(state);
  });

  it('sem nota selecionada, mudar a nota é recusado', () => {
    expect(stepNote(createEditor(), 1).refusal).toBe('Escolha uma nota primeiro.');
  });

  it('trocar a figura com o cursor na nota: mais longa escreve por cima, mais curta deixa pausa', () => {
    let state = write(createEditor(), 62, 64, 66, 67);
    state = setCursor(state, 1);
    state = setDuration(state, 2);
    expect(melody(state)).toEqual(['0:1:62', '1:2:64', '3:1:67']);
    state = setDuration(state, 0.5);
    expect(melody(state)).toEqual(['0:1:62', '1:0.5:64', '3:1:67']);
    state = toggleDot(state);
    expect(melody(state)).toEqual(['0:1:62', '1:0.75:64', '3:1:67']);
    expectValid(state);
  });

  it('trocar a figura com o cursor depois da nota só muda a próxima', () => {
    const state = setDuration(insertNote(createEditor(), 62), 4);
    expect(melody(state)).toEqual(['0:1:62']);
    expect(insertNote(state, 64).doc.notes[1].length).toBe(4);
  });

  it('apagar: a nota do cursor vira pausa; logo depois de escrever, apaga a última e volta', () => {
    let state = write(createEditor(), 62, 64, 66);
    state = deleteNote(state);
    expect(melody(state)).toEqual(['0:1:62', '1:1:64']);
    expect(state.cursor).toBe(2);
    state = deleteNote(setCursor(state, 0));
    expect(melody(state)).toEqual(['1:1:64']);
    expect(state.cursor).toBe(0);
    expect(deleteNote(setCursor(state, 3)).refusal).toBe('Nenhuma nota aqui para apagar.');
    expectValid(state);
  });
});

describe('editor: ligadura', () => {
  it('sem nota igual depois, a ligadura escreve a mesma nota ligada', () => {
    let state = insertNote(createEditor(), 69);
    state = toggleTie(state);
    expect(melody(state)).toEqual(['0:1:69', '1:1:69~']);
    expect(state.cursor).toBe(2);
    expectValid(state);
  });

  it('com a mesma nota colada depois, liga e desliga', () => {
    let state = write(createEditor(), 69, 69);
    state = setCursor(state, 0);
    state = toggleTie(state);
    expect(melody(state)).toEqual(['0:1:69', '1:1:69~']);
    state = toggleTie(state);
    expect(melody(state)).toEqual(['0:1:69', '1:1:69']);
  });

  it('mudar a altura de uma das ligadas desfaz a ligadura, sem Song inválida', () => {
    let state = toggleTie(insertNote(createEditor(), 69));
    state = stepNote(state, 1);
    expect(melody(state)).toEqual(['0:1:69', '1:1:71']);
    expectValid(state);
  });

  it('apagar a primeira das ligadas solta a segunda', () => {
    let state = toggleTie(insertNote(createEditor(), 69));
    state = deleteNote(setCursor(state, 0));
    expect(melody(state)).toEqual(['1:1:69']);
    expectValid(state);
  });
});

describe('editor: corda e dedo', () => {
  it('escolher a corda põe a nota na posição mais baixa dela; o dedo muda dentro da corda', () => {
    let state = insertNote(createEditor(), 69); // Lá4: sugerido Lá solta
    expect(editorSong(state).measures[0].notes[0]).toMatchObject({ string: 2, finger: 0 });
    state = setString(state, 1);
    expect(editorSong(state).measures[0].notes[0]).toMatchObject({ string: 1, finger: 4 });
    expect(setFinger(state, 1).refusal).toMatch(/não sai com o dedo 1/);
    expect(setString(state, 3).refusal).toBe('Lá4 não cabe na corda Mi.');
    expectValid(state);
  });

  it('dedo de outra posição na mesma corda', () => {
    let state = insertNote(createEditor(), 74); // Ré5: sugerido Lá 3
    state = setFinger(state, 1); // Lá 1 na 3ª posição
    expect(editorSong(state).measures[0].notes[0]).toMatchObject({ string: 2, finger: 1 });
    expectValid(state);
  });

  it('a escolha some quando a altura muda', () => {
    let state = setString(insertNote(createEditor(), 69), 1);
    state = stepNote(state, 1);
    expect(state.doc.notes[0].placement).toBeUndefined();
  });

  it('a nota ligada segue a corda da que ataca', () => {
    let state = setDuration(setCursor(createEditor(), 3), 2);
    state = insertNote(state, 69);
    state = setString(setCursor(state, 3), 1);
    const [a, b] = timeline(editorSong(state));
    expect([a.string, a.finger, b.string, b.finger, b.tie]).toEqual([1, 4, 1, 4, true]);
    expectValid(state);
  });

  it('acima da 1ª posição o sugerido vai até a 3ª', () => {
    const state = write(createEditor(), 84, 86, 88);
    expectValid(state);
    expect(editorSong(state).measures[0].notes.every((n) => n.string === 3)).toBe(true);
    expect(rangeSummary(state)).toEqual({ lowest: 84, highest: 88, firstPosition: false });
    expect(rangeSummary(write(createEditor(), ...D_MAJOR))).toEqual({ lowest: 62, highest: 74, firstPosition: true });
  });
});

describe('editor: compasso, armadura e andamento', () => {
  it('trocar para 3/4 redistribui as barras sem mexer no tempo das notas', () => {
    let state = write(createEditor(), ...D_MAJOR);
    state = setTimeSignature(state, { beats: 3, unit: 4 });
    const song = editorSong(state);
    expect(song.measures.map((m) => m.notes.length)).toEqual([3, 3, 2, 0, 0, 0]);
    expect(timeline(song).map((n) => n.midi)).toEqual(D_MAJOR);
    expectValid(state);
  });

  it('em 6/8 a Song conta em colcheias e o andamento acompanha', () => {
    let state = write(createEditor(), 62, 64);
    state = setTimeSignature(state, { beats: 6, unit: 8 });
    const song = editorSong(state);
    expect(song.timeSignature).toEqual({ beats: 6, unit: 8 });
    expect(song.bpm).toBe(144);
    expect(song.measures[0].notes.map((n) => [n.beat, n.beats])).toEqual([
      [0, 2],
      [2, 2],
    ]);
    expectValid(state);
  });

  it('nota que atravessa a barra nova vira ligadura', () => {
    let state = setDuration(createEditor(), 2);
    state = write(state, 62, 64);
    state = setTimeSignature(state, { beats: 3, unit: 4 });
    expect(melody(state)).toEqual(['0:2:62', '2:1:64', '3:1:64~']);
    expectValid(state);
  });

  it('só os compassos e tonalidades da lista; o andamento entre 30 e 240', () => {
    const state = createEditor();
    expect(setTimeSignature(state, { beats: 5, unit: 4 }).refusal).toBe('Compasso fora da lista.');
    expect(setKey(state, 'F# major').refusal).toBe('Tonalidade fora da lista.');
    expect(setBpm(state, 10).refusal).toMatch(/entre 30 e 240/);
    expect(setBpm(state, 96.4).doc.meta.bpm).toBe(96);
    for (const ts of TIME_SIGNATURES) expect(setTimeSignature(state, ts).refusal).toBeNull();
  });

  it('a armadura muda a grafia e as letras, não o som do que já foi escrito', () => {
    let state = insertNote(createEditor(), 66);
    state = setKey(state, 'F major');
    expect(state.doc.notes[0].midi).toBe(66);
    expect(noteName(66, -1)).toBe('Sol♭4');
    expect(letterMidi(state, 'B')).toBe(70); // Si♭
  });

  it('toda tonalidade do seletor tem nome e cabe no editor', () => {
    for (const { key, label } of KEY_CHOICES) {
      expect(label).toMatch(/maior|menor/);
      expect(setKey(createEditor(), key).refusal).toBeNull();
    }
  });
});

describe('editor: desfazer e refazer', () => {
  it('desfaz e refaz nota a nota, com o cursor junto', () => {
    let state = write(createEditor(), 62, 64, 66);
    state = undo(state);
    expect(state.doc.notes.map((n) => n.midi)).toEqual([62, 64]);
    expect(state.cursor).toBe(2);
    state = undo(undo(state));
    expect(state.doc.notes).toEqual([]);
    expect(undo(state).refusal).toBe('Nada para desfazer.');
    state = redo(redo(state));
    expect(state.doc.notes.map((n) => n.midi)).toEqual([62, 64]);
    state = insertNote(state, 69);
    expect(redo(state).refusal).toBe('Nada para refazer.');
  });

  it('recusa e mudança de figura sem nota não entram no histórico', () => {
    let state = insertNote(createEditor(), 62);
    state = insertNote(state, 20);
    state = setDuration(state, 2);
    expect(state.past).toHaveLength(1);
  });

  it('compasso, armadura e andamento se desfazem', () => {
    let state = setBpm(setTimeSignature(createEditor(), { beats: 3, unit: 4 }), 100);
    state = undo(state);
    expect(state.doc.meta.bpm).toBe(72);
    state = undo(state);
    expect(state.doc.meta.timeSignature).toEqual({ beats: 4, unit: 4 });
  });
});

describe('editor: salvar e rascunho', () => {
  it('a Song para salvar tira os compassos vazios do fim e passa no parseSong', () => {
    const state = write(createEditor({ title: 'Escala' }), ...D_MAJOR);
    const song = songToSave(state);
    expect(song.measures).toHaveLength(2);
    expect(parseSong(song)).toEqual(song);
  });

  it('sem nota, não dá para salvar', () => {
    expect(() => songToSave(createEditor())).toThrow('Escreva pelo menos uma nota antes de salvar.');
  });

  it('o documento vai e volta do armazenamento (JSON) igual; lixo é recusado', () => {
    let state = write(createEditor({ title: 'Rascunho' }), 62, 64);
    state = setString(toggleTie(state), 1);
    const back = editorFromDoc(JSON.parse(JSON.stringify(state.doc)));
    expect(back.doc).toEqual(state.doc);
    expect(back.cursor).toBe(3);
    expect(back.past).toEqual([]);
    expect(() => editorFromDoc(null)).toThrow();
    expect(() => editorFromDoc({ meta: { ...state.doc.meta, bpm: -1 }, notes: [], measures: 2 })).toThrow(/bpm/);
    expect(() => editorFromDoc({ meta: state.doc.meta, notes: [{ at: 0, length: 1, midi: 10 }], measures: 2 })).toThrow(/rascunho inválido/);
  });

  it('uma Song pronta abre no editor com as mesmas notas', () => {
    const song = songToSave(toggleTie(write(createEditor({ title: 'Ida' }), ...D_MAJOR)));
    const state = editorFromSong(song);
    expect(timeline(editorSong(state)).map((n) => [n.at, n.midi, n.string, n.finger, n.tie === true])).toEqual(
      timeline(song).map((n) => [n.at, n.midi, n.string, n.finger, n.tie === true]),
    );
  });
});

describe('editor: qualquer sequência de operações dá Song válida', () => {
  /** Gerador pseudoaleatório fixo: a mesma sequência a cada execução. */
  function random(seed: number) {
    let s = seed;
    return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  }

  it('2000 operações sorteadas', () => {
    const next = random(42);
    const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)];
    const ops: ((s: EditorState) => EditorState)[] = [
      (s) => insertNote(s, 50 + Math.floor(next() * 45)),
      (s) => insertNote(s, 55 + Math.floor(next() * 34)),
      (s) => insertLetter(s, pick(['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const)),
      (s) => insertRest(s),
      (s) => deleteNote(s),
      (s) => moveCursor(s, pick([-1, 1] as const)),
      (s) => setCursor(s, next() * 20),
      (s) => setDuration(s, pick([4, 2, 1, 0.5, 0.25] as const), next() < 0.3),
      (s) => toggleDot(s),
      (s) => toggleTie(s),
      (s) => stepNote(s, pick([-1, 1])),
      (s) => octaveNote(s, pick([-1, 1])),
      (s) => setAccidental(s, pick(['sharp', 'flat', 'natural'] as const)),
      (s) => setString(s, pick([0, 1, 2, 3] as const)),
      (s) => setFinger(s, pick([0, 1, 2, 3, 4] as const)),
      (s) => setTimeSignature(s, pick(TIME_SIGNATURES)),
      (s) => setKey(s, pick(KEY_CHOICES).key),
      (s) => undo(s),
      (s) => redo(s),
    ];
    let state = createEditor();
    for (let i = 0; i < 2000; i++) {
      state = pick(ops)(state);
      const problems = editorProblems(state);
      if (problems.length) throw new Error(`operação ${i}: ${problems.join('; ')}`);
    }
    expect(state.doc.notes.length).toBeGreaterThan(0);
  });
});
