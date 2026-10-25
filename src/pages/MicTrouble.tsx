import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../components/Button/Button';
import { CAUSE_TEXT, MicTroubleCard, TROUBLE_COPY } from '../components/MicTroubleCard/MicTroubleCard';
import { MIN_CLARITY } from '../components/OpenStringCard/openStringCheck';
import { fallOff, meterFraction, SILENCE_DB, type MicTrouble as MicCause } from '../game/audio';
import { OPEN_STRING_MIDI } from '../game/notation/violin';
import { micFailure, useEar, type MicProblem } from '../shell/Ear';
import { parseMicTrouble, ROUTES } from '../shell/routes';

const A_STRING_MIDI = OPEN_STRING_MIDI[2];

const Page = styled.main`
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md};
`;

/** O jogo parado ao fundo, apagado: dá contexto sem competir com o aviso. */
const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  opacity: 0.35;
  pointer-events: none;

  > i {
    position: absolute;
    left: 50%;
    top: 0;
    width: min(25rem, 40vw);
    height: 83%;
    transform: translateX(-50%);
    background-color: ${({ theme }) => theme.game.track};
    border-left: 3px solid ${({ theme }) => theme.game.strings.D.main};
    border-right: 3px solid ${({ theme }) => theme.game.strings.D.main};
    clip-path: polygon(30% 0, 70% 0, 100% 100%, 0 100%);
  }

  > b {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 17%;
    background-color: ${({ theme }) => theme.game.track};
    border-top: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-color: ${({ theme }) => theme.colors.background};
    opacity: 0.55;
  }
`;

const Front = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
`;

/** 5e · Problema no microfone. `?motivo=` escolhe o estado; `?depois=` é para onde voltar resolvido. */
export const MicTrouble: React.FC = () => {
  const ear = useEar();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const parsed = parseMicTrouble(search);
  // O navegador pode revelar outro problema (ex.: pediu "sem som", mas o microfone está bloqueado)
  const [found, setFound] = React.useState<{ problem: MicProblem; cause: MicCause } | null>(null);
  const problem = found?.problem ?? parsed.problem;
  const cause = found?.cause ?? parsed.cause;
  const [level, setLevel] = React.useState<number | null>(null);
  const [retrying, setRetrying] = React.useState(false);
  const [status, setStatus] = React.useState<string | undefined>();
  const after = parsed.after;
  const primaryRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => primaryRef.current?.focus(), [problem]);

  React.useEffect(() => {
    if (problem === 'blocked') return;
    let alive = true;
    ear.start().catch((error) => {
      if (alive) setFound(micFailure(error));
    });
    let last = Date.now();
    let shown = SILENCE_DB;
    const offLevel = ear.onLevel((db) => {
      const now = Date.now();
      shown = fallOff(shown, db, (now - last) / 1000);
      last = now;
      setLevel(meterFraction(shown));
    });
    const offPitch = ear.onPitch((reading) => {
      // "Toque a corda Lá solta e eu continuo sozinho"
      if (problem === 'no-sound' && reading && reading.clarity >= MIN_CLARITY && reading.midi === A_STRING_MIDI) {
        navigate(after, { replace: true });
      }
    });
    return () => {
      alive = false;
      offLevel();
      offPitch();
    };
  }, [ear, problem, after, navigate]);

  const onPrimary = async () => {
    if (problem !== 'blocked') {
      navigate(after, { replace: true });
      return;
    }
    setRetrying(true);
    setStatus('Pedindo o microfone ao navegador…');
    try {
      await ear.start();
      navigate(after, { replace: true });
    } catch (error) {
      setRetrying(false);
      const next = micFailure(error);
      setStatus(next.cause === 'denied' ? 'Ainda bloqueado. Libere o microfone no cadeado e tente de novo.' : undefined);
      setFound(next);
    }
  };

  return (
    <Page>
      <Backdrop aria-hidden="true">
        <i />
        <b />
      </Backdrop>
      <Front>
        <MicTroubleCard
          problem={problem}
          level={problem === 'blocked' ? null : level}
          status={status ?? (cause ? CAUSE_TEXT[cause] : undefined)}
          actions={
            <>
              <Button as={Link} to={ROUTES.mic} $variant="ghost">
                Ajustar microfone
              </Button>
              <Button ref={primaryRef} type="button" onClick={onPrimary} disabled={retrying}>
                {TROUBLE_COPY[problem].cta}
              </Button>
            </>
          }
        />
      </Front>
    </Page>
  );
};
