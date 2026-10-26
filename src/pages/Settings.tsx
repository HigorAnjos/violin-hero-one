import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { A4Picker } from '../components/A4Picker/A4Picker';
import { AccountPanel } from '../components/AccountPanel/AccountPanel';
import { Button } from '../components/Button/Button';
import { SettingsControls, SettingsPanel, SettingsRange, SettingsRow, SettingsValue } from '../components/SettingsPanel/SettingsPanel';
import { ThemePicker } from '../components/ThemePicker/ThemePicker';
import { Toggle } from '../components/Toggle/Toggle';
import { latencyToMs, latestLatency } from '../game/audio';
import { levelSettings } from '../game/engine/levels';
import { FIXED_SONGS, findFixedSong } from '../game/notation/songs';
import { loadOrchestraSettings, saveOrchestraSettings, volumeLabel, type OrchestraSettings } from '../game/synth';
import { clampA4, loadA4, useSaveCalibration } from '../services/playerAudio';
import { loadLocalProfile } from '../services/profile';
import { loadMetronome, saveMetronome } from '../shell/metronome';
import type { PlayState } from '../shell/play';
import { loadPlayPrefs, savePlayPrefs, type PlayPrefs } from '../shell/playPrefs';
import { ROUTES } from '../shell/routes';

const Page = styled.main`
  height: 100vh;
  height: 100dvh;
  display: grid;
  grid-template-columns: 13.75rem minmax(0, 1fr);
  gap: 2rem;
  padding: 2rem 3rem;
  overflow: hidden;

  @media (max-height: 500px) {
    grid-template-columns: 10rem minmax(0, 1fr);
    gap: 1rem;
    padding: 0.75rem max(1rem, env(safe-area-inset-right)) 0.75rem max(1rem, env(safe-area-inset-left));
  }
`;

const Nav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-height: 0;
  overflow-y: auto;

  h1 {
    margin: 0 0 1.125rem;
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.625rem;
    line-height: 2rem;
    color: ${({ theme }) => theme.colors.text};
  }

  > a:not([data-back]) {
    display: flex;
    align-items: center;
    min-height: 2.75rem;
    padding: 0 0.875rem;
    border-left: 2px solid transparent;
    border-radius: 3px;
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  > a[aria-current='page'] {
    color: ${({ theme }) => theme.colors.text};
    background-color: ${({ theme }) => theme.colors.surface};
    border-left-color: ${({ theme }) => theme.colors.primary.main};
  }

  @media (hover: hover) {
    > a:not([data-back]):hover {
      color: ${({ theme }) => theme.colors.text};
    }
  }

  > span {
    flex: 1;
  }

  @media (max-height: 500px) {
    gap: 0;

    h1 {
      margin-bottom: 0.25rem;
      font-size: 1.25rem;
      line-height: 1.75rem;
    }

    > a:not([data-back]) {
      padding: 0 0.5rem;
      font-size: 0.8125rem;
    }
  }
`;

const Content = styled.div`
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.5rem;
  align-content: start;
  /* Espaço para o anel de foco dos controles na borda */
  padding: 0.25rem;

  > [data-wide] {
    grid-column: 1 / -1;
  }

  @media (max-height: 500px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
  }
`;

const Muted = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Warning = styled(SettingsRow)`
  color: ${({ theme }) => theme.colors.warning.text};
`;

export const SETTINGS_SECTIONS = [
  { id: 'audio', label: 'Áudio e latência' },
  { id: 'jogo', label: 'Jogo' },
  { id: 'visual', label: 'Visual' },
  { id: 'acessibilidade', label: 'Acessibilidade' },
  { id: 'conta', label: 'Conta' },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

export const settingsUrl = (section: SettingsSection = 'audio') => (section === 'audio' ? ROUTES.settings : `${ROUTES.settings}?secao=${section}`);

function sectionOf(raw: string | null): SettingsSection {
  return SETTINGS_SECTIONS.find((s) => s.id === raw)?.id ?? 'audio';
}

const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });

/** "hoje 16:05" ou "9 de out." para a data da medida. */
export function measuredWhen(iso: string, now = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toDateString() === now.toDateString() ? `hoje ${timeFormat.format(at)}` : dayFormat.format(at);
}

/** A música da tela inicial, para "Medir de novo" abrir a calibração como o "Afinar" do menu. */
function calibrationState(): PlayState {
  const { firstSongId } = levelSettings(loadLocalProfile().level ?? 'beginner');
  return { song: (findFixedSong(firstSongId) ?? FIXED_SONGS[0]).song, mode: 'Arcade' };
}

const AudioSection: React.FC = () => {
  const [a4, setA4] = React.useState(loadA4);
  const [orchestra, setOrchestra] = React.useState(loadOrchestraSettings);
  const [metronome, setMetronome] = React.useState(loadMetronome);
  const [latency] = React.useState(latestLatency);
  const save = useSaveCalibration();

  const changeA4 = (hz: number) => {
    const next = clampA4(hz);
    setA4(next);
    save.mutate({ a4: next });
  };
  const changeOrchestra = (change: Partial<OrchestraSettings>) => {
    const next = { ...orchestra, ...change };
    setOrchestra(next);
    saveOrchestraSettings(next);
  };
  const changeMetronome = (percent: number) => {
    setMetronome(percent / 100);
    saveMetronome(percent / 100);
  };

  return (
    <>
      <SettingsPanel title="Latência">
        <SettingsRow>
          <span>
            Medida agora
            <small>{latency ? `${orchestra.headphones ? 'Fone' : 'Alto-falante'} · ${measuredWhen(latency.measuredAt)}` : 'Ainda não medida neste aparelho'}</small>
          </span>
          <SettingsControls>
            <SettingsValue>{latency ? `${latencyToMs(latency.latencySeconds)} ms` : '—'}</SettingsValue>
            <Button as={Link} to={ROUTES.calibration} state={calibrationState()} $variant="link">
              {latency ? 'Medir de novo' : 'Medir'}
            </Button>
          </SettingsControls>
        </SettingsRow>
        <Toggle
          label="Estou de fone"
          hint="Com fone a orquestra toca completa; sem fone, ela abaixa quando você toca"
          checked={orchestra.headphones}
          onChange={(headphones) => changeOrchestra({ headphones })}
        />
        <Warning>
          <span>Fone Bluetooth soma 150 a 250 ms. Prefira com fio ou alto-falante.</span>
        </Warning>
      </SettingsPanel>

      <SettingsPanel title="Afinação">
        <SettingsRow>
          <span>
            Lá de referência
            <small>Orquestras costumam usar 442 Hz</small>
          </span>
          <A4Picker a4={a4} onChange={changeA4} />
        </SettingsRow>
      </SettingsPanel>

      <SettingsPanel title="Som" wide>
        <Toggle label="Tocar com a orquestra" hint="Desligada, só você e o metrônomo" checked={orchestra.enabled} onChange={(enabled) => changeOrchestra({ enabled })} />
        {orchestra.enabled && (
          <SettingsRange
            label="Volume da orquestra"
            value={Math.round(orchestra.volume * 100)}
            valueText={volumeLabel(orchestra.volume)}
            onChange={(percent) => changeOrchestra({ volume: percent / 100 })}
          />
        )}
        <SettingsRange
          label="Metrônomo"
          hint="No zero, desligado"
          value={Math.round(metronome * 100)}
          valueText={metronome > 0 ? volumeLabel(metronome) : 'desligado'}
          onChange={changeMetronome}
        />
      </SettingsPanel>
    </>
  );
};

function usePrefs(): [PlayPrefs, (change: Partial<PlayPrefs>) => void] {
  const [prefs, setPrefs] = React.useState(loadPlayPrefs);
  const change = (patch: Partial<PlayPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePlayPrefs(next);
  };
  return [prefs, change];
}

const GameSection: React.FC = () => {
  const [prefs, change] = usePrefs();
  return (
    <SettingsPanel title="Na pista">
      <Toggle label="Mostrar linha de afinação" hint="O traço dos últimos 2 segundos no cartão de afinação" checked={prefs.tuningLine} onChange={(tuningLine) => change({ tuningLine })} />
      <Toggle label="Mostrar nome das notas" hint="Dó, Ré, Mi em cima de cada nota da pista" checked={prefs.noteNames} onChange={(noteNames) => change({ noteNames })} />
    </SettingsPanel>
  );
};

const AccessibilitySection: React.FC = () => {
  const [prefs, change] = usePrefs();
  return (
    <SettingsPanel title="Acessibilidade" wide>
      <Toggle
        label="Padrões para daltonismo"
        hint="Cada corda ganha um desenho além da cor: Sol lisa, Ré com pontos, Lá com listras inclinadas e Mi com listras deitadas"
        checked={prefs.colorblind}
        onChange={(colorblind) => change({ colorblind })}
      />
      <SettingsRow>
        <span>
          Movimento
          <small>As animações seguem a opção “reduzir movimento” do aparelho</small>
        </span>
        <Muted>do aparelho</Muted>
      </SettingsRow>
    </SettingsPanel>
  );
};

/** 12 · Configurações: áudio e latência, jogo, visual (temas) e acessibilidade, tudo guardado no aparelho. */
export const Settings: React.FC = () => {
  const [params] = useSearchParams();
  const section = sectionOf(params.get('secao'));

  return (
    <Page>
      <Nav aria-label="Seções de configuração">
        <h1>Configurações</h1>
        {SETTINGS_SECTIONS.map((s) => (
          <Link key={s.id} to={settingsUrl(s.id)} replace aria-current={s.id === section ? 'page' : undefined}>
            {s.label}
          </Link>
        ))}
        <Link to={ROUTES.reminder}>Lembrete de prática</Link>
        <Link to={ROUTES.profile}>Perfil</Link>
        <span />
        <Button as={Link} to={ROUTES.home} $variant="ghost" data-back="">
          <span aria-hidden="true">◂</span>
          Voltar
        </Button>
      </Nav>
      <Content>
        {section === 'audio' && <AudioSection />}
        {section === 'jogo' && <GameSection />}
        {section === 'visual' && (
          <SettingsPanel title="Visual" wide>
            <ThemePicker />
          </SettingsPanel>
        )}
        {section === 'acessibilidade' && <AccessibilitySection />}
        {section === 'conta' && <AccountPanel back={settingsUrl('conta')} />}
      </Content>
    </Page>
  );
};
