import React from 'react';
import { ThemeProvider } from 'styled-components';
import { getTheme, THEME_STORAGE_KEY, type Theme } from '../assets/styles/themes';
import { markProfilePending } from '../services/profilePending';

type ThemeChoice = { theme: Theme; setThemeId: (id: string, origin?: 'device' | 'server') => void };

const ThemeChoiceContext = React.createContext<ThemeChoice | null>(null);

/** Escolha salva no aparelho. Sem armazenamento (aba privada, bloqueio): Caderno, sem erro. */
function readStoredId(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Cores fora do React: fundo da página, barra do navegador e o que o script anti-flash já pintou. */
function applyToDocument(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.mode;
  root.style.backgroundColor = theme.colors.background;
  root.style.color = theme.colors.text;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.colors.surface);
}

/** Tema pessoal: troca na hora, sem recarregar, e vai junto no perfil (ProfileSync). */
export const ThemeChoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = React.useState<Theme>(() => getTheme(readStoredId()));

  React.useEffect(() => applyToDocument(theme), [theme]);

  const value = React.useMemo<ThemeChoice>(
    () => ({
      theme,
      setThemeId: (id, origin = 'device') => {
        const next = getTheme(id);
        setTheme(next);
        // Escolha no aparelho sobe para o perfil; a que veio do servidor só é aplicada
        if (origin === 'device') markProfilePending({ theme_id: next.id });
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, next.id);
        } catch {
          // sem armazenamento: vale só para esta visita
        }
      },
    }),
    [theme]
  );

  return (
    <ThemeChoiceContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeChoiceContext.Provider>
  );
};

export function useThemeChoice(): ThemeChoice {
  const ctx = React.useContext(ThemeChoiceContext);
  if (!ctx) throw new Error('useThemeChoice fora do ThemeChoiceProvider');
  return ctx;
}
