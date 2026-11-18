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

// FontFace 构造函数把 family 当 CSS font-family 描述符解析：未加引号时 `Font 2` 这类
// 数字开头的标识符会抛 SyntaxError。统一包成带转义的字符串，与 CSS 里的同名 family 等价匹配。
function quoteFamily(family: string): string {
  const safe = family.replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${safe}'`;
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
    const face = new FontFace(quoteFamily(family), `url(${url})`);
    await face.load();
    // 加载期间已被移除：release 已 revoke 并清掉 entry.url，不会添加 FontFace
    if (entry.cancelled) return;
    document.fonts.add(face);
    entry.face = face;
  } catch {
    // IndexedDB 不可用、字体文件损坏等：不抛错，只在控制台留一条信号（每次失败每个 family 一条）。
    // 条目从 registry 移除，列表内容变化时才会重试；内容不变的 rehydrate 不会重复触发。
    if (!entry.cancelled) console.warn(`自定义字体加载失败: ${family}`);
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
