import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { MenuLink } from './MenuLink';

describe('MenuLink', () => {
  it('link com rótulo e detalhe no nome, e navega', async () => {
    renderScreen(<MenuLink to="/biblioteca" label="Biblioteca" detail="10" />);
    const link = screen.getByRole('link', { name: 'Biblioteca 10' });
    await userEvent.click(link);
    expect(screen.getByTestId('location')).toHaveTextContent('/biblioteca');
  });

  it('sem detalhe, só o rótulo', () => {
    renderScreen(<MenuLink to="/afinar" label="Afinar" primary />);
    expect(screen.getByRole('link', { name: 'Afinar' })).toBeInTheDocument();
  });
});
