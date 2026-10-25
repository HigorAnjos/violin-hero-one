/** Web Audio de mentira para os testes do Ouvido (o jsdom não tem). */
export class FakeNode {
  readonly connections = new Set<unknown>();
  constructor(readonly context?: unknown) {}
  connect<T>(destination: T): T {
    this.connections.add(destination);
    return destination;
  }
  disconnect(destination?: unknown): void {
    if (destination === undefined) this.connections.clear();
    else this.connections.delete(destination);
  }
}

export class FakeMediaStreamSource extends FakeNode {
  constructor(
    context: unknown,
    readonly mediaStream: MediaStream,
  ) {
    super(context);
  }
}

export class FakeAudioContext {
  readonly destination = new FakeNode();
  readonly latencyHint: AudioContextOptions['latencyHint'];
  readonly sampleRate: number;
  state: AudioContextState = 'suspended';

  constructor(options: AudioContextOptions = {}) {
    this.sampleRate = options.sampleRate ?? 48000;
    this.latencyHint = options.latencyHint;
  }

  async resume(): Promise<void> {
    if (this.state !== 'closed') this.state = 'running';
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }

  createMediaStreamSource(stream: MediaStream): FakeMediaStreamSource {
    return new FakeMediaStreamSource(this, stream);
  }
}
