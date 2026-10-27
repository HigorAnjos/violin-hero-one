import type { Plugin } from 'vite';

const CONVERTER_MODULE =
  /\/src\/game\/notation\/(catalog|musicxml|xml|levels|repeats|mxl|midi|abc|importScore)\.ts$|\.musicxml(\?|$)|\/node_modules\/@tonejs\/midi\//;

/**
 * O conversor de MusicXML roda no build (songs:fixed), no seed e no banco, nunca no pacote do app:
 * se algum chunk levar um módulo dele ou uma partitura, o build falha. O fingering.ts pode (Decisões, ciclo 4):
 * é o Viterbi do dedilhado, sem DOM nem XML, e o editor de partitura sugere corda e dedo com ele.
 */
export function noConverterInApp(): Plugin {
  return {
    name: 'no-converter-in-app',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const found = chunk.moduleIds.filter((id) => CONVERTER_MODULE.test(id.replaceAll('\\', '/')));
        if (found.length) this.error(`${chunk.fileName} leva o conversor de MusicXML: ${found.join(', ')}`);
      }
    },
  };
}
