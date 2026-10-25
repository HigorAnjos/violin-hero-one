import { describe, it, expect } from 'vitest';
import { micTroubleUrl, parseMicTrouble, ROUTES, safeInternalPath } from './routes';

describe('rotas', () => {
  it('ida e volta da tela de problema no microfone, com a causa', () => {
    const url = micTroubleUrl('no-sound', ROUTES.strings, 'in-use');
    expect(url).toBe('/microfone/problema?motivo=sem-som&depois=%2Fprimeira-vez%2Fcordas&causa=in-use');
    expect(parseMicTrouble(new URL(url, 'http://x').searchParams)).toEqual({ problem: 'no-sound', after: ROUTES.strings, cause: 'in-use' });
  });

  it('motivo desconhecido vira "sem som"; destino de fora vira a raiz; causa inventada some', () => {
    expect(parseMicTrouble(new URLSearchParams('motivo=xyz&depois=https://mal.com&causa=toString'))).toEqual({
      problem: 'no-sound',
      after: '/',
      cause: null,
    });
  });

  it('só aceita caminho interno', () => {
    expect(safeInternalPath('/contagem', '/')).toBe('/contagem');
    for (const bad of ['//mal.com', '/\\mal.com', 'javascript:alert(1)', null]) expect(safeInternalPath(bad, '/')).toBe('/');
  });
});
