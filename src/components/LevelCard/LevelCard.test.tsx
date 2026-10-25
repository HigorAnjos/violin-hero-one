import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { PLAYER_LEVELS } from '../../services/profile';
import { renderScreen } from '../../shell/testing';
import { LevelCard } from './LevelCard';

describe('LevelCard', () => {
  it.each(PLAYER_LEVELS)('nível %s: radio com nome e descrição, ilustração escondida do leitor', (level) => {
    const { container } = renderScreen(
      <LevelCard level={level} title="Título" description="Descrição" radio={{ role: 'radio', 'aria-checked': true }} />,
      { theme: palcoTheme }
    );
    const card = screen.getByRole('radio', { name: 'Título' });
    expect(card).toHaveAttribute('aria-checked', 'true');
    expect(card).toHaveAccessibleDescription('Descrição');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('repassa o clique do radiogroup', async () => {
    const onClick = vi.fn();
    renderScreen(<LevelCard level="never" title="Nunca toquei" description="d" radio={{ role: 'radio', onClick }} />);
    await userEvent.click(screen.getByRole('radio'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
