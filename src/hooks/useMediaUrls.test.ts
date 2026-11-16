import { describe, expect, it } from 'vitest';
import { preloadImages } from '@/hooks/useMediaUrls';

// node 没有 Image：预加载失败应被忽略
describe('preloadImages', () => {
  it('空列表直接 resolve', async () => {
    await expect(preloadImages([])).resolves.toBeUndefined();
  });

  it('加载失败时忽略，不 reject', async () => {
    await expect(preloadImages(['blob:missing-1', 'blob:missing-2'])).resolves.toBeUndefined();
  });
});
