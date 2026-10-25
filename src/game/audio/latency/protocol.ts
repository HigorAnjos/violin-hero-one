import type { Attack } from './types';

export const ATTACK_PROCESSOR_NAME = 'violin-hero-attack';

export interface AttackProcessorOptions {
  a4: number;
}

export type FromAttackProcessor = Attack;
