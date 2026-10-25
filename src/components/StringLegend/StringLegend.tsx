import React from 'react';
import styled from 'styled-components';
import type { StringName } from '../../assets/styles/themes';
import { STRING_LETTERS, STRING_SOLFEGE } from '../../game/notation/violin';

const List = styled.ul`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Item = styled.li<{ $string: StringName }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  min-width: 0;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-left: 0.375rem solid ${({ theme, $string }) => theme.game.strings[$string].main};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const Note = styled.span<{ $string: StringName }>`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  border: 2px solid ${({ theme }) => theme.colors.text};
  background-color: ${({ theme, $string }) => theme.game.strings[$string].main};
  color: ${({ theme, $string }) => theme.game.strings[$string].text};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 1.25rem;
  line-height: 1;
`;

const Name = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 1.25rem;
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/** As quatro cordas soltas, da mais grave para a mais aguda: cor, letra e nome juntos. */
export const StringLegend: React.FC<{ label?: string }> = ({ label = 'Cordas do violino' }) => (
  <List aria-label={label}>
    {STRING_LETTERS.map((letter, i) => (
      <Item key={letter} $string={letter} aria-label={`${STRING_SOLFEGE[i]} (${letter})`}>
        <Note $string={letter} aria-hidden="true" data-testid={`string-note-${letter}`}>
          {letter}
        </Note>
        <Name aria-hidden="true">{STRING_SOLFEGE[i]}</Name>
      </Item>
    ))}
  </List>
);
