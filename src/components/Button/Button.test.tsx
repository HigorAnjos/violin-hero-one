import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { Button } from './Button';

describe('Button', () => {
  it('é um botão comum, que pode ser desativado', async () => {
    const onClick = vi.fn();
    renderScreen(
      <Button type="button" disabled onClick={onClick}>
        Continuar
      </Button>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('vira link de rota sem perder o estilo', async () => {
    renderScreen(
      <Button as={Link} to="/destino" $variant="ghost">
        Voltar
      </Button>
    );
    await userEvent.click(screen.getByRole('link', { name: 'Voltar' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/destino');
  });
});
