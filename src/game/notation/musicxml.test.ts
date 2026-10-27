import { describe, it, expect } from 'vitest';
import { parseMusicXml, parseMusicXmlParts } from './musicxml';

/** Nota com divisions = 4 (semicolcheia = 1). */
const note = (step: string, octave: number, duration: number, extra = '') =>
  `<note><pitch><step>${step[0]}</step>${step[1] === '#' ? '<alter>1</alter>' : step[1] === 'b' ? '<alter>-1</alter>' : ''}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>1</voice>${extra}</note>`;
const rest = (duration: number) => `<note><rest/><duration>${duration}</duration><voice>1</voice></note>`;
const attributes = (beats = 4, beatType = 4, fifths = 2, mode = 'major') =>
  `<attributes><divisions>4</divisions><key><fifths>${fifths}</fifths><mode>${mode}</mode></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time></attributes>`;
const tempo = (qpm: number) => `<direction><direction-type><words>Moderato</words></direction-type><sound tempo="${qpm}"/></direction>`;
const score = (...measures: string[]) =>
  `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Teste</work-title></work>` +
  `<identification><creator type="composer">Fulano</creator></identification><part-list/><part id="P1">` +
  measures.map((m, i) => (m.startsWith('<measure') ? m : `<measure number="${i + 1}">${m}</measure>`)).join('') +
  `</part></score-partwise>`;

describe('parseMusicXml', () => {
  it('lê título, compositor, tonalidade, compasso, andamento e notas', () => {
    const s = parseMusicXml(score(attributes() + tempo(96) + note('D', 4, 4) + note('F#', 4, 4) + note('Bb', 4, 8)));
    expect(s).toMatchObject({ title: 'Teste', composer: 'Fulano', key: { fifths: 2, mode: 'major' }, bpm: 96, timeSignature: { beats: 4, unit: 4 } });
    expect(s.measures).toEqual([
      {
        beats: 4,
        notes: [
          { beat: 0, beats: 1, midi: 62 },
          { beat: 1, beats: 1, midi: 66 },
          { beat: 2, beats: 2, midi: 70 },
        ],
      },
    ]);
  });

  it('anacruse: compasso implícito curto, e o último completa', () => {
    const s = parseMusicXml(
      score(
        `<measure number="0" implicit="yes">${attributes(3, 4, 0, 'minor')}${tempo(100)}${note('A', 4, 4)}</measure>`,
        note('C', 5, 8) + note('D', 5, 4),
        note('A', 4, 8),
      ),
    );
    expect(s.key).toEqual({ fifths: 0, mode: 'minor' });
    expect(s.timeSignature).toEqual({ beats: 3, unit: 4 });
    expect(s.measures.map((m) => m.beats)).toEqual([1, 3, 2]);
    expect(s.measures[0].notes).toEqual([{ beat: 0, beats: 1, midi: 69 }]);
  });

  it('ligadura entre compassos vira tie na nota de chegada', () => {
    const s = parseMusicXml(
      score(
        attributes() + tempo(60) + note('D', 5, 8) + note('A', 4, 8, '<tie type="start"/>'),
        note('A', 4, 4, '<tie type="stop"/>') + note('B', 4, 12),
      ),
    );
    expect(s.measures[0].notes[1]).toEqual({ beat: 2, beats: 2, midi: 69 });
    expect(s.measures[1].notes[0]).toEqual({ beat: 0, beats: 1, midi: 69, tie: true });
    expect(s.measures[1].notes[1].tie).toBeUndefined();
  });

  it('pausa é silêncio: a nota seguinte começa depois e o compasso conta a pausa', () => {
    const s = parseMusicXml(score(attributes() + tempo(60) + rest(4) + note('E', 4, 2) + rest(2) + note('G', 4, 4) + rest(4)));
    expect(s.measures[0]).toEqual({
      beats: 4,
      notes: [
        { beat: 1, beats: 0.5, midi: 64 },
        { beat: 2, beats: 1, midi: 67 },
      ],
    });
  });

  it('mudança de compasso menor que o do início: o compasso encolhe na unidade da música', () => {
    const s = parseMusicXml(
      score(
        attributes(4, 4) + tempo(80) + note('D', 4, 16),
        `<attributes><time><beats>2</beats><beat-type>4</beat-type></time></attributes>` + note('E', 4, 8),
        `<attributes><time><beats>6</beats><beat-type>8</beat-type></time></attributes>` + note('F#', 4, 12),
      ),
    );
    expect(s.timeSignature).toEqual({ beats: 4, unit: 4 });
    expect(s.measures.map((m) => m.beats)).toEqual([4, 2, 3]);
  });

  it('mudança para compasso maior que o do início não cabe no Song v1', () => {
    expect(() =>
      parseMusicXml(score(attributes(2, 4) + tempo(80) + note('D', 4, 8), `<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>` + note('E', 4, 12))),
    ).toThrow(/maior que o 2\/4/);
  });

  it('compasso em colcheias: tempos e BPM na unidade da música', () => {
    const s = parseMusicXml(score(attributes(6, 8) + tempo(60) + note('D', 4, 6) + note('E', 4, 2) + note('F#', 4, 4)));
    expect(s.bpm).toBe(120);
    expect(s.measures[0].notes.map((n) => [n.beat, n.beats])).toEqual([
      [0, 3],
      [3, 1],
      [4, 2],
    ]);
  });

  it('andamento pelo metrônomo quando não há <sound tempo>', () => {
    const metronome = '<direction><direction-type><metronome><beat-unit>half</beat-unit><per-minute>40</per-minute></metronome></direction-type></direction>';
    expect(parseMusicXml(score(attributes() + metronome + note('D', 4, 16))).bpm).toBe(80);
  });

  it('melodia: só a 1ª voz, a nota mais aguda do acorde, sem apojaturas', () => {
    const s = parseMusicXml(
      score(
        attributes() +
          tempo(60) +
          note('D', 4, 8) +
          '<note><chord/><pitch><step>A</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice></note>' +
          '<note><grace/><pitch><step>C</step><octave>5</octave></pitch><voice>1</voice></note>' +
          note('B', 4, 8) +
          '<backup><duration>16</duration></backup>' +
          '<note><pitch><step>D</step><octave>3</octave></pitch><duration>16</duration><voice>2</voice></note>',
      ),
    );
    expect(s.measures[0]).toEqual({
      beats: 4,
      notes: [
        { beat: 0, beats: 2, midi: 69 },
        { beat: 2, beats: 2, midi: 71 },
      ],
    });
  });

  it.each([
    ['sem andamento', score(attributes() + note('D', 4, 16)), /sem andamento/],
    ['repetição', score(attributes() + tempo(60) + note('D', 4, 16) + '<barline><repeat direction="backward"/></barline>'), /repetição/],
    ['compasso estourado', score(attributes() + tempo(60) + note('D', 4, 20)), /não cabem em 4\/4/],
    ['mudança de andamento', score(attributes() + tempo(60) + note('D', 4, 16), tempo(90) + note('D', 4, 16)), /andamento/],
    ['raiz errada', '<score-timewise/>', /score-partwise/],
  ])('rejeita %s', (_, xml, message) => {
    expect(() => parseMusicXml(xml)).toThrow(message);
  });
});

const barline = (inner: string, location = 'right') => `<barline location="${location}">${inner}</barline>`;
const multipart = (...parts: { id: string; name: string; measures: string[] }[]) =>
  `<?xml version="1.0"?><score-partwise version="4.0"><movement-title>Várias</movement-title><part-list>` +
  parts.map((p) => `<score-part id="${p.id}"><part-name>${p.name}</part-name></score-part>`).join('') +
  `</part-list>` +
  parts.map((p) => `<part id="${p.id}">${p.measures.map((m, i) => `<measure number="${i + 1}">${m}</measure>`).join('')}</part>`).join('') +
  `</score-partwise>`;

describe('parseMusicXml tolerante (importação)', () => {
  it('desdobra repetição com 1ª e 2ª casa', () => {
    const s = parseMusicXml(
      score(
        attributes() + tempo(60) + barline('<repeat direction="forward"/>', 'left') + note('D', 4, 16),
        barline('<ending number="1" type="start"/>', 'left') + note('E', 4, 16) + barline('<ending number="1" type="stop"/><repeat direction="backward"/>'),
        barline('<ending number="2" type="start"/>', 'left') + note('F#', 4, 16) + barline('<ending number="2" type="discontinue"/>'),
        note('G', 4, 16),
      ),
      { lenient: true },
    );
    expect(s.measures.map((m) => m.notes[0].midi)).toEqual([62, 64, 62, 66, 67]);
  });

  it('mudança de tonalidade e de andamento: valem as primeiras', () => {
    const s = parseMusicXml(
      score(attributes(4, 4, 2) + tempo(60) + note('D', 4, 16), `<attributes><key><fifths>-3</fifths></key></attributes>` + tempo(90) + note('E', 4, 16)),
      { lenient: true },
    );
    expect(s.key).toEqual({ fifths: 2, mode: 'major' });
    expect(s.bpm).toBe(60);
  });

  it('compasso maior que o do início alarga a fórmula da música', () => {
    const s = parseMusicXml(
      score(attributes(2, 4) + tempo(80) + note('D', 4, 8), `<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>` + note('E', 4, 12)),
      { lenient: true },
    );
    expect(s.timeSignature).toEqual({ beats: 3, unit: 4 });
    expect(s.measures.map((m) => m.beats)).toEqual([2, 3]);
  });

  it('sem andamento, armadura nem fórmula: 100 bpm, Dó maior e 4/4', () => {
    const s = parseMusicXml(score('<attributes><divisions>4</divisions></attributes>' + note('C', 5, 16)), { lenient: true });
    expect(s).toMatchObject({ bpm: 100, key: { fifths: 0, mode: 'major' }, timeSignature: { beats: 4, unit: 4 } });
  });
});

describe('parseMusicXmlParts', () => {
  it('cada parte vira uma melodia com o nome do <part-list>; o andamento da 1ª vale para as outras', () => {
    const parts = parseMusicXmlParts(
      multipart(
        { id: 'P1', name: 'Voice', measures: [attributes() + tempo(72) + note('A', 4, 16)] },
        { id: 'P2', name: 'Piano', measures: [attributes() + note('C', 3, 16)] },
      ),
    );
    expect(parts.map((p) => [p.id, p.name, p.score.title, p.score.bpm, p.score.measures[0].notes[0].midi])).toEqual([
      ['P1', 'Voice', 'Várias', 72, 69],
      ['P2', 'Piano', 'Várias', 72, 48],
    ]);
  });
});
