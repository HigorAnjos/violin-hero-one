import { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  *, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :root {
    /* Controles nativos (scrollbar, campos) no modo do tema */
    color-scheme: ${({ theme }) => theme.mode};
  }

  body {
    background-color: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.text};
    font-family: ${({ theme }) => theme.fonts.ui};
    font-variant-numeric: tabular-nums;
    min-height: 100vh;
    /* Aviso de versão nova no pé da janela (UpdateNotice): as telas de menu encolhem e nada fica embaixo dele */
    padding-bottom: var(--update-notice-space, 0px);
    -webkit-font-smoothing: antialiased;
  }

  ::selection {
    background-color: ${({ theme }) => theme.colors.primary.main};
    color: ${({ theme }) => theme.colors.primary.text};
  }

  :focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary.main};
    outline-offset: 3px;
  }

  button {
    cursor: pointer;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
  }

  input, select, textarea {
    font: inherit;
    color: inherit;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  ul, ol {
    list-style: none;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;
