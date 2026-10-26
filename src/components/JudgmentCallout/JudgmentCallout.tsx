import React from 'react';
import styled, { keyframes, useTheme } from 'styled-components';
import { feedbackLabel } from '../../game/render/present';
import type { Callout } from '../../shell/useGame';

const pop = keyframes`
  0% { opacity: 0; transform: scale(0.9); }
  20% { opacity: 1; transform: scale(1.08); }
  45% { transform: scale(1); }
  100% { opacity: 1; transform: scale(1); }
`;

const Box = styled.div`
  position: absolute;
  display: flex;
  align-items: baseline;
  gap: 0.875rem;
  pointer-events: none;

  b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.875rem;
    line-height: 1;
    animation: ${pop} 0.3s ease-out;
  }

  span {
    font-size: 1.125rem;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (prefers-reduced-motion: reduce) {
    b {
      animation: none;
    }
  }

  @media (max-height: 500px) {
    gap: 0.5rem;

    b {
      font-size: 1.25rem;
    }

    span {
      font-size: 0.8125rem;
    }
  }
`;

/** O julgamento grande da 5b com o combo, em fila (cada um fica ao menos 250 ms). */
export const JudgmentCallout: React.FC<{ callout: Callout | null; className?: string }> = ({ callout, className }) => {
  const theme = useTheme();
  return (
    <Box className={className} aria-hidden="true">
      {callout && (
        <>
          <b key={callout.serial} data-judgment={callout.judgment} style={{ color: theme.game.judgments[callout.judgment] }}>
            {feedbackLabel(callout.judgment)}
          </b>
          {callout.combo > 1 && <span>COMBO {callout.combo}</span>}
        </>
      )}
    </Box>
  );
};
