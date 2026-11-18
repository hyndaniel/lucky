import type { LabelPosition, ModuleShape } from '@/lib/types';

// 持久化的枚举值不经校验，这里统一兜底：未知形状 → 'rounded'，未知说明位置 → 'below'
export function normalizeShape(shape: unknown): ModuleShape {
  return shape === 'square' || shape === 'rounded' || shape === 'circle' ? shape : 'rounded';
}

export function normalizeLabelPosition(position: unknown): LabelPosition {
  return position === 'above' || position === 'below' ? position : 'below';
}

// 卡片（整个模块）border-radius：square 小圆角；rounded 随图片区尺寸（6..16px）+ 半个内边距；circle 50%（卡片为正方形，故为正圆）
export function cardRadius(shape: unknown, moduleSize: number, padding: number): number | string {
  switch (normalizeShape(shape)) {
    case 'square': return 6;
    case 'circle': return '50%';
    default: return Math.max(6, Math.min(16, Math.round(moduleSize * 0.06))) + Math.round(padding / 2);
  }
}

// 内部图片区 border-radius：与形状无关，随尺寸取小圆角
export function imageRadius(moduleSize: number): number {
  return Math.max(4, Math.round(moduleSize * 0.04));
}
