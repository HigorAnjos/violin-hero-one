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

/** O troféu do ranking, no âmbar do design. */
const Trophy = styled.svg`
  color: ${({ theme }) => theme.colors.warning.text};
`;

/** Os botões redondos do canto da tela inicial (Main.dc): Ranking, Configurações e Perfil, com o bicho do jogador. */
export const CornerLinks: React.FC = () => {
  const [animal] = React.useState(() => loadLocalProfile().animal ?? null);
  return (
    <>
      <Round to={ROUTES.ranking} aria-label="Ranking">
        <Trophy width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M7 4h10v5a5 5 0 0 1 -10 0z M7 6H3v2a4 4 0 0 0 4 4 M17 6h4v2a4 4 0 0 1 -4 4 M12 14v4 M8 21h8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Trophy>
      </Round>
      <Round to={ROUTES.settings} aria-label="Configurações">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
          <title>Engrenagem</title>
          <path d="M9 2h6l.5 3 1.5.9 2.9-1 3 5.2-2.4 2v1.8l2.4 2-3 5.2-2.9-1-1.5.9-.5 3H9l-.5-3-1.5-.9-2.9 1-3-5.2 2.4-2v-1.8l-2.4-2 3-5.2 2.9 1L8.5 5Z" transform="translate(1 0) scale(.92)" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </Round>
      <Round to={ROUTES.profile} aria-label="Perfil" data-avatar="" data-animal={animal ? '' : undefined}>
        <span aria-hidden="true">{animal ? ANIMAL_LOOK[animal].emoji : 'VH'}</span>
      </Round>
    </>
  );
};
