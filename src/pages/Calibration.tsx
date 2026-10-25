import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { latencyToMs } from '../game/audio';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import { LatencyPanel } from '../components/LatencyPanel/LatencyPanel';
import { useLatencyCalibration } from '../components/LatencyPanel/useLatencyCalibration';
import { Kicker, Screen, ScreenTitle } from '../components/Screen/Screen';
import { SegmentMeter } from '../components/SegmentMeter/SegmentMeter';
import { noiseView, useSoundMeters } from '../components/SoundMeters/meterLevels';
import { advanceTuner, initialTuner } from '../components/Tuner/tuner';
import { Tuner } from '../components/Tuner/Tuner';
import { meterFraction } from '../game/audio';
import { clampA4, loadA4, useSaveCalibration } from '../services/playerAudio';
import { micFailure, useEar, type EarAudio } from '../shell/Ear';
import { loadOrchestraPrefs, saveOrchestraPrefs } from '../shell/orchestra';
import { readPlayState } from '../shell/play';
import { micTroubleUrl, ROUTES } from '../shell/routes';

const Header = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.lg};

  > div {
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing.xs};
  }

  @media (max-height: 500px) {
    align-items: center;

    > div {
      flex-direction: row;
      align-items: baseline;
      gap: ${({ theme }) => theme.spacing.sm};
    }

    ${Kicker} {
      display: none;
    }
  }
`;

const Body = styled.div`
  flex-grow: 1;
  min-height: 0;
  display: flex;
  gap: ${({ theme }) => theme.spacing.lg};

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.md};
  }
`;

const Side = styled.div`
  width: 25rem;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};

  @media (max-width: 1000px) {
    width: 16rem;
  }

  @media (max-height: 500px) {
    width: 15rem;
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const Mic = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  box-shadow: ${({ theme }) => theme.shadows.card};
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  > div {
    display: flex;
    align-items: center;
    gap: 0.75rem;

    > :first-child {
      flex: 1;
    }
  }

  strong {
    font-weight: 400;
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.text};
    overflow-wrap: anywhere;
  }

  @media (max-height: 500px) {
    display: none;
  }
`;

const Reopen = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.warning.text};
`;

const formatDb = (db: number) => `${db < 0 ? '−' : ''}${Math.abs(Math.round(db))} dB`;

/** 4 · Afinação e calibração: afina as cordas no Lá escolhido, mede a latência e pergunta do fone. */
export const Calibration: React.FC = () => {
  const ear = useEar();
  const navigate = useNavigate();
  const play = readPlayState(useLocation().state);
  const [a4, setA4] = React.useState(loadA4);
  const [audio, setAudio] = React.useState<EarAudio | null>(() => ear.audio());
  const [closed, setClosed] = React.useState(false);
  const [headphones, setHeadphones] = React.useState(() => loadOrchestraPrefs().headphones);
  const [tuner, setTuner] = React.useState(initialTuner);
  const saveCalibration = useSaveCalibration();
  const meters = useSoundMeters(ear);
  const a4Ref = React.useRef(a4);
  React.useEffect(() => {
    a4Ref.current = a4;
  }, [a4]);

  const open = React.useCallback(() => {
    ear.setA4(a4Ref.current);
    return ear.start().then(
      () => setAudio(ear.audio()),
      (error: unknown) => {
        const { problem, cause } = micFailure(error);
        navigate(micTroubleUrl(problem, ROUTES.calibration, cause), { replace: true });
      }
    );
  }, [ear, navigate]);

  React.useEffect(() => {
    void open();
    const offClosed = ear.onClosed(() => {
      setAudio(null);
      setClosed(true);
    });
    return offClosed;
  }, [ear, open]);

  React.useEffect(() => ear.onPitch((r) => setTuner((s) => advanceTuner(s, r, a4Ref.current))), [ear]);

  const calibration = useLatencyCalibration(audio, a4, (seconds) => saveCalibration.mutate({ a4: a4Ref.current, latencySeconds: seconds }));

  const changeA4 = (hz: number) => {
    const next = clampA4(hz);
    setA4(next);
    ear.setA4(next);
  };

  const changeHeadphones = (on: boolean) => {
    setHeadphones(on);
    saveOrchestraPrefs({ ...loadOrchestraPrefs(), headphones: on });
  };

  const begin = () => {
    saveCalibration.mutate({ a4 });
    navigate(ROUTES.countdown, {
      state: { song: play.song, mode: play.mode, noFail: play.noFail, latencyMs: latencyToMs(calibration.seconds), next: ROUTES.game },
    });
  };

  const label = audio?.stream?.getAudioTracks()[0]?.label || 'Microfone do aparelho';
  const noise = noiseView(meters.noiseDb);

  return (
    <Screen $gap="1.5rem">
      <Header>
        <div>
          <Kicker>
            Antes de tocar · {play.song.title} · {LEVEL_NAMES[play.song.level]}
          </Kicker>
          <ScreenTitle>Afine antes de tocar</ScreenTitle>
        </div>
        <Button as={Link} to={ROUTES.home} $variant="ghost">
          <span aria-hidden="true">◂</span>Voltar
        </Button>
      </Header>

      {closed && (
        <Reopen role="alert">
          O microfone fechou quando a tela saiu de vista.
          <Button
            type="button"
            $variant="link"
            onClick={() => {
              setClosed(false);
              void open();
            }}
          >
            Ouvir de novo
          </Button>
        </Reopen>
      )}

      <Body>
        <Tuner a4={a4} onA4={changeA4} state={tuner} />
        <Side>
          <Mic aria-label="Microfone">
            <Kicker>Microfone</Kicker>
            <span>
              Entrada <strong>{label}</strong>
            </span>
            <div>
              <SegmentMeter fraction={meterFraction(meters.volumeDb)} count={14} label={`Nível de entrada: ${formatDb(meters.volumeDb)}`} toneAt={() => 'info'} />
              <span>{formatDb(meters.volumeDb)}</span>
            </div>
            <span>
              Ruído ambiente: {noise.word} ({formatDb(meters.noiseDb)})
            </span>
            <span>Supressão de ruído e ganho automático desligados: o jogo ouve o violino cru.</span>
          </Mic>
          <LatencyPanel
            phase={calibration.phase}
            seconds={calibration.seconds}
            measured={calibration.measured}
            headphones={headphones}
            onHeadphones={changeHeadphones}
            onMeasure={calibration.start}
            onStart={begin}
            canMeasure={audio !== null}
          />
        </Side>
      </Body>
    </Screen>
  );
};
