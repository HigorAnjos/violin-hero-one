import type { MicTrouble } from '../game/audio';
import { TROUBLE_SCREEN, type MicProblem } from './Ear';

/** Endereços das telas. Os nomes seguem o português da interface. */
export const ROUTES = {
  home: '/',
  modes: '/tocar',
  songs: '/tocar/musica',
  loading: '/tocar/carregando',
  library: '/biblioteca',
  /** Escrever partitura (a música fica privada de quem escreveu). */
  editor: '/editor',
  /** A aba "Ditar tocando" do editor: a única do editor que abre o microfone. */
  dictation: '/editor/ditar',
  level: '/primeira-vez/nivel',
  mic: '/primeira-vez/microfone',
  strings: '/primeira-vez/cordas',
  micTrouble: '/microfone/problema',
  countdown: '/contagem',
  calibration: '/afinar',
  game: '/jogo',
  sheet: '/jogo/partitura',
  strings3d: '/jogo/3d',
  practice: '/pratica',
  gameOver: '/orquestra-parou',
  badge: '/selo-novo',
  badges: '/selos',
  results: '/resultado',
  profile: '/perfil',
  settings: '/configuracoes',
  reminder: '/lembrete',
  login: '/entrar',
  account: '/conta',
  ranking: '/ranking',
  challenge: '/desafio',
  /** O link do desafio: abre para qualquer um (aceitar pede conta). */
  challengeCode: '/desafio/:codigo',
} as const;

/** Onde a conta é pedida (GuestPrompt): ranking, desafio ou usar em outro aparelho. Nunca no meio de uma música. */
export type AccountReason = 'ranking' | 'desafio' | 'aparelho';

const ACCOUNT_REASONS: readonly AccountReason[] = ['ranking', 'desafio', 'aparelho'];

/** `next`: para onde ir com a conta criada (e para onde o link do e-mail volta). `back`: o "Agora não". */
export function accountUrl(reason: AccountReason, next: string, back: string = next): string {
  return `${ROUTES.account}?${new URLSearchParams({ motivo: reason, depois: next, voltar: back })}`;
}

export function parseAccountUrl(search: URLSearchParams): { reason: AccountReason; next: string; back: string } {
  const raw = search.get('motivo');
  const reason = ACCOUNT_REASONS.find((r) => r === raw) ?? 'aparelho';
  const next = safeInternalPath(search.get('depois'), ROUTES.home);
  return { reason, next, back: safeInternalPath(search.get('voltar'), next) };
}

/**
 * Telas que ouvem o violino; em qualquer outra (Início, Biblioteca, Configurações…) o microfone fica fechado.
 * Do "Tocar" (afinar) até sair do resultado ele segue aberto; a pausa é sobreposição dentro de /jogo.
 */
export const MIC_ROUTES: ReadonlySet<string> = new Set([
  ROUTES.mic,
  ROUTES.strings,
  ROUTES.micTrouble,
  ROUTES.countdown,
  ROUTES.calibration,
  ROUTES.game,
  ROUTES.sheet,
  ROUTES.strings3d,
  ROUTES.practice,
  ROUTES.gameOver,
  ROUTES.badge,
  ROUTES.results,
  ROUTES.dictation,
]);

export function needsMicrophone(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return MIC_ROUTES.has(path);
}

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
