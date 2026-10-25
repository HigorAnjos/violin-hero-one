import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { renderScreen } from '../../shell/testing';
import { MicSetupIllustration } from './MicSetupIllustration';

describe('MicSetupIllustration', () => {
  it('descreve a cena para quem não vê a imagem', () => {
    renderScreen(<MicSetupIllustration />, { theme: palcoTheme });
    expect(screen.getByRole('img', { name: 'Violino a cerca de meio metro do microfone do computador' })).toBeInTheDocument();
    expect(screen.getByText('30 a 60 cm')).toBeInTheDocument();
  });
});
