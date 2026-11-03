// A regra da versão dos apps de loja (scripts/app-version.mjs, a mesma do android/app/build.gradle).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { appVersion } from './app-version.mjs';

describe('appVersion', () => {
  it('major * 1.000.000 + minor * 1.000 + patch', () => {
    assert.deepEqual(appVersion('0.1.0'), { name: '0.1.0', code: 1000 });
    assert.deepEqual(appVersion('1.2.3'), { name: '1.2.3', code: 1002003 });
    assert.deepEqual(appVersion('2.0.0-beta.1'), { name: '2.0.0-beta.1', code: 2000000 });
  });

  it('sempre cresce quando a versão sobe', () => {
    const order = ['0.1.0', '0.1.1', '0.1.999', '0.2.0', '0.999.999', '1.0.0', '1.0.1', '10.0.0'];
    const codes = order.map((v) => appVersion(v).code);
    assert.deepEqual([...codes].sort((a, b) => a - b), codes);
    assert.equal(new Set(codes).size, codes.length);
  });

  it('recusa o que quebraria a regra', () => {
    for (const bad of ['1.0', '1.0.0.0', '1.1000.0', '1.0.1000', 'v1.0.0', '']) assert.throws(() => appVersion(bad), undefined, bad);
  });

  it('a linha de comando lê o package.json', () => {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const out = JSON.parse(execFileSync(process.execPath, [new URL('./app-version.mjs', import.meta.url).pathname], { encoding: 'utf8' }));
    assert.deepEqual(out, appVersion(version));
  });
});
