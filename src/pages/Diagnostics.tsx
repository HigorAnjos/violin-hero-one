import React from 'react';
import styled from 'styled-components';
import { BackLink, NavigationScreen } from '../components/BackLink/BackLink';
import { Button } from '../components/Button/Button';
import { Kicker } from '../components/Screen/Screen';
import {
  createLiveStats,
  formatReport,
  latestLatency,
  noteName,
  readInput,
  type Calibrated,
  type InputReport,
  type LiveSnapshot,
} from '../game/audio';
import { loadA4 } from '../services/playerAudio';
import { nativeAppInfo, nativePlatform } from '../services/platform';
import { micFailure, useEar } from '../shell/Ear';
import { settingsUrl } from './Settings';

/** De quanto em quanto a tela relê as medidas ao vivo: a afinação chega a ~100 leituras por segundo. */
const REFRESH_MS = 250;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.625rem;
    line-height: 2rem;
    color: ${({ theme }) => theme.colors.text};
  }

  p {
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;

  > [role='status'] {
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.info.text};
  }
`;

const Live = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.75rem;

  > div {
    min-width: 0;
    padding: 0.625rem 0.875rem;
    border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: ${({ theme }) => theme.borderRadius.sm};
    background-color: ${({ theme }) => theme.colors.surface};
  }

  dt {
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  dd {
    font-size: 1.25rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.text};
    overflow-wrap: anywhere;
  }
`;

const Report = styled.textarea`
  width: 100%;
  min-height: 16rem;
  flex: 1;
  padding: 0.75rem;
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.125rem;
  resize: vertical;
`;

const Problem = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.warning.text};
`;

const EMPTY: LiveSnapshot = { level: null, reading: null, lag: null, steadiness: null };

function calibrated(): Calibrated | null {
  const stored = latestLatency();
  return stored ? { latencyMs: stored.latencySeconds * 1000, confidence: stored.confidence, measuredAt: stored.measuredAt } : null;
}

function supportedConstraints(): MediaTrackSupportedConstraints {
  try {
    return navigator.mediaDevices?.getSupportedConstraints?.() ?? {};
  } catch {
    return {};
  }
}

function useAppLabel(): string {
  const [label, setLabel] = React.useState(`${__APP_VERSION__} · ${nativePlatform()}`);
  React.useEffect(() => {
    let alive = true;
    void nativeAppInfo().then((info) => {
      if (alive && info) setLabel(`${__APP_VERSION__} · ${nativePlatform()} ${info.version} (${info.build})`);
    });
    return () => {
      alive = false;
    };
  }, []);
  return label;
}

/**
 * Diagnóstico de áudio, escondido (?diagnostico ou 5 toques na versão em Configurações): o que o WebView aplicou do
 * microfone cru, taxa, latências, nível e nota ao vivo, e um texto para copiar e mandar. Feito para o aparelho de
 * verdade, onde não há console.
 */
export const Diagnostics: React.FC = () => {
  const ear = useEar();
  const app = useAppLabel();
  const [stats] = React.useState(createLiveStats);
  const [a4] = React.useState(loadA4);
  const [input, setInput] = React.useState<InputReport | null>(null);
  const [live, setLive] = React.useState<LiveSnapshot>(EMPTY);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const report = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const offs = [
      ear.onPitch((reading) => stats.push(reading, ear.audio()?.context.currentTime ?? reading?.time ?? 0)),
      ear.onLevel((db) => stats.level(db)),
      ear.onClosed(() => setInput(null)),
    ];
    const timer = window.setInterval(() => setLive(stats.snapshot()), REFRESH_MS);
    return () => {
      offs.forEach((off) => off());
      window.clearInterval(timer);
    };
  }, [ear, stats]);

  const start = async () => {
    setBusy(true);
    setProblem(null);
    stats.reset();
    try {
      // Dentro do toque: o iOS só libera o áudio assim
      await ear.start();
      ear.setA4(a4);
      const audio = ear.audio();
      if (audio?.stream) setInput(readInput({ context: audio.context, stream: audio.stream, label: '' }, supportedConstraints()));
      else setProblem('Sem microfone de verdade (Ouvido simulado).');
    } catch (error) {
      setProblem(`O microfone não abriu: ${micFailure(error).cause}.`);
    } finally {
      setBusy(false);
    }
  };
  const stop = () => {
    ear.stop();
    setInput(null);
  };

  const text = formatReport({
    when: new Date(),
    app,
    device: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    input,
    live,
    calibrated: calibrated(),
    a4,
  });
  const fullText = problem ? `${text}\nproblema: ${problem}` : text;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied('Copiado. Cole na conversa.');
    } catch {
      // WebView sem área de transferência: o texto fica selecionado para o "Copiar" do sistema
      report.current?.focus();
      report.current?.select();
      setCopied('Texto selecionado: toque e segure para copiar.');
    }
  };

  const reading = live.reading;
  return (
    <NavigationScreen $gap="1rem">
      <Header>
        <div>
          <Kicker>Escondido</Kicker>
          <h1>Diagnóstico de áudio</h1>
          <p>Ligue o microfone, toque e segure uma corda solta por uns segundos, depois copie tudo.</p>
        </div>
        <BackLink to={settingsUrl('audio')} label="Configurações" />
      </Header>

      <Actions>
        {input ? (
          <Button type="button" $variant="ghost" onClick={stop}>
            Desligar o microfone
          </Button>
        ) : (
          <Button type="button" onClick={() => void start()} disabled={busy}>
            Ligar o microfone
          </Button>
        )}
        <Button type="button" $variant="ghost" onClick={() => void copy()}>
          Copiar tudo
        </Button>
        <span role="status">{copied}</span>
      </Actions>
      {problem && <Problem role="alert">{problem}</Problem>}

      <Live aria-label="Ao vivo">
        <div>
          <dt>Nota</dt>
          <dd>{reading ? `${noteName(reading.midi)} ${reading.cents >= 0 ? '+' : ''}${reading.cents.toFixed(1)}¢` : '—'}</dd>
        </div>
        <div>
          <dt>Nível</dt>
          <dd>{live.level === null ? '—' : `${live.level.toFixed(0)} dBFS`}</dd>
        </div>
        <div>
          <dt>Atraso da detecção (p95)</dt>
          <dd>{live.lag ? `${live.lag.p95Ms.toFixed(1)} ms` : '—'}</dd>
        </div>
        <div>
          <dt>Estabilidade</dt>
          <dd>{live.steadiness ? `±${live.steadiness.spreadCents.toFixed(1)}¢` : '—'}</dd>
        </div>
        <div>
          <dt>Taxa</dt>
          <dd>{input ? `${input.contextSampleRate} Hz` : '—'}</dd>
        </div>
      </Live>

      <Report ref={report} readOnly aria-label="Diagnóstico em texto" value={fullText} spellCheck={false} />
    </NavigationScreen>
  );
};
