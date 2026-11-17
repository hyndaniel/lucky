import { useEffect, useRef } from 'react';
import { getMedia } from '@/lib/media-store';
import type { UploadedFont } from '@/lib/types';

interface Entry {
  key: string;
  cancelled: boolean;
  face?: FontFace;
  url?: string;
}

function release(entry: Entry): void {
  entry.cancelled = true;
  if (entry.face) {
    try {
      document.fonts.delete(entry.face);
    } catch {
      // 清理失败忽略
    }
  }
  if (entry.url) URL.revokeObjectURL(entry.url);
  entry.face = undefined;
  entry.url = undefined;
}

async function register(family: string, entry: Entry, registry: Map<string, Entry>): Promise<void> {
  try {
    const blob = await getMedia(entry.key);
    if (!blob || entry.cancelled) return;
    // URL 所有权：这里用 getMedia 取自己的 Blob 并自建 object URL，而不是 getMediaUrl。
    // getMediaUrl 的 URL 缓存在模块级、与其他使用者共享，且会被 deleteMedia/putMedia revoke；
    // 自建 URL 让本 hook 能在字体移除或卸载时放心 revoke，不影响别处。
    const url = URL.createObjectURL(blob);
    entry.url = url;
    const face = new FontFace(family, `url(${url})`);
    await face.load();
    if (entry.cancelled) {
      // 加载期间已被移除：release 已置 cancelled，此处补清自己创建的 URL
      URL.revokeObjectURL(url);
      entry.url = undefined;
      return;
    }
    document.fonts.add(face);
    entry.face = face;
  } catch {
    // IndexedDB 不可用、字体文件损坏等：静默放弃，下次列表变化时可重试
    if (entry.url) URL.revokeObjectURL(entry.url);
    entry.url = undefined;
    if (registry.get(family) === entry) registry.delete(family);
  }
}

// 把已上传字体（IndexedDB 中的 Blob）注册到 document.fonts，让预览与大屏都能用 settings.fonts 里的 family。
// 同一 family 只注册一次；family 被移除或组件卸载时 delete FontFace 并 revoke 自建 URL。
// document.fonts 或媒体库不可用时静默不做事，永不抛错。
// 依赖 key|family 的序列化字符串而不是数组引用：大屏每 500ms rehydrate 产生的新数组不会触发重新加载。
export function useCustomFonts(fonts: UploadedFont[]): void {
  const registry = useRef(new Map<string, Entry>());
  const signature = JSON.stringify(fonts.map((f) => [f.key, f.family]));

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') return;
    const wanted = new Map<string, string>(
      (JSON.parse(signature) as [string, string][]).map(([key, family]) => [family, key]),
    );
    const map = registry.current;
    for (const [family, entry] of map) {
      if (wanted.get(family) !== entry.key) {
        release(entry);
        map.delete(family);
      }
    }
    for (const [family, key] of wanted) {
      if (map.has(family)) continue;
      const entry: Entry = { key, cancelled: false };
      map.set(family, entry);
      void register(family, entry, map);
    }
  }, [signature]);

  useEffect(() => {
    const map = registry.current;
    return () => {
      if (typeof document === 'undefined' || !document.fonts) return;
      for (const entry of map.values()) release(entry);
      map.clear();
    };
  }, []);
}
