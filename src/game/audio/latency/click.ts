export const CLICK_HZ = 3520;
const SIGMA_SECONDS = 0.001;
/** O envelope tem o pico este tempo depois do instante agendado; o clique dura o dobro. */
export const CLICK_PEAK_SECONDS = 4 * SIGMA_SECONDS;

/**
 * Um Lá7 curto (três oitavas acima da corda Lá) com envelope gaussiano (σ 1 ms). O gaussiano mantém o espectro perto de
 * 3520 Hz, então o vazamento no microfone não põe energia na banda do Lá que o detector de ataque escuta; uma borda
 * abrupta espalha até 442 Hz e dispara ataques falsos.
 */
export function renderClick(sampleRate: number, peak = 0.7): Float32Array<ArrayBuffer> {
  const length = Math.round(2 * CLICK_PEAK_SECONDS * sampleRate);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-0.5 * ((t - CLICK_PEAK_SECONDS) / SIGMA_SECONDS) ** 2);
    out[i] = peak * envelope * Math.sin(2 * Math.PI * CLICK_HZ * t);
  }
  return out;
}

export function createClickBuffer(context: BaseAudioContext, peak?: number): AudioBuffer {
  const samples = renderClick(context.sampleRate, peak);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

/** Toca um clique por instante, com o pico (o tempo que o jogador ouve) no instante. Devolve quem silencia os pendentes. */
export function scheduleClicks(
  context: BaseAudioContext,
  times: readonly number[],
  destination: AudioNode = context.destination,
): () => void {
  const buffer = createClickBuffer(context);
  const sources = times.map((time) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    source.start(Math.max(0, time - CLICK_PEAK_SECONDS));
    return source;
  });
  return () => {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // stop() lança num source que nunca começou: não há o que silenciar.
      }
      source.disconnect();
    }
  };
}
