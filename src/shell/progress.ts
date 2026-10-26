import React from 'react';
import type { BadgeId } from '../game/engine';
import type { PlayerLevel } from '../game/engine/levels';
import { loadEarnedBadges } from '../services/badges';
import { loadLocalProfile, type Animal } from '../services/profile';
import { loadRecords, type RecordEntry } from './records';

/** O que a tela de Perfil mostra: quem é o jogador e o que ele já fez. */
export interface Progress {
  nickname: string | null;
  animal: Animal | null;
  level: PlayerLevel | null;
  /** Do maior para o menor. */
  records: RecordEntry[];
  badges: BadgeId[];
}

/** Hoje, tudo do aparelho: vh:profile, vh:recordes e vh:badges. */
export function loadLocalProgress(): Progress {
  const profile = loadLocalProfile();
  return {
    nickname: profile.nickname ?? null,
    animal: profile.animal ?? null,
    level: profile.level ?? null,
    records: loadRecords(),
    badges: loadEarnedBadges(),
  };
}

/**
 * Único ponto de leitura do progresso para as telas. A sincronização troca a fonte aqui (perfil, recordes e selos do
 * servidor) sem mexer no Perfil.
 */
export function useProgress(): Progress {
  const [progress] = React.useState(loadLocalProgress);
  return progress;
}
