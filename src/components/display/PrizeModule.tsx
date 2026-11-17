import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useAnimate } from 'framer-motion';
import type { ModuleLayout } from '@/lib/grid-layout';
import type { ModuleStyle, TextStyle } from '@/lib/types';

export type PrizeModuleState = 'blank' | 'rolling' | 'revealed';

export interface PrizeModuleProps {
  layout: ModuleLayout;
  imageUrl?: string | null;
  label?: string | null;
  name?: string | null;
  style: ModuleStyle;
  state: PrizeModuleState;
  fontFamily?: string;          // 大屏字体；TextStyle.fontFamily 为 '' 时使用
  rollingPart?: 'image' | 'name'; // rolling 时正在变化的部分：阶段一为图片（默认），阶段二为名字（图片不动）
}

// 颜色一律 inline（index.css 在 .hermes-display-board 下用 !important 覆盖了若干 Tailwind 颜色类）
const BORDER_RING = 'rgba(216, 102, 50, 0.22)';
const CARD_SHADOW = 'rgba(150, 61, 25, 0.08)';
const PLACEHOLDER_COLOR = 'rgba(216, 102, 50, 0.28)';
const PLACEHOLDER_BG = 'rgba(216, 102, 50, 0.05)';
const MIN_FONT_PX = 10;
const LINE_HEIGHT_RATIO = 1.5;
const ROLLING_IMAGE: CSSProperties = { filter: 'blur(1px)', opacity: 0.85 };
const ROLLING_TEXT: CSSProperties = { filter: 'blur(0.6px)', opacity: 0.75 };

// '#rrggbb' + 透明度百分比 → rgba；格式不对时退回白色
function toRgba(hex: string, opacityPercent: number): string {
  const alpha = Math.min(1, Math.max(0, opacityPercent / 100)) || 0;
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const value = match ? parseInt(match[1], 16) : 0xffffff;
  return `rgba(${value >> 16}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}

interface FitLineProps {
  text: string;
  fontSize: number;
  maxWidth: number;
  textStyle: TextStyle;
  fontFamily?: string;
  fontWeight: number;
  extraStyle?: CSSProperties;
}

// 单行文字：不换行、不省略；超出可用宽度时按比例缩小字号直到放下（最小 10px）。
// 缩到 10px 仍放不下时不裁切，居中向卡片两侧溢出，保证文字完整可见。
// 直接改 DOM 字号而不是 setState：每帧换名字时不额外触发重渲染
function FitLine({ text, fontSize, maxWidth, textStyle, fontFamily, fontWeight, extraStyle }: FitLineProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const family = textStyle.fontFamily || fontFamily || undefined;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = `${fontSize}px`;
    if (!text || maxWidth <= 0) return;
    const width = el.scrollWidth;
    if (width <= maxWidth) return;
    const minSize = Math.min(fontSize, MIN_FONT_PX); // 布局给的字号本身小于 10px 时不放大
    let size = Math.max(minSize, Math.floor((fontSize * maxWidth) / width));
    el.style.fontSize = `${size}px`;
    // 字形缩放不完全线性，再逐像素校正
    while (size > minSize && el.scrollWidth > maxWidth) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
  }, [text, fontSize, maxWidth, family]);

  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  return (
    // 行高按布局字号固定：缩小字号或名字为空时都不改变卡片高度
    <div
      style={{
        width: '100%', height: lineHeight, lineHeight: `${lineHeight}px`, flexShrink: 0,
        display: 'flex', justifyContent: 'center', whiteSpace: 'nowrap',
      }}
    >
      <span
        ref={ref}
        style={{
          display: 'block', flexShrink: 0, fontSize, fontWeight, fontFamily: family,
          color: textStyle.color, ...extraStyle,
        }}
      >
        {text}
      </span>
    </div>
  );
}

// 抽奖模块（卡片）：方形图片区 + 图片说明 + 名字。纯展示，大屏与后台样式预览共用
export default function PrizeModule({
  layout, imageUrl, label, name, style, state, fontFamily, rollingPart = 'image',
}: PrizeModuleProps) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const prevStateRef = useRef(state);

  // 变为 revealed（定格）时弹跳一次；以 revealed 状态挂载（如大屏打开时已定格）不弹
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (state !== 'revealed' || prev === 'revealed' || !scope.current) return;
    const controls = animate(
      scope.current,
      { scale: [1, 1.08, 0.97, 1] },
      { duration: 0.6, times: [0, 0.35, 0.7, 1], ease: 'easeOut' },
    );
    return () => controls.stop();
  }, [state, animate, scope]);

  const { moduleSize, padding, cardWidth, cardHeight, nameFontSize, labelFontSize } = layout;
  const innerWidth = cardWidth - 2 * padding;
  const radius = Math.max(6, Math.min(16, Math.round(moduleSize * 0.06)));
  const rollingImage = state === 'rolling' && rollingPart === 'image';
  const rollingName = state === 'rolling' && rollingPart === 'name';
  const src = state === 'blank' ? null : imageUrl || null;

  return (
    <div
      ref={scope}
      data-prize-module={state}
      style={{
        width: cardWidth, height: cardHeight, padding, boxSizing: 'border-box', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        borderRadius: radius + Math.round(padding / 2),
        background: toRgba(style.backgroundColor, style.backgroundOpacity),
        // 细边框用 box-shadow 画，不占布局尺寸
        boxShadow: `0 0 0 1px ${BORDER_RING}, 0 10px 28px ${CARD_SHADOW}`,
      }}
    >
      <div
        style={{
          width: moduleSize, height: moduleSize, flexShrink: 0, borderRadius: radius, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: src ? 'transparent' : PLACEHOLDER_BG,
        }}
      >
        {src ? (
          <img
            src={src}
            alt={label ?? ''}
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', ...(rollingImage ? ROLLING_IMAGE : null) }}
          />
        ) : (
          // 空白模块与图片缺失时显示淡色 "?"
          <span style={{ fontSize: Math.round(moduleSize * 0.42), fontWeight: 800, lineHeight: 1, color: PLACEHOLDER_COLOR }}>
            ?
          </span>
        )}
      </div>
      {style.showImageLabel && labelFontSize > 0 && (
        <FitLine
          text={state === 'blank' ? '' : label ?? ''}
          fontSize={labelFontSize}
          maxWidth={innerWidth}
          textStyle={style.labelStyle}
          fontFamily={fontFamily}
          fontWeight={500}
          extraStyle={rollingImage ? ROLLING_TEXT : undefined}
        />
      )}
      {style.showName && nameFontSize > 0 && (
        // 名字为空时保留整行高度，阶段二开始前不塌陷
        <FitLine
          text={state === 'blank' ? '' : name ?? ''}
          fontSize={nameFontSize}
          maxWidth={innerWidth}
          textStyle={style.nameStyle}
          fontFamily={fontFamily}
          fontWeight={700}
          extraStyle={rollingName ? ROLLING_TEXT : undefined}
        />
      )}
    </div>
  );
}
