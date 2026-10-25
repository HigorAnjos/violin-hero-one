// Leitor de XML mínimo, sem DOM: o conversor roda no navegador e no Node (seed-songs).
// Cobre o que MusicXML usa: elementos, atributos, texto, comentários, CDATA, DOCTYPE e entidades.

export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(raw: string): string {
  return raw.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[entity] ?? whole;
  });
}

const ATTRIBUTE = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function parseXml(source: string): XmlElement {
  const root: XmlElement = { name: '#document', attributes: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  let i = 0;
  const fail = (message: string): never => {
    const line = source.slice(0, i).split('\n').length;
    throw new SyntaxError(`XML inválido na linha ${line}: ${message}`);
  };
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt === -1) {
      if (source.slice(i).trim()) fail('texto fora do elemento raiz');
      break;
    }
    if (lt > i) top.text += decode(source.slice(i, lt));
    i = lt;
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i);
      if (end === -1) fail('comentário sem fim');
      i = end + 3;
    } else if (source.startsWith('<![CDATA[', i)) {
      const end = source.indexOf(']]>', i);
      if (end === -1) fail('CDATA sem fim');
      top.text += source.slice(i + 9, end);
      i = end + 3;
    } else if (source.startsWith('<?', i)) {
      const end = source.indexOf('?>', i);
      if (end === -1) fail('instrução sem fim');
      i = end + 2;
    } else if (source.startsWith('<!', i)) {
      // DOCTYPE pode trazer subconjunto interno entre colchetes
      let depth = 0;
      let j = i + 2;
      for (; j < source.length; j++) {
        if (source[j] === '[') depth++;
        else if (source[j] === ']') depth--;
        else if (source[j] === '>' && depth === 0) break;
      }
      if (j >= source.length) fail('declaração sem fim');
      i = j + 1;
    } else if (source[i + 1] === '/') {
      const end = source.indexOf('>', i);
      if (end === -1) fail('fechamento sem fim');
      const name = source.slice(i + 2, end).trim();
      if (stack.length === 1 || top.name !== name) fail(`</${name}> não fecha <${top.name}>`);
      top.text = top.text.trim();
      stack.pop();
      i = end + 1;
    } else {
      const end = source.indexOf('>', i);
      if (end === -1) fail('elemento sem fim');
      const selfClosing = source[end - 1] === '/';
      const body = source.slice(i + 1, selfClosing ? end - 1 : end);
      const name = /^[\w:.-]+/.exec(body)?.[0] ?? fail('elemento sem nome');
      const element: XmlElement = { name, attributes: {}, children: [], text: '' };
      for (const match of body.slice(name.length).matchAll(ATTRIBUTE)) {
        element.attributes[match[1]] = decode(match[3] ?? match[4]);
      }
      if (stack.length === 1 && root.children.length) fail('mais de um elemento raiz');
      top.children.push(element);
      if (!selfClosing) stack.push(element);
      i = end + 1;
    }
  }
  if (stack.length > 1) fail(`<${stack[stack.length - 1].name}> sem fechamento`);
  const [document] = root.children;
  if (!document) fail('documento vazio');
  return document;
}

export function child(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return element?.children.find((c) => c.name === name);
}

export function children(element: XmlElement | undefined, name: string): XmlElement[] {
  return element ? element.children.filter((c) => c.name === name) : [];
}

/** Texto do caminho de filhos, ex.: textAt(note, 'pitch', 'step'). */
export function textAt(element: XmlElement | undefined, ...path: string[]): string | undefined {
  let node = element;
  for (const name of path) node = child(node, name);
  return node?.text;
}
