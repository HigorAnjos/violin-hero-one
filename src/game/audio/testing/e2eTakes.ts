/** As gravações que o e2e põe no lugar do microfone: os nomes são os mesmos das reais em e2e/audio/. */
import type { Issue } from '../../engine/types';
import type { Song } from '../../notation/song';
import { renderOpenStrings, renderSilence, renderSong, renderTv, type NoteSlip } from './songAudio';

/** LEAD_SECONDS da partida (2 s do context.currentTime no começo ao primeiro tempo) mais a latência padrão sem calibração (0,1 s). */
export const TAKE_LEAD_IN_SECONDS = 2.1;

/**
 * Os 3 erros da Ode, longe uns dos outros e de notas vizinhas iguais:
 * - ataque 10 (compasso 3, Mi): sai Sol, 3 semitons acima — nota errada;
 * - ataque 27 (compasso 8, Mi pontuado, 0,9 s): entra 260 ms atrasado — além da janela Bom (220 ms) e antes de a
 *   nota expirar sem tentativa (~300 ms: Bom + EXPIRY_SLACK − atraso de detecção), que viraria "não tocada";
 * - ataque 46 (compasso 12, Lá de 2 tempos): 62 ¢ alto — fora da tolerância (50 ¢), mas antes de virar outra nota (75 ¢).
 */
export const ODE_SLIPS: Readonly<Record<number, NoteSlip>> = {
  10: { semitones: 3 },
  27: { offsetMs: 260 },
  46: { cents: 62 },
};

export const ODE_SLIP_ISSUES: Readonly<Record<number, Issue>> = { 10: 'wrong-note', 27: 'late', 46: 'sharp' };

export const VIBRATO_CENTS = 25;

export type TakeName =
  | 'cordas-soltas'
  | 'escala-re-maior'
  | 'escala-re-maior-vibrato'
  | 'ode-a-alegria'
  | 'ode-a-alegria-3-erros'
  | 'silencio'
  | 'tv';

export interface Take {
  name: TakeName;
  render(): Float32Array;
}

export function e2eTakes(song: (id: string) => Song): Take[] {
  const lead = { leadInSeconds: TAKE_LEAD_IN_SECONDS };
  return [
    { name: 'cordas-soltas', render: () => renderOpenStrings() },
    { name: 'escala-re-maior', render: () => renderSong(song('escala-re-maior'), lead) },
    { name: 'escala-re-maior-vibrato', render: () => renderSong(song('escala-re-maior'), { ...lead, vibratoCents: VIBRATO_CENTS }) },
    { name: 'ode-a-alegria', render: () => renderSong(song('ode-a-alegria'), lead) },
    { name: 'ode-a-alegria-3-erros', render: () => renderSong(song('ode-a-alegria'), { ...lead, slips: ODE_SLIPS }) },
    { name: 'silencio', render: () => renderSilence(10) },
    { name: 'tv', render: () => renderTv(10) },
  ];
}
