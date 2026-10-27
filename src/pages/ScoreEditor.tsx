import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../components/Button/Button';
import { NoteInspector, type InspectedNote } from '../components/NoteInspector/NoteInspector';
import { NotePalette } from '../components/NotePalette/NotePalette';
import { ScoreStaff } from '../components/ScoreStaff/ScoreStaff';
import { Kicker, Screen } from '../components/Screen/Screen';
import { TrackPreview } from '../components/TrackPreview/TrackPreview';
import {
  cursorPosition,
  derivedPlacement,
  DURATION_NAMES,
  DURATIONS,
  editorSong,
  KEY_CHOICES,
  keyFifthsOf,
  MAX_BPM,
  MIN_BPM,
  noteName,
  rangeSummary,
  selectedNote,
  songToSave,
  TIME_SIGNATURES,
  type EditorNote,
  type EditorState,
} from '../game/notation/editor';
import type { Song } from '../game/notation/song';
import { STRING_LETTERS, STRING_SOLFEGE } from '../game/notation/violin';
import { clearDraft } from '../services/editorDraft';
import { songCache } from '../services/songCache';
import { saveAndKeep, type SongImporter } from '../services/songImport';
import { songKeys } from '../services/songs';
import { modesUrl } from '../shell/choice';
import { appImporter } from '../shell/editorImporter';
import { listen as playSong, type Listening } from '../shell/listen';
import { ROUTES } from '../shell/routes';
import { COMPACT_QUERY, useMediaQuery } from '../shell/useMediaQuery';
import { keyAction, useScoreEditor, type DraftStatus, type EditorAction } from '../shell/useScoreEditor';

const Page = styled(Screen)`
  padding-left: 2rem;
  padding-right: 2rem;

  @media (max-height: 500px) {
    padding-left: max(${({ theme }) => theme.spacing.md}, env(safe-area-inset-left));
    padding-right: max(${({ theme }) => theme.spacing.md}, env(safe-area-inset-right));
  }

  @media (min-height: 501px) {
    height: calc(100vh - var(--update-notice-space, 0px));
    height: calc(100dvh - var(--update-notice-space, 0px));
  }
`;

const Header = styled.header`
  display: flex;
  flex-wrap: nowrap;

  @media (max-height: 500px) {
    flex-wrap: wrap;
  }

  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
`;

const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 13rem;
`;

const TitleInput = styled.input`
  width: 100%;
  min-height: 2.75rem;
  padding: 0 0.375rem;
  margin-left: -0.375rem;
  border: 2px solid transparent;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 1.5rem;
  line-height: 1.75rem;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (hover: hover) {
    &:hover {
      border-color: ${({ theme }) => theme.colors.surfaceBorder};
    }
  }

  @media (max-height: 500px) {
    font-size: 1.125rem;
  }
`;

const Metas = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xxs};
`;

/** Os seletores em pílula do design (.vh-meta), nativos para teclado e leitor de tela. */
const Meta = styled.select`
  min-height: 2.75rem;
  padding: 0 0.625rem;
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.ui};
  font-weight: 700;
  font-size: 0.8125rem;
`;

const Grow = styled.span`
  flex: 1;
`;

const KickerRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.xs};
  white-space: nowrap;

  @media (max-height: 500px) {
    display: none;
  }
`;

const DraftNote = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Body = styled.div`
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};

  @media (max-height: 500px) {
    flex-direction: column;
    flex: none;
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const Main = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const Tools = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.xs};
  padding-bottom: 0.375rem;
`;

const Tab = styled.span`
  min-height: 2.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1rem;
  border-radius: ${({ theme }) => `${theme.borderRadius.md} ${theme.borderRadius.md} 0 0`};
  background-color: ${({ theme }) => theme.colors.surface};
  box-shadow: inset 0 -3px 0 ${({ theme }) => theme.colors.primary.main};
  font-weight: 800;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
`;

const Sheet = styled.section`
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xxs};
  padding: 0.75rem 1rem 0.375rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.lg};

  @media (max-height: 500px) {
    flex: none;
    padding: ${({ theme }) => theme.spacing.xs};
  }
`;

const StaffScroll = styled.div`
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 1.25rem 0.25rem 0.25rem;
  border-radius: ${({ theme }) => theme.borderRadius.sm};

  @media (max-height: 500px) {
    flex: none;
    max-height: 13rem;
  }
`;

const Legend = styled.p`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.875rem;
  padding: 0.125rem 0 0.25rem;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textMuted};

  i {
    display: inline-block;
    width: 0.625rem;
    height: 0.625rem;
    margin-right: 0.375rem;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
  }

  @media (max-height: 500px) {
    display: none;
  }
`;

const Aside = styled.aside`
  width: 18.75rem;
  flex: none;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  overflow-y: auto;

  @media (max-height: 500px) {
    width: auto;
    flex-direction: row;
    align-items: flex-start;
    overflow: visible;

    > * {
      flex: 1;
    }
  }
`;

const PreviewPanel = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 0.75rem 1rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.lg};

  > span {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Notices = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Notice = styled.p<{ $tone?: 'warning' | 'calm' }>`
  padding: 0.625rem 0.75rem;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1.5px solid ${({ theme, $tone = 'calm' }) => ($tone === 'warning' ? theme.colors.warning.border : theme.colors.surfaceBorder)};
  background-color: ${({ theme, $tone = 'calm' }) => ($tone === 'warning' ? theme.colors.warning.surface : theme.colors.surface)};
  color: ${({ theme, $tone = 'calm' }) => ($tone === 'warning' ? theme.colors.warning.text : theme.colors.text)};
  font-size: 0.8125rem;
  line-height: 1.125rem;
`;

const Footer = styled.footer`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.875rem;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textMuted};

  kbd {
    display: inline-block;
    min-width: 1.125rem;
    padding: 0.125rem 0.3125rem;
    border-radius: 5px;
    border: 1.5px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-bottom-width: 3px;
    background-color: ${({ theme }) => theme.colors.surface};
    font: 800 0.75rem/1.2 ${({ theme }) => theme.fonts.ui};
    color: ${({ theme }) => theme.colors.text};
    text-align: center;
  }

  > span:last-child {
    margin-left: auto;
  }

  @media (pointer: coarse), (max-height: 500px) {
    > span:not(:last-child) {
      display: none;
    }
  }
`;

const BPM_CHOICES = [40, 48, 56, 60, 66, 72, 80, 88, 96, 104, 112, 120, 132, 144, 160, 176, 200].filter((b) => b >= MIN_BPM && b <= MAX_BPM);
const decimal = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',');

/** "semínima · 1 tempo", "mínima pontuada · 3 tempos"; figura fora da paleta só pelos tempos. */
export function figureLabel(length: number, song: Song): string {
  const beats = length / (4 / song.timeSignature.unit);
  const tempos = `${decimal(beats)} ${Math.abs(beats - 1) < 1e-6 ? 'tempo' : 'tempos'}`;
  const plain = DURATIONS.find((d) => Math.abs(d - length) < 1e-6);
  if (plain) return `${DURATION_NAMES[plain]} · ${tempos}`;
  const dotted = DURATIONS.find((d) => Math.abs(d * 1.5 - length) < 1e-6);
  return dotted ? `${DURATION_NAMES[dotted]} pontuada · ${tempos}` : tempos;
}

function inspect(state: EditorState, song: Song, note: EditorNote | undefined, firstPosition: boolean): InspectedNote | null {
  if (!note) return null;
  const { measure, beat } = cursorPosition(state, note.at);
  const placement = derivedPlacement(state, song, note);
  return {
    name: noteName(note.midi, keyFifthsOf(state.doc.meta.key)),
    figure: figureLabel(note.length, song),
    where: `comp. ${measure + 1} · tempo ${decimal(beat)}`,
    string: placement.string,
    finger: placement.finger,
    chosen: Boolean(note.placement),
    firstPosition,
  };
}

const DRAFT_TEXT: Record<DraftStatus, string> = {
  empty: '',
  saved: 'rascunho salvo no aparelho',
  unsaved: 'o aparelho não guardou o rascunho',
};

type Saving = { status: 'idle' } | { status: 'saving' } | { status: 'saved'; id: string; doc: EditorState['doc'] } | { status: 'error'; message: string };

const TEXT_FIELDS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

export interface ScoreEditorProps {
  importer?: SongImporter;
  listen?: typeof playSong;
}

/** 4 · Escrever partitura (ScoreEditor.dc): a pauta com teclado e toque, ouvir, rascunho no aparelho e salvar na biblioteca. */
export const ScoreEditor: React.FC<ScoreEditorProps> = ({ importer: given, listen = playSong }) => {
  const { state, dispatch, draft } = useScoreEditor();
  const [importer] = React.useState(() => given ?? appImporter());
  const queryClient = useQueryClient();
  const compact = useMediaQuery(COMPACT_QUERY);
  const [saving, setSaving] = React.useState<Saving>({ status: 'idle' });
  const [playing, setPlaying] = React.useState<Listening | null>(null);
  const staff = React.useRef<HTMLDivElement>(null);

  const song = React.useMemo(() => editorSong(state), [state]);
  const summary = rangeSummary(state);
  const selected = selectedNote(state);
  const inspected = inspect(state, song, selected, summary?.firstPosition ?? true);
  const notes = state.doc.notes.filter((n) => !n.tie).length;
  const { meta } = state.doc;
  const ts = meta.timeSignature;
  const saved = saving.status === 'saved' && saving.doc === state.doc ? saving : null;

  React.useEffect(() => staff.current?.focus({ preventScroll: true }), []);
  React.useEffect(() => () => playing?.stop(), [playing]);

  const act = (action: EditorAction) => dispatch(action);

  const toggleListen = async (fromMeasure = 0) => {
    if (playing) {
      playing.stop();
      setPlaying(null);
      return;
    }
    if (!state.doc.notes.length) return;
    const session = await listen(song, { fromMeasure }).catch(() => null);
    if (!session) return;
    setPlaying(session);
    void session.done.then(() => setPlaying((current) => (current === session ? null : current)));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (TEXT_FIELDS.has(target.tagName)) return;
    // Em botão, Espaço e Enter continuam apertando o botão
    if (target.tagName === 'BUTTON' && (event.key === ' ' || event.key === 'Enter')) return;
    const action = keyAction(event.nativeEvent);
    if (!action) return;
    event.preventDefault();
    if (action === 'listen') void toggleListen(cursorPosition(state).measure);
    else dispatch(action);
  };

  const save = async () => {
    let chart: Song;
    try {
      chart = songToSave(state);
    } catch (e) {
      setSaving({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    const doc = state.doc;
    setSaving({ status: 'saving' });
    try {
      const result = await saveAndKeep(importer, chart, songCache);
      clearDraft();
      void queryClient.invalidateQueries({ queryKey: songKeys.saved });
      setSaving({ status: 'saved', id: result.song.id, doc });
    } catch (e) {
      setSaving({ status: 'error', message: e instanceof Error ? e.message : 'Não foi possível salvar agora.' });
    }
  };

  const unitGlyph = ts.unit === 8 ? '♪' : ts.unit === 2 ? '𝅗𝅥' : '♩';
  const bpms = [...new Set([...BPM_CHOICES, meta.bpm])].sort((a, b) => a - b);
  const announce = state.refusal ?? (inspected ? `${inspected.name}, ${inspected.figure}, ${inspected.where}` : `Cursor no ${inspectedPlace(state)}`);

  return (
    <Page $gap="0.75rem" onKeyDown={onKeyDown}>
      <Header>
        <Button as={Link} to={ROUTES.library} $variant="ghost">
          <span aria-hidden="true">◂</span>Biblioteca
        </Button>
        <TitleBlock>
          <KickerRow>
            <Kicker>Escrever partitura</Kicker>
            <DraftNote role="status">{DRAFT_TEXT[draft]}</DraftNote>
          </KickerRow>
          <TitleInput aria-label="Título da música" placeholder="Sem título ✎" maxLength={80} value={meta.title} onChange={(e) => act({ type: 'title', title: e.target.value })} />
        </TitleBlock>
        <Metas>
          <Meta aria-label="Compasso" value={`${ts.beats}/${ts.unit}`} onChange={(e) => act({ type: 'time', timeSignature: TIME_SIGNATURES.find((t) => `${t.beats}/${t.unit}` === e.target.value)! })}>
            {TIME_SIGNATURES.map((t) => (
              <option key={`${t.beats}/${t.unit}`} value={`${t.beats}/${t.unit}`}>
                {t.beats}/{t.unit}
              </option>
            ))}
          </Meta>
          <Meta aria-label="Tonalidade" value={meta.key} onChange={(e) => act({ type: 'key', key: e.target.value })}>
            {KEY_CHOICES.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </Meta>
          <Meta aria-label="Andamento" value={meta.bpm} onChange={(e) => act({ type: 'bpm', bpm: Number(e.target.value) })}>
            {bpms.map((b) => (
              <option key={b} value={b}>
                {unitGlyph} = {b}
              </option>
            ))}
          </Meta>
        </Metas>
        <Grow />
        <Button type="button" $variant="ghost" aria-pressed={playing !== null} disabled={!notes} onClick={() => void toggleListen()}>
          <span aria-hidden="true">{playing ? '■' : '▶'}</span>
          {playing ? 'Parar' : 'Ouvir'}
        </Button>
        {saved ? (
          <Button as={Link} to={modesUrl(undefined, saved.id)}>
            Jogar agora <span aria-hidden="true">▸</span>
          </Button>
        ) : (
          <Button type="button" disabled={saving.status === 'saving'} onClick={() => void save()}>
            {saving.status === 'saving' ? 'Salvando…' : compact ? 'Salvar' : 'Salvar na biblioteca'}
          </Button>
        )}
      </Header>

      <Body>
        <Main>
          <Tools>
            <Tab>
              <span aria-hidden="true">✎</span>Na pauta
            </Tab>
            <NotePalette duration={state.duration} dotted={state.dotted} canUndo={state.past.length > 0} canRedo={state.future.length > 0} onAction={act} />
          </Tools>
          <Sheet aria-label="Partitura em edição">
            <StaffScroll ref={staff} tabIndex={0} role="group" aria-roledescription="editor de partitura" aria-label="Pauta: letras A a G escrevem, setas andam, números trocam a figura" aria-describedby="editor-anuncio">
              <ScoreStaff song={song} cursor={state.cursor} selectedAt={selected?.at ?? null} onTap={(at, step) => act({ type: 'tap', at, step })} />
            </StaffScroll>
            <Legend>
              {STRING_SOLFEGE.map((label, i) => (
                <span key={label}>
                  <LegendDot $index={i} />
                  {label}
                </span>
              ))}
              <span>· número = dedo, sugerido pelo app</span>
            </Legend>
            <span id="editor-anuncio" className="sr-only" role="status">
              {announce}
            </span>
          </Sheet>
        </Main>

        <Aside aria-label="Detalhes da partitura">
          <NoteInspector note={inspected} onAction={act} />
          {!compact && (
            <PreviewPanel aria-label="Prévia na pista">
              <span>Prévia na pista</span>
              <TrackPreview song={song} cursor={state.cursor} />
            </PreviewPanel>
          )}
          <Notices aria-label="Avisos">
            {state.refusal && <Notice $tone="warning">{state.refusal}</Notice>}
            {saving.status === 'error' && <Notice $tone="warning">{saving.message}</Notice>}
            {saved && <Notice role="status">✓ Salva na biblioteca. Só você vê esta música; ela não entra em ranking nem desafio.</Notice>}
            {summary && (
              <Notice>
                ✓ Tudo cabe no violino ({noteName(summary.lowest, keyFifthsOf(meta.key))} – {noteName(summary.highest, keyFifthsOf(meta.key))})
                {summary.firstPosition ? ', só 1ª posição.' : ', até a 3ª posição.'}
              </Notice>
            )}
          </Notices>
        </Aside>
      </Body>

      <Footer>
        <span>
          <kbd>A</kbd>–<kbd>G</kbd> nota
        </span>
        <span>
          <kbd>1</kbd>–<kbd>5</kbd> duração
        </span>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> sobe/desce
        </span>
        <span>
          <kbd>Shift</kbd>+<kbd>↑</kbd> oitava
        </span>
        <span>
          <kbd>←</kbd>
          <kbd>→</kbd> anda entre notas
        </span>
        <span>
          <kbd>Espaço</kbd> ouvir daqui
        </span>
        <span>
          {song.measures.length} compassos · {notes} {notes === 1 ? 'nota' : 'notas'}
        </span>
      </Footer>
    </Page>
  );
};

function inspectedPlace(state: EditorState): string {
  const { measure, beat } = cursorPosition(state);
  return `compasso ${measure + 1}, tempo ${decimal(beat)}`;
}

const LegendDot = styled.i<{ $index: number }>`
  background-color: ${({ theme, $index }) => theme.game.strings[STRING_LETTERS[$index]].main};
`;
