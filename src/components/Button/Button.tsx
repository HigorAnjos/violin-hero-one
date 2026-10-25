import styled, { css } from 'styled-components';

export type ButtonVariant = 'primary' | 'ghost' | 'link';

/**
 * Botão do design (.ns-btn): primário magenta com degrau embaixo, fantasma de borda clara e link
 * ciano. Vira link de rota com `as={Link}`; a área de toque nunca fica abaixo de 44 px.
 */
export const Button = styled.button<{ $variant?: ButtonVariant }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  min-height: 2.75rem;
  min-width: 2.75rem;
  font-family: ${({ theme }) => theme.fonts.ui};
  font-weight: 800;
  font-size: 1rem;
  line-height: 1.2;
  text-decoration: none;
  white-space: nowrap;
  transition:
    transform 0.08s,
    box-shadow 0.08s,
    border-color 0.12s,
    color 0.12s;

  ${({ theme, $variant = 'primary' }) => {
    if ($variant === 'link') {
      return css`
        padding: 0 ${theme.spacing.xxs};
        font-size: 0.875rem;
        font-weight: 700;
        color: ${theme.colors.info.text};

        @media (hover: hover) {
          &:hover {
            color: ${theme.colors.text};
          }
        }
      `;
    }
    const ghost = $variant === 'ghost';
    return css`
      padding: 0 1.5rem;
      font-size: 0.8125rem;
      text-transform: uppercase;
      border: 2px solid ${ghost ? theme.colors.surfaceBorder : theme.colors.primary.main};
      border-radius: ${theme.borderRadius.sm};
      letter-spacing: 0.06em;
      background-color: ${ghost ? 'transparent' : theme.colors.primary.main};
      color: ${ghost ? theme.colors.textMuted : theme.colors.primary.text};
      box-shadow: ${ghost ? 'none' : `0 3px 0 ${theme.colors.primary.hover}`};

      @media (hover: hover) {
        &:hover:not(:disabled) {
          ${ghost
            ? css`
                border-color: ${theme.colors.textMuted};
                color: ${theme.colors.text};
              `
            : css`
                box-shadow: 0 1px 0 ${theme.colors.primary.hover};
              `}
        }
      }

      @media (hover: hover) and (prefers-reduced-motion: no-preference) {
        &:hover:not(:disabled) {
          transform: ${ghost ? 'none' : 'translateY(2px)'};
        }
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.55;
        box-shadow: none;
      }
    `;
  }}
`;
