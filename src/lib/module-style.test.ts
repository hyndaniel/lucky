import { describe, expect, it } from 'vitest';
import { normalizeLabelPosition, normalizeShape, shapeRadius } from '@/lib/module-style';

describe('module-style', () => {
  it('shapeRadius 按形状映射', () => {
    expect(shapeRadius('square', 200)).toBe(4);
    expect(shapeRadius('circle', 200)).toBe('50%');
    expect(shapeRadius('rounded', 200)).toBe(12);
    expect(shapeRadius('rounded', 40)).toBe(6);
    expect(shapeRadius('rounded', 1000)).toBe(16);
  });

  it('未知形状回退为 rounded', () => {
    expect(normalizeShape('hexagon')).toBe('rounded');
    expect(normalizeShape(undefined)).toBe('rounded');
    expect(shapeRadius('garbage', 200)).toBe(shapeRadius('rounded', 200));
  });

  it('说明位置默认 below', () => {
    expect(normalizeLabelPosition('above')).toBe('above');
    expect(normalizeLabelPosition('below')).toBe('below');
    expect(normalizeLabelPosition('left')).toBe('below');
    expect(normalizeLabelPosition(undefined)).toBe('below');
  });
});
