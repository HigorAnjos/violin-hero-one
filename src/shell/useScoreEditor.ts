import React from 'react';
import { writeDictated, type DictatedNote } from '../game/notation/dictation';
import {
  clearPlacement,
  createEditor,
  deleteNote,
  DURATIONS,
  insertLetter,
  insertNote,
  insertRest,
  moveCursor,
  noteAtCursor,
  octaveNote,
  redo,
  setAccidental,
  setBpm,
  setCursor,
  setDuration,
  setFinger,
  setKey,
  setString,
  setTimeSignature,
  setTitle,
  stepMidi,
  stepNote,
  toggleDot,
  toggleTie,
  undo,
  type Accidental,
  type Duration,
  type EditorState,
  type Letter,
} from '../game/notation/editor';
import type { Finger, TimeSignature } from '../game/notation/song';
import type { StringIndex } from '../game/notation/violin';
import { clearDraft, loadDraft, saveDraft } from '../services/editorDraft';

/** Tudo que a tela do editor faz com a partitura: teclado, paleta, toque e painel da nota viram uma ação destas. */
export type EditorAction =
  | { type: 'letter'; letter: Letter }
  /** A entrada por API (ditado): a nota no cursor, com a figura escolhida. */
  | { type: 'note'; midi: number }
  /** Nota que o ditado fechou: no lugar e com a duração que a grade deu, `origin` semínimas depois do começo. */
  | { type: 'dictated'; origin: number; note: DictatedNote }
  | { type: 'rest' }
  | { type: 'delete' }
  | { type: 'move'; direction: -1 | 1 }
  | { type: 'step'; steps: number }
  | { type: 'octave'; octaves: number }
  | { type: 'duration'; duration: Duration }
  | { type: 'dot' }
  | { type: 'accidental'; accidental: Accidental }
  | { type: 'tie' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'tap'; at: number; step: number }
  | { type: 'string'; string: StringIndex }
  | { type: 'finger'; finger: Finger }
  | { type: 'suggested' }
  | { type: 'title'; title: string }
  | { type: 'bpm'; bpm: number }
  | { type: 'key'; key: string }
  | { type: 'time'; timeSignature: TimeSignature }
  | { type: 'reset' };

/**
 * Toque na pauta: em cima de uma nota na mesma altura, só a seleciona; em qualquer outro ponto, escreve ali a altura
 * tocada com a figura escolhida (por cima do que houver).
 */
function tap(state: EditorState, at: number, step: number): EditorState {
  const moved = setCursor(state, at);
  const midi = stepMidi(state.doc.meta.key, step);
  return noteAtCursor(moved)?.midi === midi ? moved : insertNote(moved, midi);
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'letter':
      return insertLetter(state, action.letter);
    case 'note':
      return insertNote(state, action.midi);
    case 'dictated':
      return writeDictated(state, action.origin, action.note);
    case 'rest':
      return insertRest(state);
    case 'delete':
      return deleteNote(state);
    case 'move':
      return moveCursor(state, action.direction);
    case 'step':
      return stepNote(state, action.steps);
    case 'octave':
      return octaveNote(state, action.octaves);
    case 'duration':
      return setDuration(state, action.duration, false);
    case 'dot':
      return toggleDot(state);
    case 'accidental':
      return setAccidental(state, action.accidental);
    case 'tie':
      return toggleTie(state);
    case 'undo':
      return undo(state);
    case 'redo':
      return redo(state);
    case 'tap':
      return tap(state, action.at, action.step);
    case 'string':
      return setString(state, action.string);
    case 'finger':
      return setFinger(state, action.finger);
    case 'suggested':
      return clearPlacement(state);
    case 'title':
      return setTitle(state, action.title);
    case 'bpm':
      return setBpm(state, action.bpm);
    case 'key':
      return setKey(state, action.key);
    case 'time':
      return setTimeSignature(state, action.timeSignature);
    case 'reset':
      return createEditor();
  }
}

/** Atalho do teclado na pauta: a ação, `listen` (Espaço) ou nada. Teclas com Alt ficam para o navegador. */
export function keyAction(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): EditorAction | 'listen' | null {
  const { key, shiftKey, altKey } = event;
  const command = event.ctrlKey || event.metaKey;
  if (altKey) return null;
  if (command) {
    const lower = key.toLowerCase();
    if (lower === 'z') return { type: shiftKey ? 'redo' : 'undo' };
    if (lower === 'y') return { type: 'redo' };
    return null;
  }
  if (/^[a-g]$/i.test(key)) return { type: 'letter', letter: key.toUpperCase() as Letter };
  if (/^[1-5]$/.test(key)) return { type: 'duration', duration: DURATIONS[Number(key) - 1] };
  switch (key) {
    case '.':
      return { type: 'dot' };
    case '0':
      return { type: 'rest' };
    case 'l':
    case 'L':
      return { type: 'tie' };
    case '+':
      return { type: 'accidental', accidental: 'sharp' };
    case '-':
      return { type: 'accidental', accidental: 'flat' };
    case '=':
      return { type: 'accidental', accidental: 'natural' };
    case 'ArrowLeft':
      return { type: 'move', direction: -1 };
    case 'ArrowRight':
      return { type: 'move', direction: 1 };
    case 'ArrowUp':
      return shiftKey ? { type: 'octave', octaves: 1 } : { type: 'step', steps: 1 };
    case 'ArrowDown':
      return shiftKey ? { type: 'octave', octaves: -1 } : { type: 'step', steps: -1 };
    case 'Delete':
    case 'Backspace':
      return { type: 'delete' };
    case ' ':
      return 'listen';
    default:
      return null;
  }
}

/** "salvo agora" no aparelho, ou o aviso de que o aparelho não guardou. */
export type DraftStatus = 'empty' | 'saved' | 'unsaved';

const DRAFT_DELAY_MS = 400;

/**
 * O editor da tela: começa do rascunho do aparelho (ou vazio) e grava o rascunho a cada mudança, um instante depois
 * da última (digitar o título não grava letra por letra). `dispatch` é a entrada única, inclusive para o ditado.
 */
export function useScoreEditor() {
  const [state, dispatch] = React.useReducer(editorReducer, undefined, () => loadDraft() ?? createEditor());
  const [draft, setDraft] = React.useState<DraftStatus>(() => (state.doc.notes.length ? 'saved' : 'empty'));
  const first = React.useRef(true);
  /** Documento mudado e ainda não gravado: sair da tela ou do app grava na hora. */
  const pending = React.useRef<EditorState['doc'] | null>(null);
  const current = React.useRef(state.doc);

  React.useEffect(() => {
    current.current = state.doc;
    if (first.current) {
      first.current = false;
      return;
    }
    const doc = state.doc;
    pending.current = doc;
    const timer = setTimeout(() => {
      // Salvo na biblioteca antes do instante: discardDraft já tirou o rascunho
      if (pending.current !== doc) return;
      pending.current = null;
      setDraft(saveDraft(doc) ? 'saved' : 'unsaved');
    }, DRAFT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.doc]);

  /**
   * A música foi salva na biblioteca: o rascunho sai, inclusive o que ainda ia ser gravado (salvar logo depois de
   * escrever o traria de volta, e o próximo ditado entraria depois dele). Se a pessoa mudou algo durante o salvar, fica.
   */
  const discardDraft = React.useCallback((saved: EditorState['doc']) => {
    if (current.current !== saved) return;
    pending.current = null;
    clearDraft();
  }, []);

  React.useEffect(() => {
    const flush = () => {
      if (pending.current) saveDraft(pending.current);
      pending.current = null;
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  return { state, dispatch, draft, discardDraft };
}
