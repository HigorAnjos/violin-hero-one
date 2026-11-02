import { describe, expect, it } from 'vitest';
import { clock } from '../components/SubmissionPlayer/SubmissionPlayer';
import {
  audioGoneText,
  centsText,
  dueAtFromDate,
  dueText,
  formatClassCode,
  hardestString,
  instructionOf,
  sentText,
  signedCents,
  taskState,
} from './teacherText';

const at = (s: string) => new Date(s).getTime();

describe('textos da área do professor', () => {
  it('código da turma em dois blocos', () => {
    expect(formatClassCode('ABCDEFGH')).toBe('ABCD-EFGH');
    expect(formatClassCode('ABC')).toBe('ABC');
  });

  it('prazo: dia da semana e data; vencido, encerrada', () => {
    const now = at('2026-10-19T10:00:00');
    expect(dueText({ dueAt: new Date(at('2026-10-23T23:59:00')).toISOString(), closed: false }, now)).toBe('até sex, 23/10');
    expect(dueText({ dueAt: new Date(at('2026-10-18T23:59:00')).toISOString(), closed: false }, now)).toBe('encerrada');
    expect(dueText({ dueAt: new Date(at('2026-10-23T23:59:00')).toISOString(), closed: true }, now)).toBe('encerrada');
  });

  it('prazo do campo de data vai até o fim do dia', () => {
    const due = new Date(dueAtFromDate('2026-10-23'));
    expect([due.getDate(), due.getHours(), due.getMinutes()]).toEqual([23, 23, 59]);
  });

  it('chegada: hora hoje, ontem, data antes', () => {
    const now = at('2026-10-19T18:00:00');
    expect(sentText(new Date(at('2026-10-19T16:40:00')).toISOString(), now)).toBe('16:40');
    expect(sentText(new Date(at('2026-10-18T09:00:00')).toISOString(), now)).toBe('ontem');
    expect(sentText(new Date(at('2026-10-10T09:00:00')).toISOString(), now)).toBe('10/10');
  });

  it('afinação: média, por corda com sinal e a corda mais difícil', () => {
    expect([centsText(11.4), centsText(null)]).toEqual(['±11 ¢', '—']);
    expect([signedCents(6.4), signedCents(-14), signedCents(0.2), signedCents(null)]).toEqual(['+6 ¢', '−14 ¢', '0 ¢', '—']);
    expect(hardestString([-3, 6, -14, 9])).toEqual({ string: 'A', side: 'baixa' });
    expect(hardestString([1, -2, null, 4])).toBeNull();
    expect(hardestString(undefined)).toBeNull();
  });

  it('situação do aluno na tarefa', () => {
    const base = { best: null, submission: null, review: null };
    const play = { playId: 'p', score: 1, accuracy: 1, playedAt: 'x' };
    const sub = { id: 's', playId: 'p', score: 1, accuracy: 1, submittedAt: 'x', audioPath: null, audioDeleted: false };
    expect(taskState(base)).toBe('missing');
    expect(taskState({ ...base, best: play })).toBe('played');
    expect(taskState({ ...base, best: play, submission: sub })).toBe('to-review');
    expect(taskState({ best: play, submission: sub, review: { grade: 5, concept: null, comment: '', reviewedAt: 'x' } })).toBe('reviewed');
  });

  it('instrução, retenção do áudio e relógio', () => {
    expect(instructionOf({ instructionKey: 'atencao-ritmo', instructionText: null })).toBe('Preste atenção no ritmo.');
    expect(instructionOf({ instructionKey: null, instructionText: 'Duas vezes' })).toBe('Duas vezes');
    expect(audioGoneText(null)).toMatch(/30 dias depois da sua revisão/);
    expect(audioGoneText('2026-10-01T12:00:00Z')).toBe('O áudio será apagado em 31/10/2026, 30 dias depois da revisão.');
    expect([clock(29_400), clock(48_000), clock(-5)]).toEqual(['0:29', '0:48', '0:00']);
  });
});
