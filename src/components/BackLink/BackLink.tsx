import { Link } from 'react-router-dom';
import { Button } from '../Button/Button';

/** Primeiro nível volta ao Menu; telas filhas nomeiam e abrem sua mãe, sempre no cabeçalho à direita. */
export const BackLink = ({ to = '/', label = 'Menu' }: { to?: string; label?: string }) => (
  <Button as={Link} to={to} $variant="ghost" data-back="">
    <span aria-hidden="true">◂</span>{label}
  </Button>
);
