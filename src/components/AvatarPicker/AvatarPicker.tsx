import React from 'react';
import styled, { useTheme } from 'styled-components';
import { rgba } from '../../assets/styles/themes/color';
import type { StringName } from '../../assets/styles/themes';
import { ANIMALS, type Animal } from '../../services/profile';
import { useRadioGroup } from '../RadioGroup/useRadioGroup';

export const ANIMAL_LOOK: Record<Animal, { emoji: string; name: string; string: StringName }> = {
  fox: { emoji: '🦊', name: 'Raposa', string: 'E' },
  penguin: { emoji: '🐧', name: 'Pinguim', string: 'A' },
  cat: { emoji: '🐱', name: 'Gato', string: 'G' },
};

const Group = styled.span`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xxs};
`;

const Option = styled.button<{ $tint: string }>`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  border: 3px solid transparent;
  background-color: ${({ $tint }) => $tint};
  font-size: 1.25rem;
  line-height: 1;

  &[aria-checked='true'] {
    border-color: ${({ theme }) => theme.colors.text};
  }
`;

/** Bicho do avatar (opcional): três opções, teclado de radiogroup. */
export const AvatarPicker: React.FC<{ value: Animal | null; onChange: (animal: Animal) => void }> = ({ value, onChange }) => {
  const theme = useTheme();
  const radio = useRadioGroup(ANIMALS, value, onChange);
  return (
    <Group role="radiogroup" aria-label="Avatar">
      {ANIMALS.map((animal) => {
        const look = ANIMAL_LOOK[animal];
        return (
          <Option key={animal} type="button" aria-label={look.name} $tint={rgba(theme.game.strings[look.string].main, 0.16)} {...radio(animal)}>
            <span aria-hidden="true">{look.emoji}</span>
          </Option>
        );
      })}
    </Group>
  );
};
