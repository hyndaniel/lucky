import type { CSSProperties } from 'react';
import type { DecorPosition, TextBlockStyle, VAlign } from '@/lib/types';

// 大屏页面排版 → inline CSS 的纯函数。
// 大屏颜色与位置一律 inline（index.css 在 .hermes-display-board 下用 !important 覆盖了若干 Tailwind 类）。

const DEFAULT_WIDTH_PCT = 20;

// 九宫格：纵向 top/center/bottom × 横向 left/center/right
const VERTICAL: Record<string, CSSProperties> = {
  top: { top: 0 },
  center: { top: '50%' },
  bottom: { bottom: 0 },
};
const HORIZONTAL: Record<string, CSSProperties> = {
  left: { left: 0 },
  center: { left: '50%' },
  right: { right: 0 },
};

function parsePosition(position: string): [string, string] | null {
  if (position === 'center') return ['center', 'center'];
  const [v, h] = position.split('-');
  return v in VERTICAL && h in HORIZONTAL ? [v, h] : null;
}

// 装饰图的绝对定位样式。widthPct 是容器宽度的百分比（限制在 1..100）；未知位置回退右上角。
export function decorPositionStyle(position: DecorPosition, widthPct: number): CSSProperties {
  const pct = Number.isFinite(widthPct) ? Math.min(100, Math.max(1, widthPct)) : DEFAULT_WIDTH_PCT;
  const [v, h] = parsePosition(position) ?? ['top', 'right'];
  const translateX = h === 'center';
  const translateY = v === 'center';
  const transform = translateX && translateY ? 'translate(-50%, -50%)'
    : translateX ? 'translateX(-50%)'
      : translateY ? 'translateY(-50%)'
        : undefined;
  return {
    position: 'absolute',
    width: `${pct}%`,
    ...VERTICAL[v],
    ...HORIZONTAL[h],
    ...(transform ? { transform } : {}),
  };
}

// 标题 / 副标题文字样式。fontFamily 为 '' 表示跟随全局：不设置 inline fontFamily（继承容器字体）。
export function textBlockStyle(block: TextBlockStyle): CSSProperties {
  return {
    color: block.color,
    fontSize: `${block.fontSize}px`,
    textAlign: block.align,
    ...(block.fontFamily ? { fontFamily: block.fontFamily } : {}),
  };
}

// 文字块的纵向位置 → flex justify-content（容器为 column 方向）
export function verticalJustify(align: VAlign): CSSProperties['justifyContent'] {
  return align === 'top' ? 'flex-start' : align === 'bottom' ? 'flex-end' : 'center';
}

// 抽奖页页头相对网格的次序：verticalAlign 为 bottom 时排在网格之后，top / center 排在之前
export function headerOrder(align: VAlign): number {
  return align === 'bottom' ? 2 : 0;
}
