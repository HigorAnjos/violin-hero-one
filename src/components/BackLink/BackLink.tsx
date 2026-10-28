import { Link } from 'react-router-dom';
import styled, { css } from 'styled-components';
import { Button } from '../Button/Button';
import { Screen } from '../Screen/Screen';

/** Recuos comuns das telas com retorno: 48/32 px no desktop, 16/12 px no celular. */
export const navigationPageInsets = css`
  padding: 2rem 3rem;
  @media (max-height: 500px) {
    padding: 0.75rem max(1rem, env(safe-area-inset-right)) 0.75rem max(1rem, env(safe-area-inset-left));
  }
`;

export const NavigationScreen = styled(Screen)`${navigationPageInsets}`;

const ReturnButton = styled(Button)`
  align-self: flex-start;
`;

/** Primeiro nível volta ao Menu; telas filhas nomeiam e abrem sua mãe, sempre no cabeçalho à direita. */
export const BackLink = ({ to = '/', label = 'Menu' }: { to?: string; label?: string }) => (
  <ReturnButton as={Link} to={to} $variant="ghost" data-back="">
    <span aria-hidden="true">◂</span>{label}
  </ReturnButton>
);
