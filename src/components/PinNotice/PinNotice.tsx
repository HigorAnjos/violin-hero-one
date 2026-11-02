import React from 'react';
import styled from 'styled-components';
import { Button } from '../Button/Button';
import { Kicker } from '../Screen/Screen';

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-color: ${({ theme }) => theme.colors.overlay};
`;

const Box = styled.div`
  width: min(26rem, 100%);
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.warning.main};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.card};
  color: ${({ theme }) => theme.colors.text};

  h2 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.25rem;
    line-height: 1.6rem;
    overflow-wrap: anywhere;
  }

  p {
    font-size: 0.875rem;
    line-height: 1.25rem;
  }

  @media (max-height: 500px) {
    gap: 0.375rem;
    padding: 0.75rem 1rem;

    h2 {
      font-size: 1.0625rem;
      line-height: 1.375rem;
    }
  }
`;

const Pin = styled.output`
  align-self: flex-start;
  padding: 0.25rem 0.875rem;
  border: 2px dashed ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 2.5rem;
  line-height: 1.2;
  letter-spacing: 0.3em;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.info.text};

  @media (max-height: 500px) {
    font-size: 1.75rem;
  }
`;

const Warning = styled.p`
  color: ${({ theme }) => theme.colors.warning.text};
  font-weight: 700;
`;

/**
 * O PIN do aluno, mostrado uma vez só (o banco guarda o hash): na hora do cadastro e quando o professor redefine.
 * Fica na frente de tudo até o professor confirmar que anotou.
 */
export const PinNotice: React.FC<{ name: string; pin: string; reset?: boolean; onClose: () => void }> = ({ name, pin, reset = false, onClose }) => {
  const ok = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  React.useEffect(() => ok.current?.focus(), []);
  return (
    <Backdrop>
      <Box role="alertdialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <Kicker>{reset ? 'PIN novo' : 'Aluno cadastrado'}</Kicker>
        <h2 id={titleId}>PIN de {name}</h2>
        <Pin aria-label={`PIN ${pin.split('').join(' ')}`}>{pin}</Pin>
        <Warning>Anote agora: este PIN não aparece de novo.</Warning>
        <p>O aluno entra com o código da turma, o nome como você escreveu e este PIN. Se perder, use “Redefinir PIN”.</p>
        <Button ref={ok} type="button" onClick={onClose}>
          Anotei o PIN
        </Button>
      </Box>
    </Backdrop>
  );
};
