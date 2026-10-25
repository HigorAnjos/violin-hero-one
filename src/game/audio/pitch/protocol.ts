import type { PitchReading } from '../types';

export const PROCESSOR_NAME = 'violin-hero-pitch';

export interface ProcessorOptions {
  a4: number;
  minClarity: number;
}

export type ToProcessor = { type: 'a4'; a4: number };

export type FromProcessor = PitchReading | null;
