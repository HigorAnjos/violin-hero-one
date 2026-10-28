import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { RETRY_BASE_MS } from './playQueue';
import {
  createRecordingUploads,
  indexedDbRecordingQueueStore,
  memoryRecordingQueueStore,
  memoryUploadTarget,
  RecordingUploadError,
  UploadError,
  type RecordingQueueStore,
  type UploadItem,
} from './recordingUpload';
import type { SessionState } from './session';

const item = (id: string, bytes = 'som do violino'): UploadItem => ({
  id,
  blob: new Blob([bytes], { type: 'audio/webm;codecs=opus' }),
  mimeType: 'audio/webm;codecs=opus',
  durationMs: 12_000,
  meta: { task: 't1' },
});

const signedIn = (userId: string): SessionState => ({ status: 'signed-in', userId, anonymous: false });

function setup(store: RecordingQueueStore = memoryRecordingQueueStore()) {
  const target = memoryUploadTarget();
  let owner: string | null = 'aluno';
  let session: SessionState = signedIn('aluno');
  let net = true;
  let t = 1_000;
  const uploads = createRecordingUploads({
    store,
    user: () => owner,
    session: async () => session,
    target: () => target,
    online: () => net,
    now: () => t,
    log: () => undefined,
  });
  return {
    uploads,
    target,
    store,
    setOwner: (u: string | null) => (owner = u),
    setSession: (s: SessionState) => (session = s),
    setNet: (on: boolean) => (net = on),
    advance: (ms: number) => (t += ms),
    /** O que o destino guardou, como `dono/id`. */
    sent: () => [...target.files.keys()],
  };
}

const text = (blob: Blob) => blob.text();

describe('createRecordingUploads', () => {
  it('com rede, sobe na conta do dono com bytes, tipo, duração e meta', async () => {
    const f = setup();
    await f.uploads.enqueue(item('e1'));
    await f.uploads.flush();
    expect(f.sent()).toEqual(['aluno/e1']);
    const { item: up } = f.target.files.get('aluno/e1')!;
    expect(await text(up.blob)).toBe('som do violino');
    expect(up).toMatchObject({ mimeType: 'audio/webm;codecs=opus', durationMs: 12_000, meta: { task: 't1' } });
    expect(up.blob.type).toBe('audio/webm;codecs=opus');
    expect(await f.uploads.pending('aluno')).toBe(0);
    expect(f.uploads.status('e1')).toBe('sent');
  });

  it('sem rede fica na fila; a rede volta e sobe', async () => {
    const f = setup();
    f.setNet(false);
    await f.uploads.enqueue(item('e1'));
    await f.uploads.flush();
    expect(f.sent()).toEqual([]);
    expect(await f.uploads.pending('aluno')).toBe(1);
    expect(f.uploads.status('e1')).toBe('queued');
    expect(f.uploads.nextDelay()).toBeGreaterThan(0);
    f.setNet(true);
    await f.uploads.flush();
    expect(f.sent()).toEqual(['aluno/e1']);
    expect(f.uploads.nextDelay()).toBeNull();
  });

  it('a rede cai no meio (fetch falhou): a fila espera inteira, sem contar tentativa', async () => {
    const f = setup();
    f.target.fail('offline');
    await f.uploads.enqueue(item('e1'));
    await f.uploads.flush();
    expect((await f.store.all('aluno'))[0].attempts).toBe(0);
    f.target.fail(null);
    await f.uploads.flush();
    expect(f.sent()).toEqual(['aluno/e1']);
  });

  it('erro passageiro do destino: recua e tenta depois', async () => {
    const f = setup();
    f.target.fail('transient');
    await f.uploads.enqueue(item('e1'));
    await f.uploads.flush();
    expect((await f.store.all('aluno'))[0].attempts).toBe(1);
    f.target.fail(null);
    await f.uploads.flush();
    expect(f.sent()).toEqual([]);
    f.advance(RETRY_BASE_MS);
    await f.uploads.flush();
    expect(f.sent()).toEqual(['aluno/e1']);
  });

  it('recusa definitiva sai da fila e o status diz', async () => {
    const f = setup();
    f.target.fail('rejected');
    const changed = vi.fn();
    f.uploads.subscribe(changed);
    await f.uploads.enqueue(item('e1'));
    await f.uploads.flush();
    expect(await f.uploads.pending('aluno')).toBe(0);
    expect(f.uploads.status('e1')).toBe('rejected');
    expect(changed).toHaveBeenCalled();
  });

  it('erro qualquer do destino conta como sem rede: não perde a gravação', async () => {
    const f = setup();
    f.target.upload = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await f.uploads.enqueue(item('e1'));
    await f.uploads.flush();
    expect(await f.uploads.pending('aluno')).toBe(1);
  });

  it('troca de usuário não mistura: a gravação do aluno não sobe na sessão de outro', async () => {
    const f = setup();
    f.setNet(false);
    await f.uploads.enqueue(item('e1'));
    f.setNet(true);
    // Outro entrou no aparelho, mas a fila ainda é do aluno
    f.setSession(signedIn('professor'));
    await f.uploads.flush('aluno');
    f.setOwner('professor');
    await f.uploads.flush();
    expect(f.sent()).toEqual([]);
    expect(await f.uploads.pending('aluno')).toBe(1);
    expect(await f.uploads.pending('professor')).toBe(0);
    // O aluno volta: sobe na conta dele
    f.setSession(signedIn('aluno'));
    f.setOwner('aluno');
    await f.uploads.flush();
    expect(f.sent()).toEqual(['aluno/e1']);
  });

  it('cada usuário tem a sua fila; forget apaga só a dele', async () => {
    const f = setup();
    f.setNet(false);
    await f.uploads.enqueue(item('a1'));
    f.setOwner('outro');
    await f.uploads.enqueue(item('o1'));
    await f.uploads.forget('aluno');
    expect(await f.uploads.pending('aluno')).toBe(0);
    expect(await f.uploads.pending('outro')).toBe(1);
  });

  it('sem dono no aparelho, a gravação não entra na fila', async () => {
    const f = setup();
    f.setOwner(null);
    await expect(f.uploads.enqueue(item('e1'))).rejects.toThrow(/sem dono/);
    expect(await f.uploads.pending('')).toBe(0);
  });

  it('strict (troca de conta): ignora o recuo e lança com o que ficou', async () => {
    const f = setup();
    f.target.fail('transient');
    await f.uploads.enqueue(item('e1'));
    await f.uploads.enqueue(item('e2'));
    await expect(f.uploads.flush('aluno', { strict: true })).rejects.toThrow(RecordingUploadError);
    await expect(f.uploads.flush('aluno', { strict: true })).rejects.toThrow('2 gravações ainda não foram enviadas.');
    f.target.fail(null);
    await f.uploads.flush('aluno', { strict: true });
    expect(f.sent()).toEqual(['aluno/e1', 'aluno/e2']);
  });

  it('sem destino ainda: guarda e não sobe; strict avisa', async () => {
    const store = memoryRecordingQueueStore();
    const uploads = createRecordingUploads({
      store,
      user: () => 'aluno',
      session: async () => signedIn('aluno'),
      target: () => null,
      online: () => true,
    });
    await uploads.enqueue(item('e1'));
    await uploads.flush();
    expect(await uploads.pending('aluno')).toBe(1);
    await expect(uploads.flush('aluno', { strict: true })).rejects.toThrow('Uma gravação ainda não foi enviada.');
  });

  it('duas passadas ao mesmo tempo sobem a gravação uma vez só', async () => {
    const f = setup();
    f.setNet(false);
    await f.uploads.enqueue(item('e1'));
    f.setNet(true);
    const upload = vi.spyOn(f.target, 'upload');
    await Promise.all([f.uploads.flush(), f.uploads.flush()]);
    expect(upload).toHaveBeenCalledOnce();
  });
});

describe('fila de gravações no IndexedDB', () => {
  it('sobrevive a fechar o app: outra instância sobe o que ficou', async () => {
    const factory = new IDBFactory();
    const first = setup(indexedDbRecordingQueueStore(factory));
    first.setNet(false);
    await first.uploads.enqueue(item('e1', 'arco'));
    const second = setup(indexedDbRecordingQueueStore(factory));
    expect(await second.uploads.pending('aluno')).toBe(1);
    await second.uploads.flush();
    expect(second.sent()).toEqual(['aluno/e1']);
    expect(await text(second.target.files.get('aluno/e1')!.item.blob)).toBe('arco');
    expect(await second.uploads.pending('aluno')).toBe(0);
  });

  it('clear apaga só as do usuário', async () => {
    const store = indexedDbRecordingQueueStore(new IDBFactory());
    const base = { bytes: new ArrayBuffer(4), mimeType: 'audio/mp4', durationMs: 1, meta: {}, queuedAt: 0, attempts: 0, nextAt: 0 };
    await store.put({ ...base, userId: 'a', id: '1' });
    await store.put({ ...base, userId: 'b', id: '1' });
    await store.clear('a');
    expect(await store.all('a')).toEqual([]);
    expect((await store.all('b')).map((e) => e.id)).toEqual(['1']);
  });

  it('UploadError guarda o tipo', () => {
    expect(new UploadError('transient')).toMatchObject({ kind: 'transient', name: 'UploadError' });
  });
});
