import React from 'react';
import styled, { css, keyframes } from 'styled-components';
import type { StringName } from '../../assets/styles/themes';
import { DEFAULT_A4, midiToFrequency, OPEN_STRING_MIDI, STRING_LETTERS, STRING_SOLFEGE, type StringIndex } from '../../game/notation/violin';
import { formatCents, formatHz, HOLD_SECONDS } from './openStringCheck';

export type OpenStringState = 'heard' | 'listening' | 'next';

const NAMES = [`${STRING_SOLFEGE[0]} · a mais grossa`, STRING_SOLFEGE[1], STRING_SOLFEGE[2], `${STRING_SOLFEGE[3]} · a mais fina`];

const vibrate = keyframes`
  from { transform: translateX(-1.5px); }
  to { transform: translateX(1.5px); }
`;

const Card = styled.li<{ $state: OpenStringState }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.875rem;
  min-width: 0;
  padding: 1.375rem 1rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 3px;
  ${({ theme, $state }) =>
    $state === 'listening'
      ? css`
          border-color: ${theme.colors.info.main};
        `
      : $state === 'next'
        ? css`
            border-style: dashed;
          `
        : ''}

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};
    padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.xs}`};
  }
`;

const Letter = styled.span<{ $string: StringName; $state: OpenStringState }>`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 3.5rem;
  line-height: 1;
  color: ${({ theme, $string }) => theme.game.strings[$string].main};
  opacity: ${({ $state }) => ($state === 'next' ? 0.5 : 1)};

  @media (prefers-reduced-motion: no-preference) {
    animation: ${({ $state }) =>
      $state === 'listening'
        ? css`
            ${vibrate} 0.12s linear infinite alternate
          `
        : 'none'};
  }

  @media (max-height: 500px) {
    font-size: 2rem;
  }
`;

const Name = styled.span`
  font-weight: 600;
  font-size: 0.9375rem;
  line-height: 1.25rem;
  text-align: center;
  color: ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    font-size: 0.8125rem;
  }
`;

const Hz = styled.span`
  font-size: 0.875rem;
  line-height: 1rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    display: none;
  }
`;

const Status = styled.span<{ $state: OpenStringState }>`
  font-weight: 600;
  font-size: 0.8125rem;
  line-height: 1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: center;
  color: ${({ theme, $state }) =>
    $state === 'listening' ? theme.colors.info.text : $state === 'heard' ? theme.colors.text : theme.colors.textMuted};

  @media (max-height: 500px) {
    font-size: 0.75rem;
    letter-spacing: 0.03em;
  }
`;

const Hold = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

/** Barra de "segurando" (.ns-bar do design). */
const Bar = styled.div`
  height: 6px;
  background-color: ${({ theme }) => theme.colors.surfaceBorder};
  overflow: hidden;

  i {
    display: block;
    height: 100%;
    background-color: ${({ theme }) => theme.colors.info.main};
  }
`;

function statusText(state: OpenStringState, cents: number | null): string {
  if (state === 'heard') return `✓ Ouvida · ${formatCents(cents ?? 0)}`;
  if (state === 'next') return '○ Próxima';
  return cents === null ? '● Toque agora' : `● Ouvindo · ${formatCents(cents)}`;
}

/** Cartão de uma corda solta no teste da primeira vez: letra e cor juntas, Hz no Lá do jogo. */
export const OpenStringCard: React.FC<{
  string: StringIndex;
  state: OpenStringState;
  cents: number | null;
  heldSeconds?: number;
  a4?: number;
}> = ({ string, state, cents, heldSeconds = 0, a4 = DEFAULT_A4 }) => {
  const letter = STRING_LETTERS[string];
  const percent = Math.min(100, Math.round((heldSeconds / HOLD_SECONDS) * 100));
  const status = statusText(state, cents);
  return (
    <Card $state={state} aria-label={`${STRING_SOLFEGE[string]} (${letter}): ${status.slice(2)}`}>
      <Letter $string={letter} $state={state} aria-hidden="true">
        {letter}
      </Letter>
      <Name aria-hidden="true">{NAMES[string]}</Name>
      <Hz aria-hidden="true">{formatHz(midiToFrequency(OPEN_STRING_MIDI[string], a4))}</Hz>
      {state === 'listening' ? (
        <Hold>
          <Bar role="progressbar" aria-label="Segurando" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <i style={{ width: `${percent}%` }} />
          </Bar>
          <Status $state={state} aria-hidden="true">
            {status}
          </Status>
        </Hold>
      ) : (
        <Status $state={state} aria-hidden="true">
          {status}
        </Status>
      )}
    </Card>
  );
};
