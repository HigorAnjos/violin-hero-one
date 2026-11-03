// Versão dos apps de loja a partir do "version" do package.json. Mesma regra do android/app/build.gradle:
// código = major * 1.000.000 + minor * 1.000 + patch (0.1.0 → 1000), crescente sempre que a versão sobe.
// Uso: node scripts/app-version.mjs → {"name":"0.1.0","code":1000} (o job do iOS usa name e code no xcodebuild).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Nome e código da versão; lança se a versão não for x.y.z com y e z até 999. */
export function appVersion(version) {
  const parts = String(version).split('-')[0].split('.');
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) throw new Error(`versão fora do formato x.y.z: ${version}`);
  const [major, minor, patch] = parts.map(Number);
  if (minor > 999 || patch > 999) throw new Error(`minor e patch vão até 999: ${version}`);
  return { name: String(version), code: major * 1_000_000 + minor * 1_000 + patch };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(appVersion(version)));
}
