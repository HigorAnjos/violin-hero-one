import { render } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { describe, expect, it } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { avatarString, initials, StudentAvatar } from './StudentAvatar';

describe('StudentAvatar', () => {
  it('iniciais do primeiro nome e cor estável por aluno', () => {
    expect([initials('Ana Luísa'), initials('  bruno '), initials('')]).toEqual(['AN', 'BR', '?']);
    expect(avatarString('aluno-1')).toBe(avatarString('aluno-1'));
  });

  it('é decorativo: o leitor de tela lê o nome escrito ao lado', () => {
    const { container } = render(
      <ThemeProvider theme={cadernoTheme}>
        <StudentAvatar id="a" name="Carla" />
      </ThemeProvider>
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.textContent).toBe('CA');
  });
});
