import React from 'react';
import styled, { useTheme } from 'styled-components';
import { rgba } from '../../assets/styles/themes/color';
import { STRING_LETTERS } from '../../game/notation/violin';
import type { Explanation, HintPart } from './explain';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Chip = styled.span<{ $color: string }>`
  align-self: flex-start;
  padding: 0.4375rem 0.75rem;
  border: 1.5px solid currentColor;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  font-weight: 700;
  font-size: 0.75rem;
  line-height: 1;
  letter-spacing: 0.14em;
  color: ${({ $color }) => $color};
`;

const Rule = styled.div`
  position: relative;
  height: 1rem;
  background-color: ${({ theme }) => theme.game.track};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  i {
    position: absolute;
    top: 0;
    bottom: 0;
  }
`;

const Ends = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Hint = styled.p`
  padding: 0.875rem 1rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: 0.9375rem;
  line-height: 1.375rem;
  color: ${({ theme }) => theme.colors.text};

  b {
    font-weight: 700;
  }

  small {
    display: block;
    margin-top: 0.375rem;
    font-size: 0.75rem;
    line-height: 1rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    padding: ${({ theme }) => `${theme.spacing.xxs} ${theme.spacing.xs}`};
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

/** 5d · Motivo do erro: o chip do julgamento, a régua de tempo ou afinação e a dica de como corrigir. */
export const JudgmentHint: React.FC<{ explanation: Explanation; compact?: boolean; className?: string }> = ({ explanation, compact = false, className }) => {
  const theme = useTheme();
  const { judgment, chip, hint, note, ruler, string, playedString } = explanation;
  const issueColor = theme.colors[judgment === 'miss' ? 'danger' : 'warning'].text;
  const colorOf = (part: HintPart) => {
    if (part.tone === 'target') return theme.game.strings[STRING_LETTERS[string]].main;
    if (part.tone === 'played') return playedString === null ? issueColor : theme.colors.warning.text;
    if (part.tone === 'issue') return theme.colors.warning.text;
    return undefined;
  };
  return (
    <Wrap className={className} role="status" aria-live="polite">
      <Chip $color={issueColor}>{chip}</Chip>
      {ruler && !compact && (
        <div>
          <Rule role="img" aria-label={ruler.label}>
            <i style={{ left: `${ruler.great[0]}%`, width: `${ruler.great[1]}%`, background: theme.colors.info.surface }} />
            <i style={{ left: `${ruler.perfect[0]}%`, width: `${ruler.perfect[1]}%`, background: rgba(theme.colors.text, 0.18) }} />
            <i style={{ left: '50%', width: 1, top: -4, bottom: -4, background: theme.colors.text, opacity: 0.6 }} />
            <i style={{ left: `${ruler.at}%`, width: 4, marginLeft: -2, top: -6, bottom: -6, background: theme.colors.warning.main }} />
          </Rule>
          <Ends aria-hidden="true">
            {ruler.ends.map((e) => (
              <span key={e}>{e}</span>
            ))}
          </Ends>
        </div>
      )}
      <Hint>
        {hint.map((part, i) =>
          part.tone ? (
            <b key={i} style={{ color: colorOf(part) }}>
              {part.text}
            </b>
          ) : (
            <React.Fragment key={i}>{part.text}</React.Fragment>
          )
        )}
        {note && !compact && <small>{note}</small>}
      </Hint>
    </Wrap>
  );
};
