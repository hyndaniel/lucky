// 测试环境：localStorage / sessionStorage 不可用时挂上基于 Map 的内存实现。
// node 自带的 Web Storage 是实验特性：未指定 --localstorage-file 时 localStorage 不可用，且一访问就打印告警，
// 所以没有 DOM（window）时不去探测，直接视为不可用。

type StorageName = 'localStorage' | 'sessionStorage';

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  const storage = {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(String(key)) ?? null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(String(key));
    },
    setItem(key: string, value: string) {
      data.set(String(key), String(value));
    },
  };
  return storage as Storage;
}

function isUsable(name: StorageName): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const storage = (globalThis as Record<string, unknown>)[name] as Storage | undefined;
    if (!storage || typeof storage.getItem !== 'function') return false;
    const probe = '__lucky_storage_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (!isUsable(name)) {
    Object.defineProperty(globalThis, name, {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}
