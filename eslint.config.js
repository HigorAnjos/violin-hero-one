import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // Motor do jogo: TypeScript puro. Nada de React nem das telas (regra do Revisor).
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react-dom/*', 'react-router-dom', 'styled-components', '@tanstack/*'], message: 'src/game/ não importa React nem bibliotecas de tela.' },
            { group: ['**/pages/**', '**/components/**', '**/shell/**', '**/services/**'], message: 'src/game/ não depende da interface nem dos serviços.' },
          ],
        },
      ],
    },
  },
);
