import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditor, insertNote, stepMidi } from '../game/notation/editor';
import { loadDraft, saveDraft } from '../services/editorDraft';
import { editorReducer, keyAction, useScoreEditor } from './useScoreEditor';

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) =>
  keyAction({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('atalhos do editor', () => {
  it('letras, figuras, ponto, pausa, setas e apagar', () => {
    expect(key('d')).toEqual({ type: 'letter', letter: 'D' });
    expect(key('G')).toEqual({ type: 'letter', letter: 'G' });
    expect(key('h')).toBeNull();
    expect(key('1')).toEqual({ type: 'duration', duration: 4 });
    expect(key('5')).toEqual({ type: 'duration', duration: 0.25 });
    expect(key('6')).toBeNull();
    expect(key('.')).toEqual({ type: 'dot' });
    expect(key('0')).toEqual({ type: 'rest' });
    expect(key('ArrowRight')).toEqual({ type: 'move', direction: 1 });
    expect(key('ArrowUp')).toEqual({ type: 'step', steps: 1 });
    expect(key('ArrowDown', { shiftKey: true })).toEqual({ type: 'octave', octaves: -1 });
    expect(key('Delete')).toEqual({ type: 'delete' });
    expect(key('Backspace')).toEqual({ type: 'delete' });
    expect(key(' ')).toBe('listen');
  });

  it('Ctrl+Z desfaz, Ctrl+Shift+Z e Ctrl+Y refazem (Cmd no Mac); Alt fica para o navegador', () => {
    expect(key('z', { ctrlKey: true })).toEqual({ type: 'undo' });
    expect(key('Z', { ctrlKey: true, shiftKey: true })).toEqual({ type: 'redo' });
    expect(key('z', { metaKey: true })).toEqual({ type: 'undo' });
    expect(key('y', { ctrlKey: true })).toEqual({ type: 'redo' });
    expect(key('c', { ctrlKey: true })).toBeNull();
    expect(key('d', { altKey: true })).toBeNull();
  });
});

describe('editorReducer', () => {
  it('toque na pauta escreve a altura tocada; tocar de novo na mesma nota só seleciona', () => {
    let state = editorReducer(createEditor(), { type: 'tap', at: 1.2, step: 31 });
    expect(state.doc.notes).toEqual([{ at: 1, length: 1, midi: stepMidi('D major', 31) }]);
    expect(state.cursor).toBe(2);
    state = editorReducer(state, { type: 'tap', at: 1.4, step: 31 });
    expect(state.cursor).toBe(1);
    expect(state.doc.notes).toHaveLength(1);
    state = editorReducer(state, { type: 'tap', at: 1.4, step: 33 });
    expect(state.doc.notes.map((n) => n.midi)).toEqual([stepMidi('D major', 33)]);
  });

  it('a entrada por API é a mesma do teclado', () => {
    const viaApi = editorReducer(createEditor(), { type: 'note', midi: 62 });
    const viaKey = editorReducer(createEditor(), { type: 'letter', letter: 'D' });
    expect(viaApi.doc).toEqual(viaKey.doc);
    expect(editorReducer(viaApi, { type: 'reset' }).doc.notes).toEqual([]);
  });
});

describe('useScoreEditor', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('abre do rascunho e grava o rascunho um instante depois da mudança', () => {
    vi.useFakeTimers();
    saveDraft(insertNote(createEditor({ title: 'Antes' }), 62).doc);
    const { result } = renderHook(() => useScoreEditor());
    expect(result.current.state.doc.meta.title).toBe('Antes');
    expect(result.current.draft).toBe('saved');
    act(() => result.current.dispatch({ type: 'title', title: 'Depois' }));
    expect(loadDraft()?.doc.meta.title).toBe('Antes');
    act(() => void vi.advanceTimersByTime(500));
    expect(loadDraft()?.doc.meta.title).toBe('Depois');
  });

  it('descartar o rascunho do que foi salvo cancela a gravação que ainda vinha', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useScoreEditor());
    act(() => result.current.dispatch({ type: 'note', midi: 62 }));
    act(() => result.current.discardDraft(result.current.state.doc));
    act(() => void vi.advanceTimersByTime(500));
    expect(loadDraft()).toBeNull();
    unmount();
    expect(loadDraft()).toBeNull();
  });

  it('o que mudou durante o salvar continua no rascunho', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScoreEditor());
    act(() => result.current.dispatch({ type: 'note', midi: 62 }));
    const saved = result.current.state.doc;
    act(() => result.current.dispatch({ type: 'note', midi: 64 }));
    act(() => result.current.discardDraft(saved));
    act(() => void vi.advanceTimersByTime(500));
    expect(loadDraft()?.doc.notes.map((n) => n.midi)).toEqual([62, 64]);
  });

  it('sair da tela antes do instante grava na hora', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useScoreEditor());
    expect(result.current.draft).toBe('empty');
    act(() => result.current.dispatch({ type: 'note', midi: 69 }));
    unmount();
    expect(loadDraft()?.doc.notes.map((n) => n.midi)).toEqual([69]);
  });
});
