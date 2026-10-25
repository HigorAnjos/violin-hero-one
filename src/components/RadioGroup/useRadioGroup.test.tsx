import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { useRadioGroup } from './useRadioGroup';

const VALUES = ['a', 'b', 'c'] as const;

const Group: React.FC<{ initial: 'a' | 'b' | 'c' | null }> = ({ initial }) => {
  const [value, setValue] = React.useState(initial);
  const radio = useRadioGroup(VALUES, value, setValue);
  return (
    <div role="radiogroup" aria-label="Letras">
      {VALUES.map((v) => (
        <button key={v} type="button" {...radio(v)}>
          {v}
        </button>
      ))}
    </div>
  );
};

describe('useRadioGroup', () => {
  it('sem escolha, o Tab cai na primeira opção', async () => {
    render(<Group initial={null} />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'a' })).toHaveFocus();
    expect(screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(0);
  });

  it('setas andam, marcam e dão a volta', async () => {
    render(<Group initial="b" />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'b' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'c' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'a' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('radio', { name: 'c' })).toHaveAttribute('aria-checked', 'true');
  });

  it('clique marca', async () => {
    render(<Group initial={null} />);
    await userEvent.click(screen.getByRole('radio', { name: 'c' }));
    expect(screen.getByRole('radio', { name: 'c' })).toHaveAttribute('aria-checked', 'true');
  });
});
