// MusicXML comprimido (.mxl): um zip com META-INF/container.xml apontando para a partitura.
// Leitor de zip mínimo (sem dependência): só "stored" e "deflate", sem zip64 nem senha, com teto de tamanho.
import { child, children, parseXml } from './xml.ts';

/** Teto do que sai do zip: protege a função de zip bomb (o arquivo de entrada já é limitado a 1 MB). */
export const MXL_MAX_UNZIPPED_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 64;

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

const fail = (message: string): never => {
  throw new RangeError(`MXL: ${message}`);
};

export const isZip = (bytes: Uint8Array) => bytes.length >= 4 && new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === LOCAL;

function entries(bytes: Uint8Array): Entry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail('zip sem diretório central');
  const count = view.getUint16(eocd + 10, true);
  if (count > MAX_ENTRIES) fail(`zip com ${count} arquivos`);
  let at = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const found: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) fail('diretório central corrompido');
    const flags = view.getUint16(at + 8, true);
    if (flags & 1) fail('zip com senha');
    const nameLength = view.getUint16(at + 28, true);
    const entry: Entry = {
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      offset: view.getUint32(at + 42, true),
      name: decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)),
    };
    if (entry.compressedSize === 0xffffffff || entry.size === 0xffffffff) fail('zip64 não suportado');
    found.push(entry);
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return found;
}

async function inflate(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      fail('conteúdo descomprimido grande demais');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function read(bytes: Uint8Array, entry: Entry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.offset;
  if (at + 30 > bytes.length || view.getUint32(at, true) !== LOCAL) fail(`"${entry.name}" corrompido`);
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (data.length !== entry.compressedSize) fail(`"${entry.name}" cortado`);
  if (entry.size > MXL_MAX_UNZIPPED_BYTES) fail('conteúdo descomprimido grande demais');
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflate(data, MXL_MAX_UNZIPPED_BYTES);
  return fail(`compressão ${entry.method} não suportada`);
}

/** O MusicXML de dentro do .mxl: o rootfile do container.xml, ou o único .xml/.musicxml fora de META-INF. */
export async function unzipMusicXml(bytes: Uint8Array): Promise<string> {
  if (!isZip(bytes)) fail('não é um arquivo zip');
  const list = entries(bytes);
  const byName = new Map(list.map((e) => [e.name, e]));
  const decoder = new TextDecoder('utf-8');
  let target: Entry | undefined;
  const container = byName.get('META-INF/container.xml');
  if (container) {
    const root = parseXml(decoder.decode(await read(bytes, container)));
    const path = children(child(root, 'rootfiles'), 'rootfile')
      .map((r) => r.attributes['full-path'])
      .find((p) => p && !/\.(png|jpe?g|pdf)$/i.test(p));
    target = path ? byName.get(path) : undefined;
    if (!target) fail('container.xml não aponta para a partitura');
  } else {
    const scores = list.filter((e) => !e.name.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(e.name));
    if (scores.length !== 1) fail('zip sem a partitura MusicXML');
    target = scores[0];
  }
  return decoder.decode(await read(bytes, target!));
}
