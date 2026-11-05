import React from 'react';
import styled from 'styled-components';

const Root = styled.button`
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 2.75rem;
  padding: 0 0.75rem;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  color: ${({ theme }) => theme.colors.text};
  font-weight: 700;
  font-size: 0.8125rem;
  line-height: 1;
  white-space: nowrap;

  &[aria-pressed='true'] {
    background-color: ${({ theme }) => theme.colors.info.surface};
    border-color: ${({ theme }) => theme.colors.info.main};
    color: ${({ theme }) => theme.colors.info.text};
  }

  svg {
    flex: none;
  }
`;

/** Cinco linhas e uma nota: a pauta. */
const StaffIcon = () => (
  <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.2">
      {[2, 5, 8, 11, 14].map((y) => (
        <line key={y} x1="0" x2="18" y1={y} y2={y} />
      ))}
    </g>
    <ellipse cx="11" cy="9.5" rx="2.6" ry="2" transform="rotate(-20 11 9.5)" fill="currentColor" />
    <line x1="13.4" x2="13.4" y1="9" y2="1" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

/** Uma tela com a faixa de baixo: o painel. */
const PanelIcon = () => (
  <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true">
    <rect x="1" y="1" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <rect x="1" y="10" width="16" height="5" rx="1" fill="currentColor" />
  </svg>
);

export interface StaffToggleProps {
  /** Ligado: a pauta (ou o painel) aparece. */
  pressed: boolean;
  onToggle: (pressed: boolean) => void;
  /** `staff`: a pauta embaixo da pista (Arcade, Cordas 3D); `panel`: o painel embaixo da pauta (Partitura). */
  kind?: 'staff' | 'panel';
  className?: string;
}

const TEXT = {
  staff: { label: 'Pauta', show: 'Mostrar pauta', hide: 'Esconder pauta' },
  panel: { label: 'Painel', show: 'Mostrar painel', hide: 'Esconder painel' },
} as const;

/**
 * Botão Pauta do celular deitado: mostra ou esconde o que fica no pé da tela, perto do Pausar (na Pausa, nos Ajustes
 * rápidos). O nome diz o que o toque faz e o aria-pressed, o estado; não mexe no relógio da partida.
 */
export const StaffToggle: React.FC<StaffToggleProps> = ({ pressed, onToggle, kind = 'staff', className }) => {
  const text = TEXT[kind];
  return (
    <Root type="button" className={className} aria-pressed={pressed} aria-label={pressed ? text.hide : text.show} onClick={() => onToggle(!pressed)}>
      {kind === 'staff' ? <StaffIcon /> : <PanelIcon />}
      <span aria-hidden="true">{text.label}</span>
    </Root>
  );
};
