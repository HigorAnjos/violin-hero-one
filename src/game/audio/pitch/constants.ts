export const DEFAULT_MIN_CLARITY = 0.9;
export const MEDIAN_WINDOW = 5;
export const HOP_SECONDS = 0.01;
/** Uma nota sustentada troca na hora além desta distância; mais perto, só quando o centro lento (~150 ms) cruza ±50. */
export const SWITCH_NOW_CENTS = 80;
/**
 * Corte do passa-alta de 4ª ordem antes da detecção: o acompanhamento vive abaixo do Sol3 (~197 Hz) e o vazamento
 * pelo alto-falante derruba a clareza McLeod abaixo do gate; o Sol3 perde ~1 dB.
 */
export const HIGH_PASS_HZ = 170;
