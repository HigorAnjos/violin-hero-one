import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { PinPad } from './PinPad';

const Pad: React.FC = () => {
  const [pin, setPin] = React.useState('');
  return (
    <>
      <PinPad value={pin} onChange={setPin} controls="pin" />
      <output>{pin}</output>
    </>
  );
};

describe('PinPad', () => {
  it('as teclas escrevem o PIN até 4 dígitos, apagam e limpam', async () => {
    renderScreen(<Pad />);
    const pad = screen.getByRole('group', { name: 'Teclado do PIN' });
    for (const digit of ['2', '0', '2', '6', '9']) await userEvent.click(screen.getByRole('button', { name: digit }));
    expect(screen.getByRole('status')).toHaveTextContent('2026');
    // A quinta não entra, e a tecla segue com o foco
    expect(screen.getByRole('button', { name: '9' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    expect(screen.getByRole('status')).toHaveTextContent('202');
    await userEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(pad.querySelectorAll('button')).toHaveLength(12);
  });
});
