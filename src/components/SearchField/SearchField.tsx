import React from 'react';
import styled, { useTheme } from 'styled-components';

const Field = styled.label`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
  padding: 0 0.875rem;
  background-color: ${({ theme }) => theme.colors.surfaceHover};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 3px;
  cursor: text;

  &:focus-within {
    outline: 3px solid ${({ theme }) => theme.colors.primary.main};
    outline-offset: 2px;
  }

  input {
    flex: 1;
    min-height: 2.75rem;
    min-width: 0;
    background: transparent;
    border: 0;
    font-size: 0.875rem;
    line-height: 1.25rem;
    outline: none;

    &::placeholder {
      color: ${({ theme }) => theme.colors.textMuted};
    }
  }
`;

/** Busca por título ou compositor; o rótulo fica para o leitor de tela, o placeholder para quem vê. */
export const SearchField: React.FC<{ label: string; value: string; onChange: (value: string) => void; className?: string }> = ({
  label,
  value,
  onChange,
  className,
}) => {
  const { colors } = useTheme();
  return (
    <Field className={className}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke={colors.textMuted} strokeWidth="2.2" />
        <path d="M15.5 15.5 21 21" stroke={colors.textMuted} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
      <input type="search" value={value} placeholder="Buscar música ou compositor" onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
};

/** Sem acento e sem caixa: "frere" acha "Frère Jacques". */
export function matchesSearch(query: string, ...fields: string[]): boolean {
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const q = fold(query.trim());
  return !q || fields.some((f) => fold(f).includes(q));
}
