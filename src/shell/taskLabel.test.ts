import { describe, expect, it } from 'vitest';
import { MODE_NAMES, taskLabel, taskVariant } from './taskLabel';

describe('taskLabel', () => {
  it('junta música, nível e modo', () => {
    expect(taskLabel({ songTitle: 'Escala de Ré maior', level: 'easy', mode: 'arcade' })).toBe('Escala de Ré maior · Fácil · Arcade');
    expect(taskLabel({ songTitle: 'Escala de Ré maior', level: 'medium', mode: 'sheet' })).toBe('Escala de Ré maior · Médio · Partitura');
  });

  it('duas tarefas da mesma música em modos diferentes não saem iguais', () => {
    const a = taskLabel({ songTitle: 'Escala de Ré maior', level: 'easy', mode: 'arcade' });
    const b = taskLabel({ songTitle: 'Escala de Ré maior', level: 'easy', mode: 'strings3d' });
    expect(a).not.toBe(b);
    expect(b).toBe('Escala de Ré maior · Fácil · Cordas 3D');
  });

  it('a variante é só nível e modo, e cobre todo modo de tarefa', () => {
    expect(taskVariant({ level: 'hard', mode: 'strings3d' })).toBe('Difícil · Cordas 3D');
    expect(Object.keys(MODE_NAMES).sort()).toEqual(['arcade', 'sheet', 'strings3d']);
  });
});
