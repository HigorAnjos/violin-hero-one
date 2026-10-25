import type { MicTrouble } from '../game/audio';
import { TROUBLE_SCREEN, type MicProblem } from './Ear';

/** Endereços das telas. Os nomes seguem o português da interface. */
export const ROUTES = {
  home: '/',
  foundation: '/teste',
  level: '/primeira-vez/nivel',
  mic: '/primeira-vez/microfone',
  strings: '/primeira-vez/cordas',
  micTrouble: '/microfone/problema',
  countdown: '/contagem',
} as const;

const PROBLEM_SLUG: Record<MicProblem, string> = { 'no-sound': 'sem-som', noisy: 'barulho', blocked: 'sem-permissao' };

/** Só caminho interno: `?depois=` vindo da URL nunca leva para fora do jogo. */
export function safeInternalPath(raw: string | null, fallback: string): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : fallback;
}

/** Tela de problema no microfone; `after` é para onde ir resolvido; `cause` é o motivo exato do navegador. */
export function micTroubleUrl(problem: MicProblem, after: string, cause?: MicTrouble): string {
  const params = new URLSearchParams({ motivo: PROBLEM_SLUG[problem], depois: after });
  if (cause) params.set('causa', cause);
  return `${ROUTES.micTrouble}?${params}`;
}

export function parseMicTrouble(search: URLSearchParams): { problem: MicProblem; after: string; cause: MicTrouble | null } {
  const slug = search.get('motivo');
  const problem = (Object.keys(PROBLEM_SLUG) as MicProblem[]).find((p) => PROBLEM_SLUG[p] === slug) ?? 'no-sound';
  const rawCause = search.get('causa');
  const cause = rawCause && Object.hasOwn(TROUBLE_SCREEN, rawCause) ? (rawCause as MicTrouble) : null;
  return { problem, after: safeInternalPath(search.get('depois'), ROUTES.home), cause };
}
