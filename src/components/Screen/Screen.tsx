import styled, { css } from 'styled-components';

/**
 * Corta texto longo (título de música, pontuação) em `lines` linhas com reticências, com qualquer fonte; o texto
 * inteiro segue no DOM para o leitor de tela. O min-width: 0 deixa o item de flex/grid encolher abaixo do conteúdo.
 */
export const clampLines = (lines: number) => css`
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  ${lines === 1
    ? css`
        display: block;
        white-space: nowrap;
        text-overflow: ellipsis;
      `
    : css`
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: ${lines};
        white-space: normal;
      `}
`;

/**
 * Moldura das telas cheias: ocupa a janela, centra o conteúdo até 1280 px e aperta tudo no
 * celular deitado (altura até 500 px), onde a página pode rolar em vez de cortar. Com o aviso de versão nova
 * aparecendo, encolhe no espaço que ele ocupa embaixo.
 */
export const Screen = styled.main<{ $gap?: string }>`
  width: 100%;
  max-width: 80rem;
  min-height: calc(100vh - var(--update-notice-space, 0px));
  min-height: calc(100dvh - var(--update-notice-space, 0px));
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

/** Rótulo com o nome da música: até duas linhas, reticências depois. */
export const SongKicker = styled(Kicker)`
  ${clampLines(2)}
  max-width: 100%;
`;
