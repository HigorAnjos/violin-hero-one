import { describe, it, expect } from 'vitest';
import { micTroubleUrl, parseMicTrouble, ROUTES, safeInternalPath } from './routes';

describe('rotas', () => {
  it('ida e volta da tela de problema no microfone', () => {
    const url = micTroubleUrl('blocked', ROUTES.strings);
    expect(url).toBe('/microfone/problema?motivo=sem-permissao&depois=%2Fprimeira-vez%2Fcordas');
    expect(parseMicTrouble(new URL(url, 'http://x').searchParams)).toEqual({ problem: 'blocked', after: ROUTES.strings });
  });

  it('motivo desconhecido vira "sem som"; destino de fora vira a raiz', () => {
    expect(parseMicTrouble(new URLSearchParams('motivo=xyz&depois=https://mal.com'))).toEqual({ problem: 'no-sound', after: '/' });
  });

  it('só aceita caminho interno', () => {
    expect(safeInternalPath('/contagem', '/')).toBe('/contagem');
    for (const bad of ['//mal.com', '/\\mal.com', 'javascript:alert(1)', null]) expect(safeInternalPath(bad, '/')).toBe('/');
  });
});
