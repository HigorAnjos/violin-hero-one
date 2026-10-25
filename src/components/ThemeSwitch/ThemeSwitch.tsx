import React from 'react';
import styled from 'styled-components';
import { THEMES } from '../../assets/styles/themes';
import { useThemeChoice } from '../../shell/ThemeChoice';

const Group = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Option = styled.button`
  min-height: 2.75rem;
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 2px solid ${({ theme }) => theme.colors.text};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.ui};
  font-weight: 800;
  font-size: 0.9375rem;
  box-shadow: 0 0.25rem 0 ${({ theme }) => theme.colors.text};
  transition:
    transform 0.08s,
    box-shadow 0.08s;

  &[aria-pressed='true'] {
    background-color: ${({ theme }) => theme.colors.primary.main};
    color: ${({ theme }) => theme.colors.primary.text};
    box-shadow: 0 0.25rem 0 ${({ theme }) => theme.game.strings.A.main};
  }

  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    &:hover {
      transform: translateY(2px);
      box-shadow: 0 0.125rem 0 ${({ theme }) => theme.colors.text};
    }

    &[aria-pressed='true']:hover {
      box-shadow: 0 0.125rem 0 ${({ theme }) => theme.game.strings.A.main};
    }
  }
`;

/** Troca simples entre os temas do catálogo. O seletor completo (com prévia) chega depois. */
export const ThemeSwitch: React.FC = () => {
  const { theme, setThemeId } = useThemeChoice();
  return (
    <Group role="group" aria-label="Tema">
      {THEMES.map((t) => (
        <Option key={t.id} type="button" aria-pressed={t.id === theme.id} title={t.tagline} onClick={() => setThemeId(t.id)}>
          {t.name}
        </Option>
      ))}
    </Group>
  );
};
