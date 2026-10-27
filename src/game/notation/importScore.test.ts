// @vitest-environment node
import { readFileSync } from 'node:fs';
import { Midi } from '@tonejs/midi';
import { describe, it, expect } from 'vitest';
import { parseAbcParts } from './abc';
import { detectFormat, importEditorSong, importFile, ImportError, IMPORT_LIMITS, type ImportOutcome, type ImportedSong } from './importScore';
import { attacks, parseSong, timeline, type Song } from './song';

const FIXTURES = new URL('../../../content/import-fixtures/', import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));
const ID = '0f8c2a4e-1b2c-4d5e-8f90-123456789abc';

const songOf = (outcome: ImportOutcome): ImportedSong => {
  if (outcome.kind !== 'song') throw new Error(`esperava música, veio ${JSON.stringify(outcome)}`);
  return outcome.song;
};

const rejects = async (promise: Promise<unknown> | (() => unknown), code: string) => {
  const run = typeof promise === 'function' ? Promise.resolve().then(promise) : promise;
  await expect(run).rejects.toSatisfy((e: unknown) => e instanceof ImportError && e.code === code);
};

describe('as 5 partituras reais de content/import-fixtures', () => {
  it.each([
    ['lehmann-the-yellowhammer.mxl', 'mxl', 'The Yellowhammer', 'Voice'],
    ['brahms-heimweh-1.musicxml', 'musicxml', 'Heimweh I', 'Singstimme Voice'],
    ['baltzar-prelude.mid', 'midi', 'baltzar prelude', 'one'],
    ['soldiers-joy.mid', 'midi', 'soldiers joy', 'one'],
    ['red-apple-rag.abc', 'abc', 'Red Apple Rag', 'Red Apple Rag'],
  ])('%s importa sem erro: 3 níveis válidos, original guardado', async (name, format, title, part) => {
    const song = songOf(await importFile({ fileName: name, bytes: fixture(name) }, ID));
    expect(song.source.format).toBe(format);
    expect(song.source.fileName).toBe(name);
    expect(song.sheet.title).toBe(title);
    expect(song.part?.name).toBe(part);
    expect(song.levels).toEqual(['easy', 'medium', 'hard']);
    for (const level of song.levels) {
      const chart = song.charts[level]!;
      expect(parseSong(JSON.parse(JSON.stringify(chart)))).toEqual(chart);
      expect(chart.id).toBe(ID);
      expect(chart.level).toBe(level);
    }
    expect(song.sheet.durationSeconds).toBeGreaterThan(0);
  });

  it('Lehmann: a voz (não o piano), com as ligaduras e as pausas da partitura', async () => {
    const song = songOf(await importFile({ fileName: 'a.mxl', bytes: fixture('lehmann-the-yellowhammer.mxl') }, ID));
    const hard = song.charts.hard!;
    expect(timeline(hard).filter((n) => n.tie).length).toBeGreaterThan(0);
    // pausa: alguma nota começa depois do fim da anterior
    const notes = timeline(hard);
    expect(notes.some((n, i) => i > 0 && n.at > notes[i - 1].at + notes[i - 1].beats + 1e-6)).toBe(true);
    expect(song.part).toMatchObject({ violin: false, fits: true });
  });

  it('Brahms: mudança de 3/4 para 2/4 vira compassos de 3 e de 2 tempos', async () => {
    const song = songOf(await importFile({ fileName: 'b.musicxml', bytes: fixture('brahms-heimweh-1.musicxml') }, ID));
    const beats = new Set(song.charts.hard!.measures.map((m) => m.beats));
    expect(beats.has(3)).toBe(true);
    expect(beats.has(2)).toBe(true);
    expect(song.sheet.composer).toBe('Johannes Brahms');
  });

  it('Baltzar: trilha de violino (programa 40), todas as 455 notas da melodia', async () => {
    const song = songOf(await importFile({ fileName: 'baltzar-prelude.mid', bytes: fixture('baltzar-prelude.mid') }, ID));
    expect(song.part).toMatchObject({ violin: true, highest: 84 });
    expect(song.sheet).toMatchObject({ key: 'G major', bpm: 92, timeSignature: { beats: 4, unit: 4 } });
    expect(attacks(song.charts.hard!).length).toBeGreaterThan(300);
  });

  it('Soldier’s Joy: sem trilha de violino, fica a mais aguda (a melodia, não os acordes)', async () => {
    const song = songOf(await importFile({ fileName: 'soldiers-joy.mid', bytes: fixture('soldiers-joy.mid') }, ID));
    expect(song.part).toMatchObject({ id: 't0', violin: false, lowest: 62, highest: 81 });
  });

  it('Red Apple Rag: o ABC desdobrado toca as mesmas notas, no mesmo tempo, que o MIDI da edição do Mutopia', () => {
    const [part] = parseAbcParts(new TextDecoder().decode(fixture('red-apple-rag.abc')), 'x');
    let at = 0;
    const fromAbc = part.score.measures.flatMap((m) => {
      const notes = m.notes.map((n) => [n.midi, (at + n.beat) * 384]);
      at += m.beats;
      return notes;
    });
    const midi = new Midi(fixture('reference/red-apple-rag-mutopia.mid'));
    expect(fromAbc).toEqual(midi.tracks[0].notes.map((n) => [n.midi, n.ticks]));
  });
});

describe('importFile: escolha da parte', () => {
  const xml = (...parts: [string, string, string][]) =>
    new TextEncoder().encode(
      `<score-partwise><part-list>${parts.map(([id, name]) => `<score-part id="${id}"><part-name>${name}</part-name></score-part>`).join('')}</part-list>` +
        parts
          .map(
            ([id, , step]) =>
              `<part id="${id}"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>` +
              `<note><pitch><step>${step[0]}</step><octave>${step[1]}</octave></pitch><duration>4</duration></note></measure></part>`,
          )
          .join('') +
        `</score-partwise>`,
    );

  it('duas partes de violino: devolve a lista; na segunda chamada, usa a escolhida', async () => {
    const bytes = xml(['P1', 'Violin I', 'A5'], ['P2', 'Violin II', 'D5'], ['P3', 'Cello', 'C2']);
    const first = await importFile({ fileName: 'q.musicxml', bytes }, ID);
    expect(first).toEqual({
      kind: 'choose-part',
      parts: [
        { id: 'P1', name: 'Violin I', notes: 1, lowest: 81, highest: 81, fits: true, violin: true },
        { id: 'P2', name: 'Violin II', notes: 1, lowest: 74, highest: 74, fits: true, violin: true },
        { id: 'P3', name: 'Cello', notes: 1, lowest: 36, highest: 36, fits: false, violin: false },
      ],
    });
    const second = songOf(await importFile({ fileName: 'q.musicxml', bytes, part: 'P2' }, ID));
    expect(second.part?.id).toBe('P2');
    expect(second.charts.hard!.measures[0].notes[0].midi).toBe(74);
  });

  it('parte que não existe, ou que não cabe no violino, é recusada', async () => {
    const bytes = xml(['P1', 'Flauta', 'A5']);
    await rejects(importFile({ fileName: 'q.xml', bytes, part: 'P9' }, ID), 'part_not_found');
  });

  it('a única parte com notas fora do violino: notas fora da extensão', async () => {
    // Dó 2 e Sol 7 ao mesmo tempo não cabem em oitava nenhuma
    const bytes = new TextEncoder().encode(
      `<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1">` +
        `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>` +
        `<note><pitch><step>C</step><octave>2</octave></pitch><duration>2</duration></note>` +
        `<note><pitch><step>G</step><octave>7</octave></pitch><duration>2</duration></note></measure></part></score-partwise>`,
    );
    await rejects(importFile({ fileName: 'p.musicxml', bytes }, ID), 'out_of_range');
  });

  it('nenhuma parte com notas: sem parte para o violino', async () => {
    const bytes = new TextEncoder().encode(
      `<score-partwise><part-list><score-part id="P1"><part-name>Voz</part-name></score-part></part-list><part id="P1"><measure number="1">` +
        `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><rest/><duration>4</duration></note></measure></part></score-partwise>`,
    );
    await rejects(importFile({ fileName: 'p.musicxml', bytes }, ID), 'no_violin_part');
  });
});

describe('importFile: formato e limites', () => {
  it('extensão desconhecida, conteúdo que não bate com a extensão e lixo: formato não reconhecido', async () => {
    const abc = fixture('red-apple-rag.abc');
    await rejects(importFile({ fileName: 'musica.pdf', bytes: abc }, ID), 'unknown_format');
    await rejects(importFile({ fileName: 'forjado.mid', bytes: abc }, ID), 'unknown_format');
    await rejects(importFile({ fileName: 'forjado.mxl', bytes: fixture('baltzar-prelude.mid') }, ID), 'unknown_format');
    await rejects(importFile({ fileName: 'lixo.musicxml', bytes: new TextEncoder().encode('<html>oi</html>') }, ID), 'unknown_format');
    await rejects(importFile({ fileName: 'binario.abc', bytes: new Uint8Array([0xff, 0x00, 0xc3, 0x28]) }, ID), 'unknown_format');
    await rejects(importFile({ fileName: 'vazio.abc', bytes: new Uint8Array() }, ID), 'unknown_format');
  });

  it('MIDI com cabeçalho certo e corpo forjado, e MusicXML quebrado: arquivo ilegível', async () => {
    const midi = fixture('baltzar-prelude.mid').slice(0, 40);
    await rejects(importFile({ fileName: 'cortado.mid', bytes: midi }, ID), 'invalid_file');
    const xml = new TextEncoder().encode('<score-partwise><part-list></part-list><part id="P1"><measure>');
    await rejects(importFile({ fileName: 'quebrado.musicxml', bytes: xml }, ID), 'invalid_file');
  });

  it('arquivo acima de 1 MB é recusado antes de ler', async () => {
    await rejects(importFile({ fileName: 'grande.abc', bytes: new Uint8Array(IMPORT_LIMITS.fileBytes + 1) }, ID), 'file_too_large');
  });

  it('notas demais e duração demais', async () => {
    const tune = (bars: number, tempo: number) =>
      new TextEncoder().encode(`X:1\nT:Longa\nM:4/4\nL:1/8\nQ:1/4=${tempo}\nK:D\n${'defg abag |'.repeat(bars)}\n`);
    await rejects(importFile({ fileName: 'n.abc', bytes: tune(Math.ceil(IMPORT_LIMITS.notes / 8) + 1, 400) }, ID), 'too_many_notes');
    await rejects(importFile({ fileName: 'd.abc', bytes: tune(240, 30) }, ID), 'too_long');
  });

  it('detectFormat aceita .xml e .midi', () => {
    expect(detectFormat('a.xml', fixture('brahms-heimweh-1.musicxml'))).toBe('musicxml');
    expect(detectFormat('a.MIDI', fixture('soldiers-joy.mid'))).toBe('midi');
  });
});

describe('importEditorSong', () => {
  const melody = (notes: { beat: number; beats: number; midi: number; tie?: boolean }[]): Partial<Song> => ({
    formatVersion: 1,
    id: 'qualquer',
    title: '  Minha melodia ',
    composer: 'Eu',
    key: 'G major',
    bpm: 90,
    timeSignature: { beats: 4, unit: 4 },
    level: 'hard',
    measures: [{ beats: 4, notes: notes as Song['measures'][number]['notes'] }],
  });

  it('refaz corda, dedo e os 3 níveis; o id é o do servidor e o original é o JSON recebido', () => {
    const raw = melody([
      { beat: 0, beats: 1, midi: 55 },
      { beat: 1, beats: 1, midi: 57 },
      { beat: 2, beats: 2, midi: 59 },
    ]);
    const song = songOf(importEditorSong(raw, ID));
    expect(song.sheet).toMatchObject({ title: 'Minha melodia', composer: 'Eu', key: 'G major', bpm: 90 });
    expect(song.levels).toEqual(['easy', 'medium', 'hard']);
    expect(song.charts.hard!.id).toBe(ID);
    // Sol solto na corda Sol; Lá e Si com 1º e 2º dedo na mesma corda
    expect(song.charts.hard!.measures[0].notes.map((n) => [n.string, n.finger])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(song.source).toEqual({ format: 'song', fileName: 'editor.json', content: JSON.stringify(raw) });
    expect(song.part).toBeNull();
  });

  it('sem compassos, nota sem altura, sem notas, nota além do compasso ou fora do violino são recusadas', async () => {
    await rejects(() => importEditorSong({ title: 'x' }, ID), 'invalid_song');
    await rejects(() => importEditorSong(melody([{ beat: 0, beats: 1, midi: Number.NaN }]), ID), 'invalid_song');
    await rejects(() => importEditorSong(melody([]), ID), 'invalid_song');
    await rejects(() => importEditorSong(melody([{ beat: 3, beats: 2, midi: 67 }]), ID), 'invalid_song');
    await rejects(() => importEditorSong(melody([{ beat: 0, beats: 1, midi: 30 }, { beat: 1, beats: 1, midi: 100 }]), ID), 'out_of_range');
  });
});
