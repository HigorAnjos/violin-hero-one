/** O IndexedDB do app: as músicas guardadas e a fila de partidas, as duas por usuário. */
export const DEVICE_DB_NAME = 'violin-hero';
/**
 * 2: as músicas ganham o dono na chave e entra a fila de partidas. A versão 1 não sabia de quem era cada música:
 * o store some e volta a encher na próxima vez com rede (Decisões).
 */
export const DEVICE_DB_VERSION = 2;
export const SONGS_STORE = 'songs';
export const PLAYS_STORE = 'plays';
/** Índice por dono nos dois stores. */
export const BY_USER = 'userId';

export const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

function upgrade(db: IDBDatabase) {
  if (db.objectStoreNames.contains(SONGS_STORE)) db.deleteObjectStore(SONGS_STORE);
  db.createObjectStore(SONGS_STORE, { keyPath: ['userId', 'id', 'level'] }).createIndex(BY_USER, 'userId');
  if (!db.objectStoreNames.contains(PLAYS_STORE)) {
    db.createObjectStore(PLAYS_STORE, { keyPath: ['userId', 'clientId'] }).createIndex(BY_USER, 'userId');
  }
}

export type DeviceDb = <T>(store: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => Promise<T>;

/** Aberto só no primeiro uso. Sem IndexedDB (aba anônima de alguns navegadores), cada operação falha e quem chama segue sem. */
export function deviceDb(factory: IDBFactory): DeviceDb {
  let opening: Promise<IDBDatabase> | null = null;
  const db = () => {
    if (!opening) {
      const request = factory.open(DEVICE_DB_NAME, DEVICE_DB_VERSION);
      request.onupgradeneeded = (event) => {
        if (event.oldVersion < DEVICE_DB_VERSION) upgrade(request.result);
      };
      opening = done(request);
      // Outra aba com a versão nova: esta fecha a antiga para não travar a atualização
      opening.then((open) => (open.onversionchange = () => open.close())).catch(() => (opening = null));
    }
    return opening;
  };
  return async (store, mode, action) => done(action((await db()).transaction(store, mode).objectStore(store)));
}
