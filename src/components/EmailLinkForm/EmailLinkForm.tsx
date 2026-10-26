import React from 'react';
import styled from 'styled-components';
import { AccountError } from '../../services/account';
import { Button } from '../Button/Button';

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
`;

const Row = styled.div`
  display: flex;
  gap: 0.625rem;
  align-items: flex-end;

  > label {
    flex: 1;
  }
`;

/** Campo do design (.vh-field): rótulo em caixa alta em cima, caixa de 44 px. */
const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
  font-weight: 600;
  font-size: 0.75rem;
  line-height: 1rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};

  input {
    min-height: 2.75rem;
    min-width: 0;
    padding: 0 0.875rem;
    background-color: ${({ theme }) => theme.colors.surfaceHover};
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: 3px;
    font-size: 0.9375rem;
    letter-spacing: 0;
    text-transform: none;
    color: ${({ theme }) => theme.colors.text};

    &::placeholder {
      color: ${({ theme }) => theme.colors.textMuted};
    }
  }
`;

const Note = styled.p<{ $tone: 'muted' | 'danger' | 'success' }>`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme, $tone }) => ($tone === 'danger' ? theme.colors.danger.text : $tone === 'success' ? theme.colors.success.text : theme.colors.textMuted)};
`;

export type EmailLinkState = { status: 'idle' } | { status: 'sending' } | { status: 'sent'; email: string } | { status: 'error'; error: AccountError };

/**
 * E-mail para o link mágico. `send` manda o link (criar conta ou entrar); o resultado aparece embaixo, no
 * status (enviado) ou no alerta (erro). `onError` deixa a tela oferecer o próximo passo (ex.: entrar na conta que
 * já tem esse e-mail).
 */
export const EmailLinkForm: React.FC<{
  send: (email: string) => Promise<void>;
  submitLabel: string;
  onError?: (error: AccountError, email: string) => void;
  /** Pergunta antes de mandar (ex.: o progresso do convidado não vai para a conta); false cancela. */
  confirm?: () => Promise<boolean>;
  autoFocus?: boolean;
}> = ({ send, submitLabel, onError, confirm, autoFocus }) => {
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState<EmailLinkState>({ status: 'idle' });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState({ status: 'sending' });
    if (confirm && !(await confirm())) {
      setState({ status: 'idle' });
      return;
    }
    try {
      await send(email);
      setState({ status: 'sent', email: email.trim() });
    } catch (cause) {
      const error = cause instanceof AccountError ? cause : new AccountError('server', cause);
      setState({ status: 'error', error });
      onError?.(error, email);
    }
  };

  return (
    <Form onSubmit={submit} noValidate>
      <Row>
        <Field>
          E-mail
          {/* autoFocus: o campo só aparece depois do clique em "Usar e-mail" */}
          <input type="email" inputMode="email" autoComplete="email" required value={email} placeholder="voce@email.com" autoFocus={autoFocus} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" disabled={state.status === 'sending'}>
          {submitLabel}
        </Button>
      </Row>
      <div role="status">
        {state.status === 'sent' && (
          <Note $tone="success">
            Mandamos um link para {state.email}. Abra o e-mail neste aparelho e toque no link.
          </Note>
        )}
      </div>
      {state.status === 'error' && (
        <Note role="alert" $tone="danger">
          {state.error.message}
        </Note>
      )}
    </Form>
  );
};
