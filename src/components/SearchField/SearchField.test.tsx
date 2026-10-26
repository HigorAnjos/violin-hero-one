import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { matchesSearch, SearchField } from './SearchField';

const Controlled = () => {
  const [value, setValue] = React.useState('');
  return (
    <>
      <SearchField label="Buscar música" value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  );
};

describe('SearchField', () => {
  it('campo de busca com rótulo para o leitor de tela', async () => {
    renderScreen(<Controlled />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar música' }), 'ode');
    expect(screen.getByRole('status')).toHaveTextContent('ode');
  });

  it('acha sem acento e sem caixa, em qualquer campo', () => {
    expect(matchesSearch('frere', 'Frère Jacques', 'Tradicional')).toBe(true);
    expect(matchesSearch('BEETHOVEN', 'Ode à alegria', 'L. van Beethoven')).toBe(true);
    expect(matchesSearch('  ', 'qualquer')).toBe(true);
    expect(matchesSearch('bach', 'Aleluia', 'Händel')).toBe(false);
  });
});
