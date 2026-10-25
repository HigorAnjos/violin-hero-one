import type { Level } from '../notation/song';
import { DEFAULT_TOLERANCE_CENTS, DEFAULT_WINDOWS } from './score';
import type { TimingWindows } from './types';

/** Mesmos valores do enum violinhero.player_level (profiles.level), na ordem do OnboardLevel. */
export const PLAYER_LEVELS = ['never', 'beginner', 'some_songs', 'years'] as const;
export type PlayerLevel = (typeof PLAYER_LEVELS)[number];

export interface LevelSettings {
  /** Desvio máximo, em cents, para a nota contar como certa (EngineOptions.toleranceCents). */
  toleranceCents: number;
  /** Janelas de tempo, em ms (EngineOptions.windows). */
  windows: TimingWindows;
  /** Fração do andamento da música na primeira partida: bpm = song.bpm × tempoFactor. */
  tempoFactor: number;
  /** Segundos em que a nota desce pela pista antes da linha de acerto (a pista hoje usa 2 s fixos). */
  trackLeadSeconds: number;
  /** Nível de chart sugerido na biblioteca. */
  chartLevel: Level;
  /** Id da música inicial, uma das fixas. */
  firstSongId: string;
}

export const LEVEL_SETTINGS: Readonly<Record<PlayerLevel, LevelSettings>> = {
  never: {
    toleranceCents: 60,
    windows: { perfect: 100, great: 170, good: 280 },
    tempoFactor: 0.7,
    trackLeadSeconds: 3,
    chartLevel: 'easy',
    firstSongId: 'escala-re-maior',
  },
  beginner: {
    toleranceCents: 55,
    windows: { perfect: 85, great: 150, good: 250 },
    tempoFactor: 0.85,
    trackLeadSeconds: 2.5,
    chartLevel: 'easy',
    firstSongId: 'brilha-brilha-estrelinha',
  },
  some_songs: {
    toleranceCents: DEFAULT_TOLERANCE_CENTS,
    windows: DEFAULT_WINDOWS,
    tempoFactor: 1,
    trackLeadSeconds: 2,
    chartLevel: 'medium',
    firstSongId: 'ode-a-alegria',
  },
  years: {
    toleranceCents: 40,
    windows: { perfect: 55, great: 105, good: 180 },
    tempoFactor: 1,
    trackLeadSeconds: 1.75,
    chartLevel: 'hard',
    firstSongId: 'ode-a-alegria',
  },
};

export function levelSettings(level: PlayerLevel): LevelSettings {
  return LEVEL_SETTINGS[level];
}

const CHART_LABEL: Record<Level, string> = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };

export interface LevelSummaryLine {
  label: string;
  value: string;
}

/**
 * As linhas curtas do cartão "Você vai começar com" do OnboardLevel. `titleOf` dá o título da música pelo id (hoje
 * findFixedSong; o Motor não importa o catálogo, que traz JSON no bundle e não carrega no Node do e2e).
 */
export function levelSummary(level: PlayerLevel, titleOf: (songId: string) => string | undefined): LevelSummaryLine[] {
  const s = LEVEL_SETTINGS[level];
  return [
    { label: 'Primeira música', value: titleOf(s.firstSongId) ?? s.firstSongId },
    { label: 'Andamento', value: s.tempoFactor === 1 ? 'o da música' : `${Math.round(s.tempoFactor * 100)}% da música` },
    { label: 'Afinação', value: `até ${s.toleranceCents} ¢ de folga` },
    { label: 'Tempo', value: `até ${s.windows.good} ms de folga` },
    { label: 'Dificuldade', value: CHART_LABEL[s.chartLevel] },
  ];
}
