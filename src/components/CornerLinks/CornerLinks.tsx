import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { loadLocalProfile } from '../../services/profile';
import { ROUTES } from '../../shell/routes';
import { ANIMAL_LOOK } from '../AvatarPicker/AvatarPicker';

const Round = styled(Link)`
  flex: none;
  width: 2.75rem;
  height: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 1rem;
  line-height: 1;

  &[data-avatar] {
    border-color: ${({ theme }) => theme.colors.primary.main};
    background-color: ${({ theme }) => theme.colors.primary.main};
    color: ${({ theme }) => theme.colors.primary.text};
  }

  &[data-animal] {
    font-size: 1.25rem;
  }
`;

/** Os botões redondos do canto da tela inicial (Main.dc): Configurações e Perfil, com o bicho do jogador. */
export const CornerLinks: React.FC = () => {
  const [animal] = React.useState(() => loadLocalProfile().animal ?? null);
  return (
    <>
      <Round to={ROUTES.settings} aria-label="Configurações">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </Round>
      <Round to={ROUTES.profile} aria-label="Perfil" data-avatar="" data-animal={animal ? '' : undefined}>
        <span aria-hidden="true">{animal ? ANIMAL_LOOK[animal].emoji : 'VH'}</span>
      </Round>
    </>
  );
};
