import type { MicProblem } from './Ear';

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

/** Tela de problema no microfone; `after` é para onde ir quando o problema se resolve. */
export function micTroubleUrl(problem: MicProblem, after: string): string {
  return `${ROUTES.micTrouble}?${new URLSearchParams({ motivo: PROBLEM_SLUG[problem], depois: after })}`;
}

export function parseMicTrouble(search: URLSearchParams): { problem: MicProblem; after: string } {
  const slug = search.get('motivo');
  const problem = (Object.keys(PROBLEM_SLUG) as MicProblem[]).find((p) => PROBLEM_SLUG[p] === slug) ?? 'no-sound';
  return { problem, after: safeInternalPath(search.get('depois'), ROUTES.home) };
}
