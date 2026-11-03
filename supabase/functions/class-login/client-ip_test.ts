import { clientIp, debugClientIp, IP_HEADERS, throttleIp } from './client-ip.ts';

Deno.test('limite por IP só liga com on; desligado envia vazio para a RPC', () => {
  const req = new Request('https://example.test', { headers: { 'x-forwarded-for': 'cliente, proxy' } });
  for (const flag of [undefined, '', 'off', 'ON']) equal(throttleIp(req, flag), '');
  equal(throttleIp(req, 'on'), 'proxy');
  equal(throttleIp(req, 'on', 'xff-first'), 'cliente');
});

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}

Deno.test('seleção de IP: padrão histórico, primeiro e último XFF', () => {
  const req = new Request('https://example.test', { headers: { 'x-forwarded-for': '38.4.177.200, 99.82.164.142' } });
  equal(clientIp(req), '99.82.164.142');
  equal(clientIp(req, 'xff-last'), '99.82.164.142');
  equal(clientIp(req, 'xff-first'), '38.4.177.200');
  equal(clientIp(req, 'inválido'), '99.82.164.142');
  equal(clientIp(req, 'x-real-ip'), '99.82.164.142');
  equal(clientIp(req, 'forwarded'), '99.82.164.142');
  equal(clientIp(new Request('https://example.test')), '');
});

for (const header of IP_HEADERS.filter((header) => header !== 'forwarded')) {
  Deno.test(`seleciona cabeçalho ${header} e limita a 64 caracteres`, () => {
    const req = new Request('https://example.test', { headers: { [header]: `  ${'a'.repeat(80)}  ` } });
    equal(clientIp(req, header), 'a'.repeat(64));
  });
}

Deno.test('diagnóstico só com on, inclui XFF inteiro e exclui corpo e outros cabeçalhos', () => {
  const req = new Request('https://example.test', {
    method: 'POST', headers: { 'x-forwarded-for': 'cliente, proxy', authorization: 'segredo' },
    body: JSON.stringify({ name: 'Nome privado', pin: '1234' }),
  });
  const calls: unknown[][] = [];
  const log = (...args: unknown[]) => { calls.push(args); };
  for (const flag of [undefined, '', 'off', 'ON']) debugClientIp(req, flag, log);
  equal(calls.length, 0);
  debugClientIp(req, 'on', log);
  equal(calls, [['class-login ip headers', Object.fromEntries(IP_HEADERS.map((header) => [header, header === 'x-forwarded-for' ? 'cliente, proxy' : null]))]]);
});
