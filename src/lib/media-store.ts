// 奖品图片与自定义音频的 Blob 存储（IndexedDB）。元数据在 zustand store，这里只按 key 存取二进制。
// 后台与大屏是同源的两个窗口：共享 IndexedDB，但各自有一份连接与 URL 缓存。
// 模块顶层不访问 indexedDB，node 下可安全 import；所有失败以 rejected Promise 或 null/false 体现。

const DB_NAME = 'lucky-draw-media';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;
let availability: Promise<boolean> | null = null;
// key → object URL，只缓存命中的结果（另一个窗口稍后可能才写入）
const urlCache = new Map<string, string>();

// 惰性打开并复用连接；打开失败或连接关闭后清掉缓存，下次调用重新打开
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    // executor 内的同步异常（如访问 indexedDB 抛 SecurityError）会自动转成 reject
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    let settled = false;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        // 已因 blocked 判定失败，迟到的连接直接关掉
        db.close();
        return;
      }
      settled = true;
      const drop = () => {
        if (dbPromise === opening) dbPromise = null;
      };
      db.onclose = drop;
      db.onversionchange = () => {
        db.close();
        drop();
      };
      resolve(db);
    };
    request.onerror = () => {
      settled = true;
      reject(request.error ?? new Error('打开 IndexedDB 失败'));
    };
    request.onblocked = () => {
      settled = true;
      reject(new Error('打开 IndexedDB 被其他连接阻塞'));
    };
  });
  dbPromise = opening;
  opening.catch(() => {
    if (dbPromise === opening) dbPromise = null;
  });
  return opening;
}

// 在单个事务里执行操作，事务提交完成后 resolve（run 返回的请求结果，没有则 undefined）
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = run(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 操作失败'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 操作被中止'));
  });
}

function forgetUrl(key: string): void {
  const url = urlCache.get(key);
  if (url === undefined) return;
  URL.revokeObjectURL(url);
  urlCache.delete(key);
}

// 能否打开数据库；结果只探测一次。永不 reject
export function isMediaStoreAvailable(): Promise<boolean> {
  availability ??= openDb().then(
    () => true,
    () => false,
  );
  return availability;
}

export async function putMedia(key: string, blob: Blob): Promise<void> {
  await withStore('readwrite', (store) => store.put(blob, key));
  // 同 key 被覆盖时，本窗口旧的 URL 作废
  forgetUrl(key);
}

export function getMedia(key: string): Promise<Blob | undefined> {
  return withStore<Blob>('readonly', (store) => store.get(key));
}

// 同时 revoke 本窗口已缓存的 object URL
export async function deleteMedia(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  keys.forEach(forgetUrl);
  await withStore('readwrite', (store) => {
    for (const key of keys) store.delete(key);
    return undefined;
  });
}

// 命中时缓存 object URL 并复用；缺失或失败返回 null（不缓存，之后可再次尝试）
export async function getMediaUrl(key: string): Promise<string | null> {
  const cached = urlCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const blob = await getMedia(key);
    if (!blob) return null;
    // 并发请求同一 key 时复用先写入的 URL，避免泄漏
    const existing = urlCache.get(key);
    if (existing !== undefined) return existing;
    const url = URL.createObjectURL(blob);
    urlCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}
