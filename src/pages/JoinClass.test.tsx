import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../shell/testing';
import { JoinClass } from './JoinClass';

const open = (path = '/turma') => renderScreen(<JoinClass />, { path, route: '/turma' });

describe('JoinClass (A1)', () => {
  it('o link do professor já traz o código; continuar leva ao nome e PIN com ele', async () => {
    open('/turma?codigo=adgk-nrux');
    expect(screen.getByLabelText('Código da turma')).toHaveValue('ADGKNRUX');
    await userEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/turma/entrar?codigo=ADGK-NRUX');
  });

  it('código incompleto avisa e NÃO segue', async () => {
    open();
    await userEvent.type(screen.getByLabelText('Código da turma'), 'ADG');
    await userEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Faltam letras no código: ele tem 8.');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/turma$/);
    expect(screen.getByLabelText('Código da turma')).toHaveFocus();
  });

  it('diz o que o professor vê e o que ele NÃO vê; agora não volta ao menu', () => {
    open();
    const panel = screen.getByRole('complementary', { name: 'O que o professor vai ver' });
    expect(within(panel).getAllByLabelText('Vê:')).toHaveLength(4);
    expect(within(panel).getByText('Gravações que você não enviou').previousSibling).toHaveAccessibleName('Não vê:');
    expect(within(panel).getByText('Músicas que você importou ou escreveu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agora não' })).toHaveAttribute('href', '/');
  });
});
