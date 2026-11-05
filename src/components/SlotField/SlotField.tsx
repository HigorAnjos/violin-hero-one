import React from 'react';
import styled, { css } from 'styled-components';
import { portrait } from '../../assets/styles/media';

const Field = styled.div`
  position: relative;
  display: flex;
  gap: 0.625rem;
  align-self: flex-start;
  border-radius: ${({ theme }) => theme.borderRadius.md};

  /* O campo de verdade fica por cima das casas, transparente: o foco aparece no grupo todo */
  &:focus-within {
    outline: 3px solid ${({ theme }) => theme.colors.primary.main};
    outline-offset: 4px;
  }

  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    border: 0;
    font-size: 1rem;
    cursor: text;
  }

  @media (max-height: 500px) {
    gap: 0.375rem;
  }

  /* Em pé: as casas dividem a largura da coluna, até o tamanho do desktop */
  ${portrait} {
    align-self: stretch;
    gap: 0.25rem;
  }
`;

const Slot = styled.span<{ $filled: boolean; $current: boolean; $gapAfter: boolean; $size: 'lg' | 'md' }>`
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: ${({ $size }) => ($size === 'lg' ? '4.75rem' : '3.875rem')};
  height: 4.75rem;
  margin-right: ${({ $gapAfter }) => ($gapAfter ? '0.875rem' : '0')};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 2.375rem;
  line-height: 1;
  color: ${({ theme }) => theme.colors.text};

  ${({ theme, $filled, $current }) =>
    $filled
      ? css`
          background-color: ${theme.colors.surface};
          border: 2.5px solid ${theme.colors.text};
          box-shadow: 0 4px 0 ${theme.colors.text};
        `
      : css`
          background-color: transparent;
          border: 2.5px dashed ${$current ? theme.colors.text : theme.colors.surfaceBorder};
        `}

  @media (max-height: 500px) {
    width: 2.75rem;
    height: 2.75rem;
    margin-right: ${({ $gapAfter }) => ($gapAfter ? '0.5rem' : '0')};
    font-size: 1.375rem;
    box-shadow: none;
  }

  ${portrait} {
    flex: 1 1 0;
    min-width: 0;
    width: auto;
    max-width: ${({ $size }) => ($size === 'lg' ? '4.75rem' : '3.875rem')};
    height: 3.5rem;
    margin-right: ${({ $gapAfter }) => ($gapAfter ? '0.5rem' : '0')};
    font-size: 1.75rem;
  }
`;

interface Props {
  id: string;
  /** Quantas casas (8 no código da turma, 4 no PIN). */
  length: number;
  value: string;
  onChange(value: string): void;
  /** Limpa o que foi digitado (só o que o campo aceita). */
  clean(raw: string): string;
  /** PIN: as casas mostram ● e o campo é de senha. */
  secret?: boolean;
  /** Espaço depois desta casa (o hífen do código: ABCD-EFGH). */
  gapAfter?: number;
  inputMode?: 'numeric' | 'text';
  size?: 'lg' | 'md';
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Casas grandes do design (.vh-code / .vh-slot): um campo de verdade, transparente por cima delas, recebe teclado,
 * colar e leitor de tela; as casas só mostram o que ele tem e onde entra o próximo símbolo.
 */
export const SlotField: React.FC<Props> = ({ id, length, value, onChange, clean, secret, gapAfter, inputMode = secret ? 'numeric' : 'text', size = 'md', invalid = false, describedBy, autoFocus, inputRef }) => {
  const [focused, setFocused] = React.useState(false);
  return (
    <Field>
      {Array.from({ length }, (_, i) => (
        <Slot key={i} aria-hidden="true" $filled={i < value.length} $current={focused && i === value.length} $gapAfter={gapAfter === i + 1} $size={size}>
          {i < value.length ? (secret ? '●' : value[i]) : ''}
        </Slot>
      ))}
      <input
        id={id}
        ref={inputRef}
        type={secret ? 'password' : 'text'}
        inputMode={inputMode}
        autoComplete="off"
        autoCapitalize={secret ? 'off' : 'characters'}
        spellCheck={false}
        maxLength={length + (gapAfter ? 1 : 0)}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        onChange={(event) => onChange(clean(event.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </Field>
  );
};
