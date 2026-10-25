import React from 'react';
import styled, { css } from 'styled-components';

export const ONBOARD_STEPS = ['Microfone', 'Cordas soltas', 'Primeira música'] as const;

const List = styled.ol`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

type State = 'done' | 'current' | 'next';

const Step = styled.li<{ $state: State }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-weight: 600;
  font-size: 0.75rem;
  line-height: 1rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ theme, $state }) => ($state === 'current' ? theme.colors.text : theme.colors.textMuted)};
`;

const Mark = styled.span<{ $state: State }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  border: 1.5px solid ${({ theme }) => theme.colors.surfaceBorder};
  font-size: 0.8125rem;
  letter-spacing: 0;
  ${({ theme, $state }) =>
    $state === 'current'
      ? css`
          border-color: ${theme.colors.primary.main};
          color: ${theme.colors.text};
        `
      : $state === 'done'
        ? css`
            border-color: ${theme.colors.info.main};
            color: ${theme.colors.info.text};
          `
        : ''}
`;

const Line = styled.li`
  width: 1.5rem;
  height: 1px;
  background-color: ${({ theme }) => theme.colors.surfaceBorder};

  @media (max-width: 900px) {
    width: 0.75rem;
  }
`;

const Name = styled.span<{ $state: State }>`
  @media (max-width: 900px) {
    ${({ $state }) =>
      $state !== 'current' &&
      css`
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      `}
  }
`;

/** As três etapas da primeira vez. `current` é o índice (0 = Microfone). */
export const OnboardSteps: React.FC<{ current: number }> = ({ current }) => (
  <List aria-label="Etapas da primeira vez">
    {ONBOARD_STEPS.map((name, i) => {
      const state: State = i < current ? 'done' : i === current ? 'current' : 'next';
      return (
        <React.Fragment key={name}>
          {i > 0 && <Line aria-hidden="true" />}
          <Step $state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <Mark $state={state} aria-hidden="true">
              {state === 'done' ? '✓' : i + 1}
            </Mark>
            <Name $state={state}>
              {name}
              {state === 'done' && <span className="sr-only"> (feito)</span>}
            </Name>
          </Step>
        </React.Fragment>
      );
    })}
  </List>
);
