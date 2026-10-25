import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { AvatarPicker } from './AvatarPicker';

describe('AvatarPicker', () => {
  it('três bichos com nome, nenhum marcado de início', () => {
    renderScreen(<AvatarPicker value={null} onChange={vi.fn()} />);
    const options = screen.getAllByRole('radio');
    expect(options.map((o) => o.getAttribute('aria-label'))).toEqual(['Raposa', 'Pinguim', 'Gato']);
    expect(options.every((o) => o.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('escolhe pelo clique', async () => {
    const onChange = vi.fn();
    renderScreen(<AvatarPicker value="fox" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Gato' }));
    expect(onChange).toHaveBeenCalledWith('cat');
  });
});
