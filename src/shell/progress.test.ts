import { afterEach, describe, expect, it } from 'vitest';
import { BADGES_STORAGE_KEY } from '../services/badges';
import { PROFILE_STORAGE_KEY } from '../services/profile';
import { loadLocalProgress } from './progress';
import { loadRecords, RECORDS_STORAGE_KEY } from './records';

afterEach(() => localStorage.clear());

describe('progresso local', () => {
  it('aparelho vazio: sem nome, bicho, nível, recordes nem selos', () => {
    expect(loadLocalProgress()).toEqual({ nickname: null, animal: null, level: null, records: [], badges: [] });
  });

  it('junta perfil, recordes e selos do aparelho', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ level: 'beginner', nickname: 'Lia', animal: 'fox' }));
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ 'ode:easy': 1200, 'minueto:medium': 5400 }));
    localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(['primeira-musica', 'nao-existe']));
    expect(loadLocalProgress()).toEqual({
      nickname: 'Lia',
      animal: 'fox',
      level: 'beginner',
      records: [
        { songId: 'minueto', level: 'medium', score: 5400 },
        { songId: 'ode', level: 'easy', score: 1200 },
      ],
      badges: ['primeira-musica'],
    });
  });

  it('recordes: id com dois-pontos funciona; nível desconhecido fica de fora', () => {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ 'banco:42:hard': 10, 'ode:facil': 3, 'x:easy': 'muito' }));
    expect(loadRecords()).toEqual([{ songId: 'banco:42', level: 'hard', score: 10 }]);
  });
});
