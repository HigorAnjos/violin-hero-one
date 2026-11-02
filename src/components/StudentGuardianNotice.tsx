import { Link } from 'react-router-dom';
import { Button } from './Button/Button';
import { ROUTES } from '../shell/routes';

/** Não oferece vincular identidade adulta ao usuário provisionado para uma criança. */
export function StudentGuardianNotice() {
  return <section aria-label="Conta de aluno">
    <h1>Esta é uma conta de aluno</h1>
    <p>Conta de aluno não acompanha; o responsável entra com a conta dele.</p>
    <p>Em Configurações › Conta, saia da conta do aluno antes de entrar como responsável.</p>
    <Button as={Link} to={`${ROUTES.settings}?secao=conta`} $variant="ghost">Abrir configurações de conta</Button>
  </section>;
}
