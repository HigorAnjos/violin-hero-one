import { describe, it, expect } from 'vitest';
import { child, children, parseXml, textAt } from './xml';

describe('parseXml', () => {
  it('lê elementos, atributos, texto e entidades, ignorando prólogo, DOCTYPE e comentários', () => {
    const doc = parseXml(`<?xml version="1.0"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD" "x.dtd" [ <!ENTITY a "b"> ]>
<!-- comentário -->
<root a="1" b='dois &amp; três'>
  <item>Ré &lt;maior&gt; &#233;&#x21;</item>
  <empty flag="x"/>
  <item><![CDATA[<cru>]]></item>
</root>`);
    expect(doc.name).toBe('root');
    expect(doc.attributes).toEqual({ a: '1', b: 'dois & três' });
    expect(children(doc, 'item').map((i) => i.text)).toEqual(['Ré <maior> é!', '<cru>']);
    expect(child(doc, 'empty')).toMatchObject({ attributes: { flag: 'x' }, children: [] });
  });

  it('textAt segue o caminho de filhos', () => {
    const doc = parseXml('<note><pitch><step>F</step><alter>1</alter></pitch></note>');
    expect(textAt(doc, 'pitch', 'step')).toBe('F');
    expect(textAt(doc, 'pitch', 'octave')).toBeUndefined();
  });

  it.each([
    ['<a><b></a>', /não fecha/],
    ['<a>', /sem fechamento/],
    ['<a/><b/>', /mais de um elemento raiz/],
    ['', /documento vazio/],
    ['<a><!-- </a>', /comentário sem fim/],
  ])('rejeita %s', (source, message) => {
    expect(() => parseXml(source)).toThrow(message);
  });
});
