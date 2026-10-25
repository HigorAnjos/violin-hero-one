import styled from 'styled-components';

/**
 * Moldura das telas cheias: ocupa a janela, centra o conteúdo até 1280 px e aperta tudo no
 * celular deitado (altura até 500 px), onde a página pode rolar em vez de cortar.
 */
export const Screen = styled.main<{ $gap?: string }>`
  width: 100%;
  max-width: 80rem;
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: ${({ $gap = '1.375rem' }) => $gap};
  padding: clamp(1rem, 4.5vh, 2.25rem) clamp(1rem, 5.6vw, 4.5rem) clamp(1rem, 4vh, 1.875rem);

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.sm};
    padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.lg}`};
    padding-left: max(${({ theme }) => theme.spacing.lg}, env(safe-area-inset-left));
    padding-right: max(${({ theme }) => theme.spacing.lg}, env(safe-area-inset-right));
  }
`;

/** Marca do jogo no topo das telas da primeira vez. */
export const Brand = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 500;
  font-size: 1.25rem;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;

  span {
    color: ${({ theme }) => theme.game.strings.A.main};
  }
`;

/** A margem negativa devolve o que os links de 44 px de toque crescem além do texto do design. */
export const ScreenHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  margin: -0.625rem 0;
`;

export const ScreenTitle = styled.h1<{ $size?: 'lg' | 'md' }>`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: ${({ $size = 'md' }) => ($size === 'lg' ? '2.5rem' : '1.875rem')};
  line-height: ${({ $size = 'md' }) => ($size === 'lg' ? 1.05 : 1.27)};
  color: ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    font-size: 1.5rem;
    line-height: 1.15;
  }
`;

export const Lead = styled.p<{ $size?: 'lg' | 'md' }>`
  font-size: ${({ $size = 'md' }) => ($size === 'lg' ? '1.0625rem' : '1rem')};
  line-height: 1.5rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    font-size: 0.875rem;
    line-height: 1.25rem;
  }
`;

/** Rótulo em caixa alta (.ns-label do design). */
export const Kicker = styled.span`
  font-weight: 600;
  font-size: 0.75rem;
  line-height: 1rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;
