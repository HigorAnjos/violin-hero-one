import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { CornerLinks } from './CornerLinks';

it('Configurações usa uma engrenagem com contorno dentado', () => {
  renderScreen(<CornerLinks />);
  const link = screen.getByRole('link', { name: 'Configurações' });
  expect(link).toHaveAttribute('href', '/configuracoes');
  expect(link.querySelector('title')).toHaveTextContent('Engrenagem');
  expect(link.querySelector('path')?.getAttribute('d')).toMatchInlineSnapshot(`"M9 2h6l.5 3 1.5.9 2.9-1 3 5.2-2.4 2v1.8l2.4 2-3 5.2-2.9-1-1.5.9-.5 3H9l-.5-3-1.5-.9-2.9 1-3-5.2 2.4-2v-1.8l-2.4-2 3-5.2 2.9 1L8.5 5Z"`);
});
