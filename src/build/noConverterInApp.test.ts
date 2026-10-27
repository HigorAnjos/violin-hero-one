import { describe, it, expect, vi } from 'vitest';
import { noConverterInApp } from './noConverterInApp';

const chunk = (fileName: string, moduleIds: string[]) => ({ type: 'chunk', fileName, moduleIds });
const asset = (fileName: string) => ({ type: 'asset', fileName });

function run(bundle: Record<string, unknown>) {
  const error = vi.fn();
  const generateBundle = noConverterInApp().generateBundle as (this: unknown, options: unknown, bundle: unknown) => void;
  generateBundle.call({ error }, {}, bundle);
  return error;
}

describe('noConverterInApp', () => {
  it('só roda no build', () => {
    expect(noConverterInApp().apply).toBe('build');
  });

  it('chunk que leva musicxml.ts derruba o build listando os módulos', () => {
    const error = run({
      a: chunk('assets/index.js', ['/app/src/main.tsx', '/app/src/game/notation/musicxml.ts', '/app/src/game/notation/xml.ts']),
    });
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0]).toBe(
      'assets/index.js leva o conversor de MusicXML: /app/src/game/notation/musicxml.ts, /app/src/game/notation/xml.ts'
    );
  });

  it.each(['catalog', 'levels', 'fingering', 'repeats', 'mxl', 'midi', 'abc', 'importScore'])('%s.ts também conta', (name) => {
    const error = run({ a: chunk('assets/index.js', [`/app/src/game/notation/${name}.ts`]) });
    expect(error.mock.calls[0][0]).toContain(`notation/${name}.ts`);
  });

  it('o leitor de MIDI (@tonejs/midi) também derruba o build', () => {
    const error = run({ a: chunk('assets/index.js', ['/app/node_modules/@tonejs/midi/dist/Midi.js']) });
    expect(error).toHaveBeenCalledOnce();
  });

  it('partitura importada como ?raw derruba o build', () => {
    const error = run({ a: chunk('assets/play.js', ['/app/content/songs/ode-a-alegria.musicxml?raw']) });
    expect(error.mock.calls[0][0]).toBe('assets/play.js leva o conversor de MusicXML: /app/content/songs/ode-a-alegria.musicxml?raw');
  });

  it('caminho do Windows com barra invertida também é pego, e a mensagem mostra como veio', () => {
    const id = 'C:\\app\\src\\game\\notation\\levels.ts';
    const error = run({ a: chunk('assets/index.js', [id]) });
    expect(error.mock.calls[0][0]).toBe(`assets/index.js leva o conversor de MusicXML: ${id}`);
  });

  it('cada chunk sujo é acusado', () => {
    const error = run({
      a: chunk('assets/a.js', ['/app/src/game/notation/catalog.ts']),
      b: chunk('assets/b.js', ['/app/content/songs/aleluia.musicxml']),
    });
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('chunk limpo e asset passam, inclusive song.ts, songs.ts e o levels do engine', () => {
    const error = run({
      a: chunk('assets/index.js', [
        '/app/src/game/notation/song.ts',
        '/app/src/game/notation/songs.ts',
        '/app/src/game/notation/fixedSongs.json',
        '/app/src/game/engine/levels.ts',
      ]),
      b: asset('assets/fonte.woff2'),
    });
    expect(error).not.toHaveBeenCalled();
  });
});
