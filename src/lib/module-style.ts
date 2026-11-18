import type { LabelPosition, ModuleShape } from '@/lib/types';

// 持久化的枚举值不经校验，这里统一兜底：未知形状 → 'rounded'，未知说明位置 → 'below'
export function normalizeShape(shape: unknown): ModuleShape {
  return shape === 'square' || shape === 'rounded' || shape === 'circle' ? shape : 'rounded';
}

export function normalizeLabelPosition(position: unknown): LabelPosition {
  return position === 'above' || position === 'below' ? position : 'below';
}

// 图片区 border-radius：square 小圆角；rounded 随尺寸（6..16px）；circle 50%（图片区为正方形，故为正圆）
export function shapeRadius(shape: unknown, moduleSize: number): number | string {
  switch (normalizeShape(shape)) {
    case 'square': return 4;
    case 'circle': return '50%';
    default: return Math.max(6, Math.min(16, Math.round(moduleSize * 0.06)));
  }
}
