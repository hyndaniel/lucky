import { useEffect, useState } from 'react';
import { getMediaUrl } from '@/lib/media-store';

function sameRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  return aKeys.length === Object.keys(b).length && aKeys.every((key) => b[key] === a[key]);
}

// 按 key 并发加载 IndexedDB 媒体的 object URL；缺失或失败的 key 不出现在结果里。
// 依赖 keys.join('|') 这个原始值：大屏每 500ms rehydrate 生成的新数组不会触发重新加载。
// key 列表变化时，仍保留的 key 在加载完成前继续用旧 URL；内容不变时返回同一个对象。
export function useMediaUrls(keys: string[]): Record<string, string> {
  const joined = keys.join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const wanted = joined.split('|').filter(Boolean);
    let cancelled = false;
    // getMediaUrl 永不 reject；已缓存的 key 直接命中模块级缓存
    void Promise.all(wanted.map(async (key) => [key, await getMediaUrl(key)] as const)).then(
      (entries) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const [key, url] of entries) {
          if (url) next[key] = url;
        }
        setUrls((prev) => (sameRecord(prev, next) ? prev : next));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [joined]);

  return urls;
}

// 预先解码图片，避免滚动开始时图片闪白；单张失败忽略，整体永不 reject
export async function preloadImages(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
      } catch {
        // 解码失败或环境无 Image：忽略
      }
    }),
  );
}
