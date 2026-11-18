import { useEffect, useRef, type CSSProperties } from 'react';
import { useAnimate } from 'framer-motion';
import type { ModuleLayout } from '@/lib/grid-layout';
import type { ModuleStyle, TextStyle } from '@/lib/types';
import { normalizeLabelPosition, shapeRadius } from '@/lib/module-style';

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
  dept?: string | null;           // 部门；仅在 showDept 且 state 为 revealed 时显示在名字下方
  showDept?: boolean;
  showImage?: boolean;            // false（只抽名字）时不渲染图片区与图片说明，名字在卡片内居中；默认 true
  // 全体模块共用的固定字号（由 DrawStage 统一测算）；缺省时用 layout 里的字号
  nameFontSize?: number;
  labelFontSize?: number;
  deptFontSize?: number;
}

// 颜色一律 inline（index.css 在 .hermes-display-board 下用 !important 覆盖了若干 Tailwind 颜色类）
const BORDER_RING = 'rgba(216, 102, 50, 0.22)';
const CARD_SHADOW = 'rgba(150, 61, 25, 0.08)';
const PLACEHOLDER_COLOR = 'rgba(216, 102, 50, 0.28)';
const PLACEHOLDER_BG = 'rgba(216, 102, 50, 0.05)';
const LINE_HEIGHT_RATIO = 1.25; // 与 grid-layout 的 textHeight 计算保持一致
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
  textStyle: TextStyle;
  fontFamily?: string;
  fontWeight: number;
  extraStyle?: CSSProperties;
}

// 单行文字：固定字号渲染，所有模块字号一致（字号由 DrawStage 对全体文字统一测算，不在这里逐个缩小）。
// 仅作最后兜底：单个文字仍超出卡片宽度（如超长单词）时用省略号截断，避免撑破布局。
function FitLine({ text, fontSize, textStyle, fontFamily, fontWeight, extraStyle }: FitLineProps) {
  const family = textStyle.fontFamily || fontFamily || undefined;
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  return (
    // 行高按字号固定：名字为空时不改变卡片高度
    <div
      style={{
        width: '100%', height: lineHeight, lineHeight: `${lineHeight}px`, flexShrink: 0,
        display: 'flex', justifyContent: 'center', whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
          fontSize, fontWeight, fontFamily: family, color: textStyle.color, ...extraStyle,
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
  dept, showDept = false, showImage = true, nameFontSize: nameSize, labelFontSize: labelSize, deptFontSize: deptSize,
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

  const { moduleSize, padding, cardWidth, cardHeight } = layout;
  const nameFontSize = nameSize ?? layout.nameFontSize;
  const labelFontSize = labelSize ?? layout.labelFontSize;
  const deptFontSize = showDept ? deptSize ?? layout.deptFontSize : 0;
  const radius = Math.max(6, Math.min(16, Math.round(moduleSize * 0.06)));
  const imageRadius = shapeRadius(style.shape, moduleSize); // 未知形状回退 rounded
  const labelAbove = normalizeLabelPosition(style.labelPosition) === 'above';
  const rollingImage = state === 'rolling' && rollingPart === 'image';
  const rollingName = state === 'rolling' && rollingPart === 'name';
  const src = state === 'blank' ? null : imageUrl || null;

  const labelLine = style.showImageLabel && labelFontSize > 0 && (
    <FitLine
      text={state === 'blank' ? '' : label ?? ''}
      fontSize={labelFontSize}
      textStyle={style.labelStyle}
      fontFamily={fontFamily}
      fontWeight={500}
      extraStyle={rollingImage ? ROLLING_TEXT : undefined}
    />
  );

  return (
    <div
      ref={scope}
      data-prize-module={state}
      style={{
        width: cardWidth, height: cardHeight, padding, boxSizing: 'border-box', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        // 无图片区时卡片尺寸不变，文字整体垂直居中
        justifyContent: showImage ? undefined : 'center',
        borderRadius: radius + Math.round(padding / 2),
        background: toRgba(style.backgroundColor, style.backgroundOpacity),
        // 细边框用 box-shadow 画，不占布局尺寸
        boxShadow: `0 0 0 1px ${BORDER_RING}, 0 10px 28px ${CARD_SHADOW}`,
      }}
    >
      {showImage && labelAbove && labelLine}
      {showImage && (
        <div
          style={{
            width: moduleSize, height: moduleSize, flexShrink: 0, borderRadius: imageRadius, overflow: 'hidden',
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
      )}
      {showImage && !labelAbove && labelLine}
      {style.showName && nameFontSize > 0 && (
        // 名字为空时保留整行高度，阶段二开始前不塌陷
        <FitLine
          text={state === 'blank' ? '' : name ?? ''}
          fontSize={nameFontSize}
          textStyle={style.nameStyle}
          fontFamily={fontFamily}
          fontWeight={700}
          extraStyle={rollingName ? ROLLING_TEXT : undefined}
        />
      )}
      {showDept && deptFontSize > 0 && (
        // 部门行：始终预留高度，名字定格前后卡片尺寸不变；定格后才有文字
        <FitLine
          text={state === 'revealed' ? dept ?? '' : ''}
          fontSize={deptFontSize}
          textStyle={style.labelStyle}
          fontFamily={fontFamily}
          fontWeight={500}
          extraStyle={{ opacity: 0.85 }}
        />
      )}
    </div>
  );
}
