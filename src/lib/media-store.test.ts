import { describe, expect, it } from 'vitest';
import {
  deleteMedia,
  getMedia,
  getMediaUrl,
  isMediaStoreAvailable,
  putMedia,
} from '@/lib/media-store';

// node 没有 indexedDB：所有失败都应以 resolve false / null 或 rejected Promise 体现，不抛同步异常
describe('media-store（node 环境，无 IndexedDB）', () => {
  it('isMediaStoreAvailable resolve 为 false', async () => {
    await expect(isMediaStoreAvailable()).resolves.toBe(false);
  });

  it('isMediaStoreAvailable 结果被缓存为同一个 Promise', () => {
    expect(isMediaStoreAvailable()).toBe(isMediaStoreAvailable());
  });

  it('getMediaUrl 不可用时 resolve 为 null，不抛错', async () => {
    await expect(getMediaUrl('x')).resolves.toBeNull();
  });

  it('putMedia / getMedia 返回 rejected Promise，不抛同步异常', async () => {
    let put: Promise<void> | undefined;
    let get: Promise<Blob | undefined> | undefined;
    expect(() => {
      put = putMedia('x', new Blob(['a']));
      get = getMedia('x');
    }).not.toThrow();
    await expect(put).rejects.toThrow();
    await expect(get).rejects.toThrow();
  });

  it('deleteMedia 传空数组立即 resolve', async () => {
    await expect(deleteMedia([])).resolves.toBeUndefined();
  });

  it('deleteMedia 不可用时返回 rejected Promise', async () => {
    await expect(deleteMedia(['x'])).rejects.toThrow();
  });
});
