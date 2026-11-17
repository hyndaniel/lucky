import { useMediaUrls } from '@/hooks/useMediaUrls';
import { decorPositionStyle } from '@/lib/page-layout-style';
import type { PageDecor } from '@/lib/types';

// 页面装饰图：绝对定位的覆盖层，不参与布局流（父级需 position: relative）。
// 未设置、blob 缺失（IndexedDB 不可用 / 已删除）或尚未解析时渲染 null：不出现破图，也不抛错。
export default function PageDecorImage({ decor }: { decor: PageDecor }) {
  const key = decor.imageKey;
  const urls = useMediaUrls(key ? [key] : []);
  const url = key ? urls[key] : undefined;
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      style={{ ...decorPositionStyle(decor.position, decor.widthPct), height: 'auto', pointerEvents: 'none', zIndex: 5 }}
    />
  );
}
