import { describe, expect, it } from 'vitest';
import { normalizeLabelPosition, normalizeShape, cardRadius, imageRadius } from '@/lib/module-style';

describe('module-style', () => {
  it('cardRadius 按形状映射（卡片本身）', () => {
    expect(cardRadius('square', 200, 12)).toBe(6);
    expect(cardRadius('circle', 200, 12)).toBe('50%');
    expect(cardRadius('rounded', 200, 12)).toBe(12 + 6);
    expect(cardRadius('rounded', 40, 4)).toBe(6 + 2);
    expect(cardRadius('rounded', 1000, 16)).toBe(16 + 8);
  });

  it('imageRadius 与形状无关，随尺寸取小圆角（下限 4）', () => {
    expect(imageRadius(40)).toBe(4);
    expect(imageRadius(200)).toBe(8);
    expect(imageRadius(400)).toBe(16);
  });

  it('未知形状回退为 rounded', () => {
    expect(normalizeShape('hexagon')).toBe('rounded');
    expect(normalizeShape(undefined)).toBe('rounded');
    expect(cardRadius('garbage', 200, 12)).toBe(cardRadius('rounded', 200, 12));
  });

  it('说明位置默认 below', () => {
    expect(normalizeLabelPosition('above')).toBe('above');
    expect(normalizeLabelPosition('below')).toBe('below');
    expect(normalizeLabelPosition('left')).toBe('below');
    expect(normalizeLabelPosition(undefined)).toBe('below');
  });
});
