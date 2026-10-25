import { describe, it, expect } from 'vitest';
import { attacks, parseSong, songDurationBeats, songDurationSeconds, timeline } from './song';
import { convertSongChart } from './catalog';
import { FIXED_SONGS, findFixedSong } from './songs';
import { OPEN_STRING_MIDI, stringFits } from './violin';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

/** 1ª posição: semitons acima da corda solta → dedo. */
const FIRST_POSITION_FINGER: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4 };

const melody = (id: string) =>
  attacks(findFixedSong(id)!.song)
    .map((n) => noteName(n.midi))
    .join(' ');

const PHRASE_A = 'F#5 F#5 G5 A5 A5 G5 F#5 E5 D5 D5 E5 F#5';

const SCORES = [
  {
    id: 'escala-re-maior',
    bpm: 60,
    measures: 4,
    beats: 16,
    melody: 'D4 E4 F#4 G4 A4 B4 C#5 D5 C#5 B4 A4 G4 F#4 E4 D4',
  },
  {
    id: 'ode-a-alegria',
    bpm: 100,
    measures: 16,
    beats: 64,
    melody: [
      `${PHRASE_A} F#5 E5 E5`,
      `${PHRASE_A} E5 D5 D5`,
      'E5 E5 F#5 D5 E5 F#5 G5 F#5 D5 E5 F#5 G5 F#5 E5 D5 E5 A4',
      `${PHRASE_A} E5 D5 D5`,
    ].join(' '),
  },
  {
    id: 'brilha-brilha-estrelinha',
    bpm: 90,
    measures: 12,
    beats: 48,
    melody: [
      'D4 D4 A4 A4 B4 B4 A4 G4 G4 F#4 F#4 E4 E4 D4',
      'A4 A4 G4 G4 F#4 F#4 E4 A4 A4 G4 G4 F#4 F#4 E4',
      'D4 D4 A4 A4 B4 B4 A4 G4 G4 F#4 F#4 E4 E4 D4',
    ].join(' '),
  },
];

const SOURCES = import.meta.glob('../../../content/songs/*.musicxml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('músicas fixas do ciclo 1', () => {
  it('as 3 embutidas, na ordem, e parseSong aceita', () => {
    expect(FIXED_SONGS.map((s) => s.id)).toEqual(['escala-re-maior', 'ode-a-alegria', 'brilha-brilha-estrelinha']);
    for (const { song } of FIXED_SONGS) expect(parseSong(JSON.parse(JSON.stringify(song)))).toEqual(song);
  });

  it('fixedSongs.json bate com o Fácil do MusicXML (senão rode npm run songs:fixed)', () => {
    for (const { id, song } of FIXED_SONGS) {
      const name = `${id}.musicxml`;
      expect(song, id).toEqual(convertSongChart({ name, content: SOURCES[`../../../content/songs/${name}`] }, 'easy'));
    }
  });

  it('Ode: corda solta no Mi e no Lá, como no JSON do ciclo 1', () => {
    const strings = timeline(findFixedSong('ode-a-alegria')!.song).map((n) => 'GDAE'[n.string]).join('');
    expect(strings).toBe('EEEEEEEEAAEEEEEEEEEEEEEAAEEEAAEEEAEEEEAEEEEEAEAEEEEEEEEAAEEEAA');
  });

  it('ids únicos e iguais aos da Song', () => {
    const ids = FIXED_SONGS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of FIXED_SONGS) {
      expect(entry.id).toBe(entry.song.id);
      expect(entry.title).toBe(entry.song.title);
    }
  });

  it('todas em Ré maior, 4/4, nível fácil', () => {
    for (const { song } of FIXED_SONGS) {
      expect(song.key).toBe('D major');
      expect(song.timeSignature).toEqual({ beats: 4, unit: 4 });
      expect(song.level).toBe('easy');
    }
  });

  it('cada nota cabe na corda, em 1ª posição, com o dedo que combina', () => {
    for (const { id, song } of FIXED_SONGS) {
      for (const note of timeline(song)) {
        const where = `${id} #${note.index}`;
        expect(stringFits(note.midi, note.string), where).toBe(true);
        const offset = note.midi - OPEN_STRING_MIDI[note.string];
        expect(FIRST_POSITION_FINGER[offset], where).toBe(note.finger);
      }
    }
  });

  it.each(SCORES)('$id confere com a partitura', (score) => {
    const { song } = findFixedSong(score.id)!;
    expect(song.bpm).toBe(score.bpm);
    expect(song.measures).toHaveLength(score.measures);
    expect(songDurationBeats(song)).toBe(score.beats);
    expect(songDurationSeconds(song)).toBeCloseTo((score.beats * 60) / score.bpm, 9);
    expect(melody(score.id)).toBe(score.melody);
  });

  it('escala de Ré a 60 BPM: uma semínima por segundo, começando no tempo 0', () => {
    const notes = attacks(findFixedSong('escala-re-maior')!.song);
    expect(notes.map((n) => n.at)).toEqual([...Array(15).keys()]);
    expect(notes.every((n) => n.beats === 1)).toBe(true);
  });

  it('Brilha Brilha começa na corda Ré solta', () => {
    const [first] = timeline(findFixedSong('brilha-brilha-estrelinha')!.song);
    expect(first).toMatchObject({ midi: 62, string: 1, finger: 0 });
  });

  it('findFixedSong devolve undefined para id desconhecido', () => {
    expect(findFixedSong('nao-existe')).toBeUndefined();
  });
});
