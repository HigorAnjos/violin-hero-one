import React from 'react';
import styled, { css, useTheme } from 'styled-components';
import { rgba } from '../../assets/styles/themes/color';
import { midiToFrequency, OPEN_STRING_MIDI, STRING_LETTERS, STRING_SOLFEGE, type StringIndex } from '../../game/notation/violin';
import { formatCents, formatHz } from '../OpenStringCard/openStringCheck';
import { Kicker } from '../Screen/Screen';
import { DEFAULT_BANDS, needlePercent, tuneHint, tuneWord, type TunerState, type TuningBands } from './tuner';

/** Faixa de ±cents na régua de ±bands.good, em % da largura. */
const band = (cents: number, bands: TuningBands) => ({
  left: `${needlePercent(-cents, bands)}%`,
  width: `${needlePercent(cents, bands) - needlePercent(-cents, bands)}%`,
});

export const A4_PRESETS: readonly { hz: number; label: string }[] = [
  { hz: 440, label: '440' },
  { hz: 442, label: '442' },
  { hz: 443, label: '443' },
  { hz: 415, label: '415 barroco' },
];

const Panel = styled.section`
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  padding: 1.25rem 1.5rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  box-shadow: ${({ theme }) => theme.shadows.card};

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
    padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};

  > span:last-child {
    margin-left: auto;
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    > span:last-child {
      display: none;
    }
  }
`;

const Reference = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 0.625rem 0.75rem;

  > ${Kicker} {
    letter-spacing: 0.1em;
  }

  @media (max-width: 1340px) {
    > small {
      display: none;
    }
  }
  background-color: ${({ theme }) => theme.game.track};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};

  > small {
    margin-left: auto;
    font-size: 0.75rem;
    line-height: 1rem;
    text-align: right;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    padding: ${({ theme }) => theme.spacing.xxs};

    > small,
    > ${Kicker} {
      display: none;
    }
  }
`;

const Stepper = styled.div`
  display: flex;
  align-items: center;
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme }) => theme.colors.surface};

  button {
    width: 2.75rem;
    height: 2.75rem;
    font-weight: 600;
    font-size: 1.125rem;
  }

  output {
    min-width: 5rem;
    text-align: center;
    font-size: 1.25rem;
  }

  @media (max-height: 500px) {
    output {
      min-width: 4.5rem;
      font-size: 1rem;
    }
  }
`;

const Preset = styled.button<{ $on: boolean }>`
  min-height: 2.75rem;
  min-width: 2.75rem;
  padding: 0 0.625rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  border: 1px solid ${({ theme, $on }) => ($on ? theme.colors.info.main : theme.colors.surfaceBorder)};
  background-color: ${({ theme, $on }) => ($on ? theme.colors.info.main : 'transparent')};
  color: ${({ theme, $on }) => ($on ? theme.colors.background : theme.colors.textMuted)};
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.06em;
`;

const Readout = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 1.75rem;

  > b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 500;
    font-size: 6rem;
    line-height: 0.9;
  }

  > div {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-bottom: 0.375rem;
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.md};

    > b {
      font-size: 4rem;
    }
  }
`;

const Hz = styled.span`
  font-size: 1.75rem;
  line-height: 2rem;

  @media (max-height: 500px) {
    font-size: 1.375rem;
  }
`;

const Status = styled.span<{ $color: string }>`
  font-weight: 600;
  font-size: 0.875rem;
  letter-spacing: 0.14em;
  color: ${({ $color }) => $color};

  @media (max-height: 500px) {
    font-size: 0.75rem;
  }
`;

const Hint = styled.span`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    display: none;
  }
`;

const Meter = styled.div`
  position: relative;
  height: 3.5rem;
  background-color: ${({ theme }) => theme.game.track};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  i {
    position: absolute;
    top: 0;
    bottom: 0;
  }

  @media (max-height: 500px) {
    height: 2.125rem;
  }
`;

const Needle = styled.span`
  position: absolute;
  top: -0.5rem;
  bottom: -0.5rem;
  width: 4px;
  margin-left: -2px;
  background-color: ${({ theme }) => theme.colors.info.main};

  @media (prefers-reduced-motion: no-preference) {
    transition: left 0.08s linear;
  }
`;

/** Números nas posições reais da régua (as faixas do motor não são equidistantes). */
const Scale = styled.div`
  position: relative;
  height: 1.25rem;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textMuted};

  span {
    position: absolute;
    top: 0;
    white-space: nowrap;
  }

  @media (max-height: 500px) {
    font-size: 0.75rem;

    span[data-minor] {
      display: none;
    }
  }
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1.125rem;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  span {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  i {
    width: 0.75rem;
    height: 0.75rem;
  }

  @media (max-height: 500px) {
    display: none;
  }
`;

const Strings = styled.ul`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: auto;

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const StringCard = styled.li<{ $state: 'tuned' | 'live' | 'pending' }>`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  background-color: ${({ theme }) => theme.game.track};
  border: 1px ${({ $state }) => ($state === 'pending' ? 'dashed' : 'solid')}
    ${({ theme, $state }) => ($state === 'live' ? theme.colors.info.main : theme.colors.surfaceBorder)};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 500;
    font-size: 1.5rem;
    line-height: 1.2;
  }

  strong {
    font-weight: 600;
    color: ${({ theme, $state }) => ($state === 'live' ? theme.colors.info.text : $state === 'tuned' ? theme.colors.text : theme.colors.textMuted)};
  }

  ${({ $state }) =>
    $state === 'pending' &&
    css`
      b {
        opacity: 0.6;
      }
    `}

  @media (max-height: 500px) {
    padding: ${({ theme }) => `${theme.spacing.xxs} ${theme.spacing.xs}`};
    font-size: 0.75rem;

    b {
      font-size: 1.25rem;
    }

    span {
      display: none;
    }
  }
`;

const STRINGS: StringIndex[] = [0, 1, 2, 3];
/** Oitava de cada corda solta: G3, D4, A4, E5. */
const OCTAVES = [3, 4, 4, 5];

/** Afinador da tela 4: Lá de referência, agulha e as quatro cordas soltas. */
export const Tuner: React.FC<{ a4: number; onA4: (hz: number) => void; state: TunerState; back?: React.ReactNode; bands?: TuningBands }> = ({
  a4,
  onA4,
  state,
  back,
  bands = DEFAULT_BANDS,
}) => {
  const theme = useTheme();
  const { perfect: TUNED_CENTS, great: CLOSE_CENTS, good: GOOD_CENTS } = bands;
  const live = state.live;
  const shown: StringIndex = live?.string ?? (Math.max(0, state.tuned.findIndex((c) => c === null)) as StringIndex);
  const letter = STRING_LETTERS[shown];
  const cents = live?.cents ?? 0;
  const off = Math.abs(cents);
  const statusColor = off <= TUNED_CENTS ? theme.colors.text : off <= CLOSE_CENTS ? theme.colors.info.text : theme.colors.warning.text;
  const centsLabel = formatCents(cents);

  return (
    <Panel aria-label="Afinador">
      <Row>
        {back}
        <Kicker>Afinador</Kicker>
        <span>Toque cada corda solta, uma de cada vez</span>
      </Row>

      <Reference role="group" aria-label="Lá de referência">
        <Kicker>Lá de referência</Kicker>
        <Stepper>
          <button type="button" aria-label="Diminuir 1 Hz" onClick={() => onA4(a4 - 1)}>
            −
          </button>
          <output aria-live="polite">{a4} Hz</output>
          <button type="button" aria-label="Aumentar 1 Hz" onClick={() => onA4(a4 + 1)}>
            +
          </button>
        </Stepper>
        {A4_PRESETS.map((p) => (
          <Preset key={p.hz} type="button" $on={p.hz === a4} aria-pressed={p.hz === a4} onClick={() => onA4(p.hz)}>
            {p.label}
          </Preset>
        ))}
        <small>
          Orquestras costumam
          <br />
          usar 442 Hz
        </small>
      </Reference>

      <Readout>
        <b style={{ color: theme.game.strings[letter].main }}>{`${letter}${OCTAVES[shown]}`}</b>
        <div>
          <Hz>{live ? formatHz(live.hz) : '— Hz'}</Hz>
          <Status $color={live ? statusColor : theme.colors.textMuted} role="status">
            {live ? `${centsLabel} · ${tuneWord(cents, bands)}` : 'ESPERANDO A CORDA'}
          </Status>
          <Hint>{tuneHint(state, bands)}</Hint>
        </div>
      </Readout>

      <div>
        <Meter role="img" aria-label={`Medidor de afinação: ${live ? centsLabel : 'sem som'}`}>
          <i style={{ ...band(CLOSE_CENTS, bands), background: theme.colors.info.surface }} />
          <i style={{ ...band(TUNED_CENTS, bands), background: rgba(theme.colors.text, 0.14) }} />
          <i style={{ left: '50%', width: 1, background: theme.colors.text, opacity: 0.6 }} />
          {live && <Needle style={{ left: `${needlePercent(cents, bands)}%` }} />}
        </Meter>
      </div>
      <Scale aria-hidden="true">
        <span style={{ left: 0 }}>−{GOOD_CENTS} ¢</span>
        {[-CLOSE_CENTS, -TUNED_CENTS, 0, TUNED_CENTS, CLOSE_CENTS].map((c) => (
          <span key={c} data-minor={Math.abs(c) === CLOSE_CENTS || undefined} style={{ left: `${needlePercent(c, bands)}%`, transform: 'translateX(-50%)' }}>
            {c > 0 ? `+${c}` : c < 0 ? `−${-c}` : '0'}
          </span>
        ))}
        <span style={{ right: 0 }}>+{GOOD_CENTS} ¢</span>
      </Scale>
      <Legend aria-hidden="true">
        <span>
          <i style={{ background: rgba(theme.colors.text, 0.25) }} />
          Perfeito ±{TUNED_CENTS} ¢
        </span>
        <span>
          <i style={{ background: theme.colors.info.border }} />
          Ótimo ±{CLOSE_CENTS} ¢
        </span>
        <span>
          <i style={{ border: `1px solid ${theme.colors.surfaceBorder}` }} />
          Bom ±{GOOD_CENTS} ¢
        </span>
      </Legend>

      <Strings aria-label="Cordas soltas">
        {STRINGS.map((s) => {
          const tuned = state.tuned[s];
          const cardState = live?.string === s ? 'live' : tuned !== null ? 'tuned' : 'pending';
          const l = STRING_LETTERS[s];
          return (
            <StringCard key={s} $state={cardState}>
              <b style={{ color: theme.game.strings[l].main }}>{l}</b>
              <span>
                {STRING_SOLFEGE[s]} · {formatHz(midiToFrequency(OPEN_STRING_MIDI[s], a4))}
              </span>
              <strong>{cardState === 'live' ? '● Ouvindo agora' : tuned !== null ? `✓ Afinada · ${formatCents(tuned)}` : '○ Pendente'}</strong>
            </StringCard>
          );
        })}
      </Strings>
    </Panel>
  );
};
