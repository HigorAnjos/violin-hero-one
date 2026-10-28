import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditor, insertNote } from '../game/notation/editor';
import { adoptOrphanDraft, clearDraft, DRAFT_STORAGE_KEY, loadDraft, saveDraft } from './editorDraft';
import { USER_STORAGE_KEY } from './user';

describe('rascunho do editor', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('grava e volta o mesmo documento, um por usuário', () => {
    const state = insertNote(createEditor({ title: 'Minha' }), 62);
    expect(saveDraft(state.doc, 'u1')).toBe(true);
    expect(loadDraft('u1')?.doc).toEqual(state.doc);
    expect(loadDraft('u2')).toBeNull();
    clearDraft('u1');
    expect(loadDraft('u1')).toBeNull();
  });

  it('sem usuário escolhido, vale o da vez (vh:usuario)', () => {
    localStorage.setItem(USER_STORAGE_KEY, 'u9');
    saveDraft(createEditor({ title: 'X' }).doc);
    expect(localStorage.getItem(`${DRAFT_STORAGE_KEY}:u9`)).toContain('"title":"X"');
    expect(loadDraft()?.doc.meta.title).toBe('X');
  });

  it('o rascunho sem dono vai para o primeiro usuário; o que ele já tinha fica', () => {
    saveDraft(createEditor({ title: 'Sem dono' }).doc, null);
    adoptOrphanDraft('u1');
    expect(loadDraft('u1')?.doc.meta.title).toBe('Sem dono');
    expect(loadDraft(null)).toBeNull();
    saveDraft(createEditor({ title: 'Outro' }).doc, null);
    adoptOrphanDraft('u1');
    expect(loadDraft('u1')?.doc.meta.title).toBe('Sem dono');
    expect(loadDraft(null)).toBeNull();
  });

  it('lixo no armazenamento vira null, sem lançar', () => {
    localStorage.setItem(`${DRAFT_STORAGE_KEY}:u1`, '{quebrado');
    expect(loadDraft('u1')).toBeNull();
    localStorage.setItem(`${DRAFT_STORAGE_KEY}:u1`, JSON.stringify({ meta: { key: 'X' }, notes: [], measures: 1 }));
    expect(loadDraft('u1')).toBeNull();
  });

  it('aparelho sem espaço: saveDraft devolve false', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError');
    });
    expect(saveDraft(createEditor().doc, 'u1')).toBe(false);
  });
});
