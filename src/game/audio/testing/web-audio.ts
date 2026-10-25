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

export class FakeAudioBuffer {
  private readonly data: Float32Array;
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
  copyToChannel(source: Float32Array): void {
    this.data.set(source.subarray(0, this.length));
  }
}

export class FakeBufferSource extends FakeNode {
  buffer: FakeAudioBuffer | null = null;
  startTime: number | null = null;
  start(when = 0): void {
    this.startTime = when;
  }
  stop(): void {}
}

export class FakeAudioContext {
  readonly destination = new FakeNode();
  readonly latencyHint: AudioContextOptions['latencyHint'];
  readonly sampleRate: number;
  readonly sources: FakeBufferSource[] = [];
  state: AudioContextState = 'suspended';
  currentTime = 0;

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

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
  }

  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource(this);
    this.sources.push(source);
    return source;
  }
}
