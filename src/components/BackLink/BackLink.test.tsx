import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { BackLink } from './BackLink';

it('mostra a seta e nomeia o Menu ou a mãe explícita', () => {
  const { unmount } = renderScreen(<BackLink />);
  expect(screen.getByRole('link', { name: 'Menu' })).toHaveTextContent('◂Menu');
  expect(screen.getByRole('link')).toHaveAttribute('href', '/');
  unmount();
  renderScreen(<BackLink to="/perfil" label="Perfil" />);
  expect(screen.getByRole('link', { name: 'Perfil' })).toHaveTextContent('◂Perfil');
  expect(screen.getByRole('link')).toHaveAttribute('href', '/perfil');
});
