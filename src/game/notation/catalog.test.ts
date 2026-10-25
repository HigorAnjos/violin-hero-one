import { describe, it, expect } from 'vitest';
import { CATALOG_ORDER, convertSongChart, convertSongFile, songIdFromFileName } from './catalog';
import { placements } from './fingering';
import { LEVEL_RULES } from './levels';
import { attacks, LEVELS, parseSong, songDurationBeats, timeline } from './song';

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
};

describe('catálogo do ciclo 2', () => {
  it('as 10 músicas decididas, na ordem do catálogo, uma por arquivo', () => {
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
