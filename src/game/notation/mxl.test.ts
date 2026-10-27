// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { isZip, MXL_MAX_UNZIPPED_BYTES, unzipMusicXml } from './mxl';

/** Zip mínimo com arquivos "stored" ou "deflate" (sem CRC: o leitor não confere). */
async function zip(files: { name: string; content: string | Uint8Array; deflate?: boolean }[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const raw = typeof f.content === 'string' ? encoder.encode(f.content) : f.content;
    const data = f.deflate
      ? new Uint8Array(await new Response(new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
      : raw;
    const name = encoder.encode(f.name);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, f.deflate ? 8 : 0, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, f.deflate ? 8 : 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const CONTAINER = (path: string) => `<?xml version="1.0"?><container><rootfiles><rootfile full-path="${path}"/></rootfiles></container>`;

describe('unzipMusicXml', () => {
  it('lê o .mxl real da fixture (container.xml → score.xml)', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('../../../content/import-fixtures/lehmann-the-yellowhammer.mxl', import.meta.url)));
    expect(isZip(bytes)).toBe(true);
    const xml = await unzipMusicXml(bytes);
    expect(xml).toContain('<score-partwise');
    expect(xml).toContain('The Yellowhammer');
  });

  it('segue o rootfile do container, comprimido ou não', async () => {
    const bytes = await zip([
      { name: 'META-INF/container.xml', content: CONTAINER('pasta/peca.musicxml'), deflate: true },
      { name: 'outra.xml', content: '<errado/>' },
      { name: 'pasta/peca.musicxml', content: '<score-partwise/>', deflate: true },
    ]);
    expect(await unzipMusicXml(bytes)).toBe('<score-partwise/>');
  });

  it('sem container.xml, o único .xml fora de META-INF', async () => {
    expect(await unzipMusicXml(await zip([{ name: 'a.xml', content: '<score-partwise/>' }]))).toBe('<score-partwise/>');
    await expect(unzipMusicXml(await zip([{ name: 'a.txt', content: 'x' }]))).rejects.toThrow(/sem a partitura/);
  });

  it('container apontando para arquivo que não existe, zip cortado ou sem zip são recusados', async () => {
    await expect(unzipMusicXml(await zip([{ name: 'META-INF/container.xml', content: CONTAINER('nada.xml') }]))).rejects.toThrow(/não aponta/);
    const ok = await zip([{ name: 'a.xml', content: '<score-partwise/>' }]);
    await expect(unzipMusicXml(ok.slice(0, ok.length - 10))).rejects.toThrow(/MXL/);
    await expect(unzipMusicXml(new TextEncoder().encode('<score-partwise/>'))).rejects.toThrow(/não é um arquivo zip/);
  });

  it('zip bomb: descomprimido acima do teto é recusado no meio da leitura', async () => {
    const bomb = await zip([{ name: 'a.xml', content: new Uint8Array(MXL_MAX_UNZIPPED_BYTES + 1024), deflate: true }]);
    expect(bomb.length).toBeLessThan(64 * 1024);
    // o tamanho declarado mente (pequeno): o teto vale enquanto descomprime
    new DataView(bomb.buffer).setUint32(bomb.length - 22 - 46 - 5 + 24, 10, true);
    await expect(unzipMusicXml(bomb)).rejects.toThrow(/grande demais/);
  });
});
