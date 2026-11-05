import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { portrait, portraitScroll } from '../assets/styles/media';
import { BackLink } from '../components/BackLink/BackLink';
import { Button } from '../components/Button/Button';
import { Kicker } from '../components/Screen/Screen';
import { SlotField } from '../components/SlotField/SlotField';
import { cleanClassCode, formatClassCode } from '../components/SlotField/slots';
import { classLoginUrl, ROUTES } from '../shell/routes';

export const Page = styled.main`
  height: 100vh;
  height: 100dvh;
  max-width: 80rem;
  margin: 0 auto;
  box-sizing: border-box;
  display: flex;
  gap: 3.5rem;
  padding: 2.5rem 4.5rem;
  overflow: hidden;
  color: ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    gap: 1rem;
    padding: 0.625rem max(1rem, env(safe-area-inset-right)) 0.625rem max(1rem, env(safe-area-inset-left));
  }

  /* Em pé: o formulário e, embaixo, o que o professor vê */
  ${portraitScroll}
  ${portrait} {
    flex-direction: column;
    gap: 1.5rem;
  }
`;

const Main = styled.form`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1.375rem;

  @media (max-height: 500px) {
    gap: 0.5rem;
  }

  ${portrait} {
    flex: none;
    gap: 1rem;
  }
`;

const Heading = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 2.75rem;
    line-height: 1.05;
  }

  p {
    max-width: 32.5rem;
    font-size: 1.0625rem;
    line-height: 1.5625rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    gap: 0.25rem;

    h1 {
      font-size: 1.5rem;
    }

    p {
      font-size: 0.8125rem;
      line-height: 1.125rem;
    }
  }

  ${portrait} {
    h1 {
      font-size: 2rem;
    }

    p {
      font-size: 0.9375rem;
      line-height: 1.375rem;
    }
  }
`;

const CodeBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;

  label {
    font-weight: 600;
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  small {
    font-size: 0.8125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    gap: 0.375rem;

    small {
      font-size: 0.75rem;
    }
  }
`;

const Alert = styled.p`
  font-size: 0.875rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.danger.text};
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: auto;
`;

/** .ns-panel do design: o que o professor vê do aluno. */
const Aside = styled.aside`
  width: 26.25rem;
  flex: none;
  align-self: center;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 1.375rem 1.5rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.card};

  @media (max-height: 500px) {
    width: 20rem;
    gap: 0.375rem;
    padding: 0.625rem 0.875rem;
  }

  ${portrait} {
    width: auto;
    align-self: stretch;
    padding: 1rem;
  }
`;

const Seen = styled.ul`
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5625rem 0;
    border-bottom: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    font-size: 0.9375rem;
    line-height: 1.25rem;
  }

  li:last-child {
    border-bottom: 0;
  }

  i {
    width: 1.375rem;
    flex: none;
    text-align: center;
    font-style: normal;
    font-weight: 800;
  }

  i[data-yes] {
    color: ${({ theme }) => theme.colors.info.text};
  }

  i[data-no] {
    color: ${({ theme }) => theme.colors.danger.text};
  }

  @media (max-height: 500px) {
    li {
      padding: 0.125rem 0;
      font-size: 0.75rem;
      line-height: 1rem;
    }
  }
`;

const Note = styled.p`
  display: flex;
  gap: 0.625rem;
  padding: 0.75rem;
  background-color: ${({ theme }) => theme.colors.background};
  border: 1px dashed ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    display: none;
  }
`;

/** O que o professor da turma enxerga (get_student_progress e a entrega), e o que nunca sai do aparelho do aluno. */
const SEEN: readonly [boolean, React.ReactNode][] = [
  [true, 'Tarefas que ele passou: pontos, precisão e afinação'],
  [true, <>Gravação das tarefas que você <b>enviar</b></>],
  [true, 'Minutos de prática na semana e a sequência de dias'],
  [true, 'Recordes e partidas nas músicas do catálogo'],
  [false, 'Músicas que você importou ou escreveu'],
  [false, 'Gravações que você não enviou'],
];

export const TeacherSees: React.FC = () => (
  <Aside aria-labelledby="professor-ve">
    <Kicker id="professor-ve">O que o professor vai ver</Kicker>
    <Seen>
      {SEEN.map(([yes, text], i) => (
        <li key={i}>
          {yes ? (
            <i data-yes="" aria-label="Vê:">✓</i>
          ) : (
            <i data-no="" aria-label="Não vê:">✕</i>
          )}
          <span>{text}</span>
        </li>
      ))}
    </Seen>
    <Note>
      <span aria-hidden="true">👪</span>
      <span>Seu nome só aparece para a turma. No ranking e nos desafios a conta da turma não entra. Seu responsável pode acompanhar com um convite do professor.</span>
    </Note>
  </Aside>
);

/** A1 · Aluno: quem chega pelo código (ou pelo link) do professor. Na próxima tela, o nome e o PIN. */
export const JoinClass: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = React.useState(() => cleanClassCode(params.get('codigo') ?? ''));
  const [error, setError] = React.useState(false);
  const field = React.useRef<HTMLInputElement>(null);

  const go = (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length < 8) {
      setError(true);
      field.current?.focus();
      return;
    }
    navigate(classLoginUrl(formatClassCode(code)));
  };

  return (
    <Page>
      <Main onSubmit={go} noValidate aria-labelledby="entrar-turma">
        <BackLink />
        <Heading>
          <Kicker>Aluno</Kicker>
          <h1 id="entrar-turma">Entrar na turma do seu professor</h1>
          <p>Seu professor passa um código de 8 letras e números (ou um link). Com ele, as tarefas aparecem direto na sua tela inicial.</p>
        </Heading>
        <CodeBlock>
          <label htmlFor="codigo-turma">Código da turma</label>
          <SlotField
            id="codigo-turma"
            inputRef={field}
            length={8}
            gapAfter={4}
            value={code}
            clean={cleanClassCode}
            onChange={(next) => {
              setCode(next);
              setError(false);
            }}
            invalid={error}
            describedBy="codigo-dica"
            autoFocus={!code}
          />
          <small id="codigo-dica">Com ou sem o tracinho: ABCD-EFGH ou ABCDEFGH.</small>
        </CodeBlock>
        {error && <Alert role="alert">Faltam letras no código: ele tem 8.</Alert>}
        <Actions>
          <Button type="submit">
            Continuar <span aria-hidden="true">▸</span>
          </Button>
          <Button as={Link} to={ROUTES.home} $variant="ghost">
            Agora não
          </Button>
        </Actions>
      </Main>
      <TeacherSees />
    </Page>
  );
};
