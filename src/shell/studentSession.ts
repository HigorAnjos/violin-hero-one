import type { SessionState } from '../services/session';
import { useSession } from './useAccount';

/**
 * Conta de aluno: entrou pela turma, sem e-mail. Conta com e-mail ou Google sempre tem e-mail na sessão; o e-mail
 * sintético do aluno a sessão não leva (signedIn). Vale sem rede também: o aparelho segue sabendo que é de aluno.
 */
export function isStudentSession(session: SessionState | undefined): boolean {
  return session?.status === 'signed-in' && !session.anonymous && !session.email;
}

/** A conta da sessão é de aluno da turma: fora do ranking e do desafio. */
export function useIsStudent(): boolean {
  return isStudentSession(useSession());
}
