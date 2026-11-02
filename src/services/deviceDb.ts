/** O IndexedDB do app: as músicas guardadas, a fila de partidas e a de gravações, todas por usuário. */
export const DEVICE_DB_NAME = 'violin-hero';
/**
 * 2: as músicas ganham o dono na chave e entra a fila de partidas. A versão 1 não sabia de quem era cada música:
 * o store some e volta a encher na próxima vez com rede (Decisões).
 * 3: entra a fila de gravações das entregas (recordingUpload.ts).
 */
export const DEVICE_DB_VERSION = 3;
export const SONGS_STORE = 'songs';
export const PLAYS_STORE = 'plays';
export const RECORDINGS_STORE = 'recordings';
/** Índice por dono em todos os stores. */
export const BY_USER = 'userId';

export const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** Cada passo só roda vindo de antes dele: a v3 não pode apagar de novo as músicas guardadas na v2. */
function upgrade(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 2) {
    if (db.objectStoreNames.contains(SONGS_STORE)) db.deleteObjectStore(SONGS_STORE);
    db.createObjectStore(SONGS_STORE, { keyPath: ['userId', 'id', 'level'] }).createIndex(BY_USER, 'userId');
    db.createObjectStore(PLAYS_STORE, { keyPath: ['userId', 'clientId'] }).createIndex(BY_USER, 'userId');
  }
  if (oldVersion < 3) {
    db.createObjectStore(RECORDINGS_STORE, { keyPath: ['userId', 'id'] }).createIndex(BY_USER, 'userId');
  }
}

export type DeviceDb = <T>(store: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => Promise<T>;

/** Aberto só no primeiro uso. Sem IndexedDB (aba anônima de alguns navegadores), cada operação falha e quem chama segue sem. */
export function deviceDb(factory: IDBFactory): DeviceDb {
  let opening: Promise<IDBDatabase> | null = null;
  const db = () => {
    if (!opening) {
      const request = factory.open(DEVICE_DB_NAME, DEVICE_DB_VERSION);
      request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion);
      opening = done(request);
      // Outra aba com a versão nova: esta fecha a antiga para não travar a atualização
      opening.then((open) => (open.onversionchange = () => open.close())).catch(() => (opening = null));
    }
    return opening;
  };
  return async (store, mode, action) => done(action((await db()).transaction(store, mode).objectStore(store)));
}
