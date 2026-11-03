import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { BackLink } from '../components/BackLink/BackLink';
import { Button } from '../components/Button/Button';
import { PinPad } from '../components/PinPad/PinPad';
import { SlotField } from '../components/SlotField/SlotField';
import { cleanClassCode, cleanPin, formatClassCode } from '../components/SlotField/slots';
import { useSwitchConfirm } from '../components/SwitchConfirm/useSwitchConfirm';
import { ClassroomError } from '../services/classroom';
import { useStudentLogin } from '../shell/classroom';
import { ROUTES } from '../shell/routes';

const Page = styled.main`
  height: 100vh;
  height: 100dvh;
  max-width: 80rem;
  margin: 0 auto;
  box-sizing: border-box;
  padding: 2.125rem 4rem;
  overflow: hidden;
  color: ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    padding: 0.5rem max(1rem, env(safe-area-inset-right)) 0.5rem max(1rem, env(safe-area-inset-left));
  }
`;

const Form = styled.form`
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;

  @media (max-height: 500px) {
    gap: 0.375rem;
  }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: -0.625rem 0;

  > div {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
  }

  @media (max-height: 500px) {
    margin: 0;
  }
`;

/** "Sem e-mail e sem senha de letras", ao lado do retorno; no celular deitado não cabe. */
const HeaderNote = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    display: none;
  }
`;

/** A pílula do código da turma, com o "trocar" que volta ao código. */
const CodeChip = styled.span`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0 0.25rem 0 0.875rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  font-size: 0.875rem;
  font-weight: 800;
  white-space: nowrap;

  span {
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Body = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 2.5rem;

  @media (max-height: 500px) {
    gap: 1rem;
  }
`;

const Section = styled.section<{ $width?: string }>`
  ${({ $width }) => ($width ? `width: ${$width}; flex: none;` : 'flex: 1; min-width: 0;')}
  display: flex;
  flex-direction: column;
  gap: 0.875rem;

  h1,
  h2 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 2.125rem;
    line-height: 1;
  }

  label {
    font-weight: 600;
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    ${({ $width }) => ($width ? 'width: 23rem;' : '')}
    gap: 0.375rem;

    h1,
    h2 {
      font-size: 1.25rem;
    }
  }
`;

const Hint = styled.p`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

/** O nome como o professor cadastrou: campo grande, como as casas do código. */
const NameInput = styled.input`
  box-sizing: border-box;
  width: 100%;
  max-width: 30rem;
  min-height: 4.75rem;
  padding: 0 1.125rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2.5px solid ${({ theme }) => theme.colors.text};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: 0 4px 0 ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 1.75rem;
  color: ${({ theme }) => theme.colors.text};

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary.main};
    outline-offset: 3px;
  }

  @media (max-height: 500px) {
    min-height: 2.75rem;
    font-size: 1.125rem;
    box-shadow: none;
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;

  > span {
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    > span {
      font-size: 0.75rem;
    }
  }
`;

const Alert = styled.p`
  margin-right: auto;
  padding: 0.625rem 0.875rem;
  background-color: ${({ theme }) => theme.colors.danger.surface};
  border: 2px solid ${({ theme }) => theme.colors.danger.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.danger.text};

  @media (max-height: 500px) {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

/** Mensagem neutra por motivo: nunca diz se o que errou foi o código, o nome ou o PIN. */
function loginMessage(error: unknown): string {
  return (error instanceof ClassroomError ? error : new ClassroomError('server')).message;
}

/**
 * A0 · Aluno sem e-mail: código da turma + nome (como o professor cadastrou) + PIN de 4 dígitos. Entrar troca o
 * usuário do aparelho como entrar numa conta: o que o convidado tinha pendente sobe antes, na conta dele.
 */
export const ClassLogin: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const given = cleanClassCode(params.get('codigo') ?? '');
  const [code, setCode] = React.useState(given);
  const [editCode, setEditCode] = React.useState(given.length < 8);
  const [name, setName] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [missing, setMissing] = React.useState(false);
  const login = useStudentLogin();
  const switching = useSwitchConfirm();
  const pinField = React.useRef<HTMLInputElement>(null);
  const nameField = React.useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (login.isPending) return;
    if (code.length < 8 || !name.trim() || pin.length < 4) {
      setMissing(true);
      return;
    }
    setMissing(false);
    if (!(await switching.ask())) return;
    login.mutate(
      { code, name, pin },
      {
        onSuccess: () => navigate(ROUTES.tasks, { replace: true }),
        // Errou: o PIN sai e o foco volta para ele (o nome e o código ficam)
        onError: () => {
          setPin('');
          pinField.current?.focus();
        },
      }
    );
  };

  const error = missing ? 'Preencha o código da turma, o seu nome e os 4 números do PIN.' : login.isError ? loginMessage(login.error) : null;

  return (
    <Page>
      <Form onSubmit={submit} noValidate>
        <Header>
          <div>
            {!editCode && (
              <CodeChip>
                Turma <span>código {formatClassCode(code)} ✓</span>
                <Button type="button" $variant="link" onClick={() => setEditCode(true)}>
                  Trocar
                </Button>
              </CodeChip>
            )}
          </div>
          {/* O retorno fica na ponta direita do cabeçalho, como nas outras telas */}
          <div>
            <HeaderNote>Sem e-mail e sem senha de letras</HeaderNote>
            <BackLink />
          </div>
        </Header>

        <Body>
          <Section aria-labelledby="quem-e-voce">
            <h1 id="quem-e-voce">1. Quem é você?</h1>
            {editCode && (
              <>
                <label htmlFor="codigo-turma">Código da turma</label>
                <SlotField id="codigo-turma" length={8} gapAfter={4} value={code} clean={cleanClassCode} onChange={setCode} autoFocus={!code} />
              </>
            )}
            <label htmlFor="nome-aluno">Seu nome, como o professor cadastrou</label>
            <NameInput
              id="nome-aluno"
              ref={nameField}
              value={name}
              maxLength={60}
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              autoFocus={!editCode}
              onChange={(event) => setName(event.target.value)}
            />
            <Hint>Seu nome não entra? Peça para o professor conferir como cadastrou: acento e maiúscula não contam.</Hint>
          </Section>

          <Section $width="28.75rem" aria-labelledby="seu-pin">
            <h2 id="seu-pin">2. Seu PIN</h2>
            <label htmlFor="pin-aluno">PIN de 4 números</label>
            <SlotField id="pin-aluno" inputRef={pinField} length={4} value={pin} clean={cleanPin} onChange={setPin} secret size="lg" describedBy="pin-dica" />
            <PinPad value={pin} onChange={setPin} controls="pin-aluno" disabled={login.isPending} />
            <Hint id="pin-dica">Esqueceu? O professor cria um PIN novo para você.</Hint>
          </Section>
        </Body>

        <Footer>
          {error ? <Alert role="alert">{error}</Alert> : <span>Neste aparelho você fica conectado: na próxima vez as tarefas já abrem.</span>}
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? 'Entrando…' : 'Entrar'} <span aria-hidden="true">▸</span>
          </Button>
        </Footer>
        {switching.dialog}
      </Form>
    </Page>
  );
};
