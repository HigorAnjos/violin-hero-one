import type { LaunchOptions } from '@playwright/test';

/**
 * Saída de áudio falsa, no relógio do sistema. A hora da partida é o currentTime do AudioContext: na placa de som real
 * (PipeWire/Pulse) ele deriva e chega a parar sob carga, com vários workers e aparelhos abrindo áudio ao mesmo tempo, e
 * a partida em tempo real não termina. Também não toca nada nos alto-falantes.
 */
export const FAKE_AUDIO_OUTPUT = '--disable-audio-output';

/** O launchOptions de um spec que precisa de flags próprias: o test.use troca o do config inteiro, então a saída falsa vai junto. */
export const launchWith = (...args: string[]): LaunchOptions => ({ args: [...args, FAKE_AUDIO_OUTPUT] });
