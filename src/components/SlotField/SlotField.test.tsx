import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { SlotField } from './SlotField';
import { cleanClassCode, cleanPin, formatClassCode, pressPinKey } from './slots';

const Code: React.FC<{ secret?: boolean }> = ({ secret }) => {
  const [value, setValue] = React.useState('');
  return (
    <>
      <label htmlFor="campo">Campo</label>
      <SlotField id="campo" length={secret ? 4 : 8} gapAfter={secret ? undefined : 4} value={value} onChange={setValue} clean={secret ? cleanPin : cleanClassCode} secret={secret} />
      <output>{value}</output>
    </>
  );
};

describe('código da turma e PIN', () => {
  it('o código aceita com ou sem hífen, minúscula e espaço, e só os símbolos que o código tem', () => {
    expect(cleanClassCode(' adgk-nrux ')).toBe('ADGKNRUX');
    expect(cleanClassCode('AB0O1I-CD')).toBe('ABCD');
    expect(cleanClassCode('ADGKNRUXZZ')).toBe('ADGKNRUX');
    expect(formatClassCode('adgknrux')).toBe('ADGK-NRUX');
    expect(formatClassCode('ADG')).toBe('ADG');
  });

  it('o PIN guarda só 4 dígitos; apagar e limpar', () => {
    expect(cleanPin('12a345')).toBe('1234');
    expect(pressPinKey('12', '3')).toBe('123');
    expect(pressPinKey('1234', '5')).toBe('1234');
    expect(pressPinKey('123', 'apagar')).toBe('12');
    expect(pressPinKey('123', 'limpar')).toBe('');
  });

  it('digitar e colar no campo preenche as casas', async () => {
    renderScreen(<Code />);
    await userEvent.type(screen.getByLabelText('Campo'), 'adgk-nr');
    expect(screen.getByRole('status')).toHaveTextContent('ADGKNR');
    await userEvent.clear(screen.getByLabelText('Campo'));
    await userEvent.click(screen.getByLabelText('Campo'));
    await userEvent.paste('ADGK-NRUX');
    expect(screen.getByRole('status')).toHaveTextContent('ADGKNRUX');
    expect(screen.getAllByText(/^[A-Z]$/)).toHaveLength(8);
  });

  it('o PIN é campo de senha numérico e as casas mostram bolinhas, nunca os dígitos', async () => {
    renderScreen(<Code secret />);
    const field = screen.getByLabelText('Campo');
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    await userEvent.type(field, '12');
    expect(screen.getAllByText('●')).toHaveLength(2);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });
});
