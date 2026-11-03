import { describe, it, expect } from 'vitest';
import { CATALOG_ORDER, categoryOf, convertSongChart, convertSongFile, songIdFromFileName } from './catalog';
import { placements } from './fingering';
import { LEVEL_RULES } from './levels';
import { parseMusicXml } from './musicxml';
import { attacks, LEVELS, parseSong, songDurationBeats, timeline, type Song } from './song';

const FILES = import.meta.glob('../../../content/songs/*.musicxml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const converted = Object.entries(FILES).map(([path, content]) => convertSongFile({ name: path, content }));
const byId = (id: string) => converted.find((c) => c.sheet.id === id)!;

/** Compassos, tempos e fórmula de cada partitura (anacruse e último compasso curto contam o que têm). */
const SCORES: Record<string, { measures: number; beats: number; time: string; key: string }> = {
  'escala-re-maior': { measures: 4, beats: 16, time: '4/4', key: 'D major' },
  'brilha-brilha-estrelinha': { measures: 12, beats: 48, time: '4/4', key: 'D major' },
  'ode-a-alegria': { measures: 16, beats: 64, time: '4/4', key: 'D major' },
  'ciranda-cirandinha': { measures: 8, beats: 16, time: '2/4', key: 'D major' },
  'frere-jacques': { measures: 8, beats: 32, time: '4/4', key: 'F major' },
  'minueto-em-sol': { measures: 16, beats: 48, time: '3/4', key: 'G major' },
  'canone-de-pachelbel': { measures: 11, beats: 44, time: '4/4', key: 'D major' },
  greensleeves: { measures: 31, beats: 90, time: '3/4', key: 'A minor' },
  'jingle-bells': { measures: 16, beats: 64, time: '4/4', key: 'G major' },
  aleluia: { measures: 16, beats: 64, time: '4/4', key: 'D major' },
  'staccato-la-maior': { measures: 12, beats: 48, time: '4/4', key: 'A major' },
  'moto-perpetuo-la-maior': { measures: 16, beats: 64, time: '4/4', key: 'A major' },
  'moto-perpetuo-quarto-dedo': { measures: 16, beats: 64, time: '4/4', key: 'A major' },
  'variacao-semicolcheias': { measures: 8, beats: 32, time: '4/4', key: 'A major' },
  'preparacao-variacao': { measures: 4, beats: 16, time: '4/4', key: 'A major' },
  'quarto-dedo-primeiro-preso': { measures: 8, beats: 32, time: '4/4', key: 'D major' },
  'tonalizacao-re-0-2-0-3': { measures: 5, beats: 20, time: '4/4', key: 'D major' },
  'tonalizacao-re-0-3-1-3': { measures: 5, beats: 20, time: '4/4', key: 'D major' },
  'escala-re-maior-minimas': { measures: 8, beats: 32, time: '4/4', key: 'D major' },
};

describe('catálogo do ciclo 2', () => {
  it('as 10 músicas e os 9 exercícios decididos, na ordem do catálogo, uma por arquivo', () => {
    expect(converted.map((c) => c.sheet.id).sort()).toEqual([...CATALOG_ORDER].sort());
    expect(Object.keys(SCORES).sort()).toEqual([...CATALOG_ORDER].sort());
  });

  describe.each([...CATALOG_ORDER])('%s', (id) => {
    const file = byId(id);
    const expected = SCORES[id];

    it('ficha confere com a partitura', () => {
      const { sheet } = file;
      expect(`${sheet.timeSignature.beats}/${sheet.timeSignature.unit}`).toBe(expected.time);
      expect(sheet.key).toBe(expected.key);
      expect(sheet.title).not.toBe('');
      expect(sheet.durationSeconds).toBeCloseTo((expected.beats * 60) / sheet.bpm, 9);
      expect(file.source.format).toBe('musicxml');
    });

    it.each([...LEVELS])('%s: parseSong aceita, compassos e duração conferem', (level) => {
      const chart = file.charts[level];
      expect(parseSong(JSON.parse(JSON.stringify(chart)))).toEqual(chart);
      expect(chart.level).toBe(level);
      expect(chart.id).toBe(id);
      expect(chart.measures).toHaveLength(expected.measures);
      expect(songDurationBeats(chart)).toBeCloseTo(expected.beats, 9);
      expect(attacks(chart).length).toBeGreaterThan(0);
    });

    it.each([...LEVELS])('%s: cada nota cabe na corda e no dedo até a posição do nível', (level) => {
      const { maxPosition } = LEVEL_RULES[level].fingering;
      for (const note of timeline(file.charts[level])) {
        const options = placements(note.midi, maxPosition);
        expect(options.some((p) => p.string === note.string && p.finger === note.finger), `${level} #${note.index}`).toBe(true);
      }
    });

    it('Fácil em tom confortável; Médio e Difícil na tonalidade da partitura', () => {
      expect(['C major', 'G major', 'D major', 'A major', 'A minor', 'E minor', 'B minor', 'F# minor']).toContain(file.charts.easy.key);
      expect(file.charts.medium.key).toBe(expected.key);
      expect(file.charts.hard.key).toBe(expected.key);
    });

    it('o ritmo só simplifica: Fácil tem no máximo os ataques do Médio, que tem no máximo os do Difícil', () => {
      const count = (level: (typeof LEVELS)[number]) => attacks(file.charts[level]).length;
      expect(count('easy')).toBeLessThanOrEqual(count('medium'));
      expect(count('medium')).toBeLessThanOrEqual(count('hard'));
    });
  });

  it('Frère Jacques sobe de Fá para Sol maior no Fácil', () => {
    const { charts } = byId('frere-jacques');
    expect(charts.easy.key).toBe('G major');
    expect(timeline(charts.easy)[0].midi - timeline(charts.hard)[0].midi).toBe(2);
  });

  it('Aleluia: as semicolcheias ficam no Médio e no Difícil e viram colcheias no Fácil', () => {
    const { charts } = byId('aleluia');
    const sixteenths = (level: (typeof LEVELS)[number]) => timeline(charts[level]).filter((n) => n.beats === 0.25).length;
    expect(sixteenths('hard')).toBeGreaterThan(0);
    expect(sixteenths('medium')).toBe(sixteenths('hard'));
    expect(sixteenths('easy')).toBe(0);
  });

  it('Greensleeves começa em anacruse de 1 tempo e termina no compasso curto', () => {
    const beats = byId('greensleeves').charts.hard.measures.map((m) => m.beats);
    expect(beats[0]).toBe(1);
    expect(beats[beats.length - 1]).toBe(2);
  });

  it('Pachelbel: a ligadura da última barra vira tie sem novo ataque', () => {
    const notes = timeline(byId('canone-de-pachelbel').charts.hard);
    expect(notes[notes.length - 1]).toMatchObject({ midi: 74, tie: true });
  });

  it('escala de Ré segue a gravação de referência: 60 BPM, 15 semínimas, ataques de 0 a 14 s', () => {
    for (const level of LEVELS) {
      const chart = byId('escala-re-maior').charts[level];
      expect(chart.bpm).toBe(60);
      const notes = attacks(chart);
      expect(notes.map((n) => n.at)).toEqual([...Array(15).keys()]);
      expect(notes.every((n) => n.beats === 1)).toBe(true);
    }
  });
});

const EXERCISES = CATALOG_ORDER.slice(10);
const MUSICS = CATALOG_ORDER.slice(0, 10);
const placed = (song: Song) => timeline(song).map((n) => ({ midi: n.midi, string: n.string, finger: n.finger }));

describe('exercícios técnicos', () => {
  const docs = Object.values(import.meta.glob('../../../content/songs/EXERCICIOS.md', { query: '?raw', import: 'default', eager: true }))[0] as string;

  it('os 9 são da categoria exercicio, do Violin Hero, CC0; as 10 músicas continuam músicas', () => {
    expect(EXERCISES.map((id) => byId(id).sheet.title)).toEqual([
      'Staccato em Lá maior',
      'Moto perpétuo em Lá maior',
      'Moto perpétuo com 4º dedo',
      'Variação em semicolcheias',
      'Preparação da variação',
      '4º dedo com o 1º preso',
      'Tonalização em Ré (0-2-0-3)',
      'Tonalização em Ré (0-3-1-3)',
      'Escala de Ré maior em mínimas',
    ]);
    for (const id of EXERCISES) {
      const { sheet, source } = byId(id);
      expect(sheet).toMatchObject({ category: 'exercicio', composer: 'Violin Hero' });
      expect(source.content).toContain('<!-- Composição original do projeto Violin Hero, CC0');
      expect(source.content).toContain('Objetivo técnico:');
      expect(source.content).toContain('<rights>Composição original do projeto Violin Hero, CC0</rights>');
      expect(docs, `${id} no EXERCICIOS.md`).toContain(`\`${id}.musicxml\``);
    }
    for (const id of MUSICS) expect(byId(id).sheet.category).toBe('musica');
    // a escala que já existia fica, ao lado da nova
    expect(byId('escala-re-maior').sheet.title).toBe('Escala de Ré maior');
  });

  it('nenhuma dica de corda e dedo é ignorada em nenhum nível', () => {
    expect(converted.flatMap((c) => c.warnings)).toEqual([]);
  });

  it('as 10 músicas não têm dica: o dedilhado delas é o do algoritmo, como antes', () => {
    for (const id of MUSICS) {
      const score = parseMusicXml(byId(id).source.content);
      expect(score.measures.flatMap((m) => m.notes).filter((n) => n.hint), id).toEqual([]);
    }
  });

  describe.each([...LEVELS])('%s', (level) => {
    const chart = (id: string) => byId(id).charts[level];

    it('staccato, moto perpétuo, variação e preparação: cordas Lá e Mi, dedos 0 a 3, Mi e Lá soltos', () => {
      for (const id of ['staccato-la-maior', 'moto-perpetuo-la-maior', 'variacao-semicolcheias', 'preparacao-variacao']) {
        for (const n of placed(chart(id))) {
          expect([2, 3], `${id} ${n.midi}`).toContain(n.string);
          expect(n.finger, `${id} ${n.midi}`).toBeLessThanOrEqual(3);
          if (n.midi === 69 || n.midi === 76) expect(n.finger, `${id} ${n.midi}`).toBe(0);
        }
      }
    });

    it('moto perpétuo com 4º dedo: os 17 Mi marcados com o 4º dedo na corda Lá, os outros 7 soltos', () => {
      const notes = placed(chart('moto-perpetuo-quarto-dedo'));
      const mis = notes.filter((n) => n.midi === 76);
      expect(mis.filter((n) => n.string === 2 && n.finger === 4)).toHaveLength(17);
      expect(mis.filter((n) => n.string === 3 && n.finger === 0)).toHaveLength(7);
      for (const n of notes) expect([2, 3]).toContain(n.string);
    });

    it('4º dedo com o 1º preso: Lá e Mi sempre com o 4º dedo, nas cordas Ré e Lá, nenhuma solta', () => {
      for (const n of placed(chart('quarto-dedo-primeiro-preso'))) {
        expect([1, 2]).toContain(n.string);
        expect(n.finger).not.toBe(0);
        if (n.midi === 69) expect(n).toMatchObject({ string: 1, finger: 4 });
        if (n.midi === 76) expect(n).toMatchObject({ string: 2, finger: 4 });
      }
    });

    it.each([
      ['tonalizacao-re-0-2-0-3', [0, 2, 0, 3, 0, 2, 0, 3, 0], [1, 1, 1, 1, 2, 2, 2, 2, 1]],
      ['tonalizacao-re-0-3-1-3', [0, 3, 1, 3, 0, 3, 1, 3, 0], [1, 1, 1, 1, 2, 2, 2, 2, 1]],
      ['escala-re-maior-minimas', [0, 1, 2, 3, 0, 1, 2, 3, 2, 1, 0, 3, 2, 1, 0], [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1]],
    ])('%s: dedos e cordas pedidos, em mínimas e semibreve', (id, fingers, strings) => {
      const notes = timeline(chart(id));
      expect(notes.map((n) => n.finger)).toEqual(fingers);
      expect(notes.map((n) => n.string)).toEqual(strings);
      expect(new Set(notes.map((n) => n.beats))).toEqual(new Set([2, 4]));
    });
  });

  it('variação: no Médio e no Difícil cada colcheia dos compassos 1 a 8 do moto perpétuo vira duas semicolcheias; o Fácil volta às colcheias', () => {
    const moto = byId('moto-perpetuo-la-maior').charts.hard.measures.slice(0, 8).flatMap((m) => m.notes);
    expect(moto).toHaveLength(64);
    for (const level of ['medium', 'hard'] as const) {
      const variation = timeline(byId('variacao-semicolcheias').charts[level]);
      expect(variation.map((n) => n.midi)).toEqual(moto.flatMap((n) => [n.midi, n.midi]));
      expect(variation.every((n) => n.beats === 0.25)).toBe(true);
    }
    const easy = timeline(byId('variacao-semicolcheias').charts.easy);
    expect(easy.map((n) => [n.midi, n.beats])).toEqual(moto.map((n) => [n.midi, 0.5]));
  });

  it('preparação: duas semicolcheias e a pausa de colcheia em cada tempo; o Fácil fica com uma colcheia e a pausa', () => {
    const notes = (level: (typeof LEVELS)[number]) => byId('preparacao-variacao').charts[level].measures.flatMap((m) => m.notes);
    for (const level of ['medium', 'hard'] as const) {
      expect(notes(level).map((n) => [n.beat % 1, n.beats])).toEqual(
        [...Array(16)].flatMap(() => [
          [0, 0.25],
          [0.25, 0.25],
        ]),
      );
    }
    expect(notes('easy').map((n) => [n.beat, n.beats])).toEqual([...Array(16).keys()].map((i) => [i % 4, 0.5]));
  });
});

describe('categoryOf', () => {
  const xml = (field: string) => `<score-partwise><identification><miscellaneous>${field}</miscellaneous></identification></score-partwise>`;

  it('sem o campo é música; com ele, o que diz', () => {
    expect(categoryOf('<score-partwise/>')).toBe('musica');
    expect(categoryOf(xml('<miscellaneous-field name="categoria"> exercicio </miscellaneous-field>'))).toBe('exercicio');
    expect(categoryOf(xml('<miscellaneous-field name="outro">exercicio</miscellaneous-field>'))).toBe('musica');
  });

  it('categoria desconhecida é erro, e convertSongFile diz o arquivo', () => {
    expect(() => categoryOf(xml('<miscellaneous-field name="categoria">estudo</miscellaneous-field>'))).toThrow(/categoria "estudo" desconhecida/);
    const [path, content] = Object.entries(FILES)[0];
    const bad = content.replace('<identification>', '<identification><miscellaneous><miscellaneous-field name="categoria">estudo</miscellaneous-field></miscellaneous>');
    expect(() => convertSongFile({ name: path.split('/').pop()!, content: bad })).toThrow(/\.musicxml: categoria "estudo"/);
  });
});

describe('convertSongFile', () => {
  it('id é o slug do arquivo, em qualquer pasta', () => {
    expect(songIdFromFileName('content/songs/ode-a-alegria.musicxml')).toBe('ode-a-alegria');
    expect(songIdFromFileName('C:\\songs\\jingle-bells.musicxml')).toBe('jingle-bells');
  });

  it.each([
    ['ode.json', /só \.musicxml/],
    ['Ode Alegria.musicxml', /slug/],
  ])('rejeita o nome %s', (name, message) => {
    expect(() => convertSongFile({ name, content: '' })).toThrow(message);
  });

  it('erro de conteúdo diz o arquivo', () => {
    expect(() => convertSongFile({ name: 'quebrada.musicxml', content: '<score-partwise>' })).toThrow(/^quebrada\.musicxml: /);
  });

  it('source devolve o conteúdo como veio', () => {
    const [path, content] = Object.entries(FILES)[0];
    expect(convertSongFile({ name: path, content }).source.content).toBe(content);
  });
});

describe('convertSongChart', () => {
  it.each([...LEVELS])('o nível %s sai igual ao de convertSongFile', (level) => {
    for (const [path, content] of Object.entries(FILES)) {
      expect(convertSongChart({ name: path, content }, level)).toEqual(convertSongFile({ name: path, content }).charts[level]);
    }
  });

  it('erro de nome e de conteúdo dizem o arquivo', () => {
    expect(() => convertSongChart({ name: 'ode.json', content: '' }, 'easy')).toThrow(/só \.musicxml/);
    expect(() => convertSongChart({ name: 'quebrada.musicxml', content: '<score-partwise>' }, 'easy')).toThrow(/^quebrada\.musicxml: /);
  });
});
