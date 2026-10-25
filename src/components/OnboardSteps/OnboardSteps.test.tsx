import { screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { OnboardSteps } from './OnboardSteps';

describe('OnboardSteps', () => {
  it('marca a etapa atual e as feitas', () => {
    renderScreen(<OnboardSteps current={1} />);
    const steps = within(screen.getByRole('list', { name: 'Etapas da primeira vez' })).getAllByRole('listitem').filter((li) => li.textContent);
    expect(steps.map((li) => li.textContent)).toEqual(['✓Microfone (feito)', '2Cordas soltas', '3Primeira música']);
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(steps[0]).not.toHaveAttribute('aria-current');
  });
});
