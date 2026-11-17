import { describe, expect, it } from 'vitest';
import { fitFontSize } from '@/lib/fit-text';

const measure = (text: string, size: number) => text.length * size;

describe('fitFontSize', () => {
  it('返回让最长文字放下的最大整数字号，且所有文字共用', () => {
    // 最长 8 字：8 × size ≤ 200 → size ≤ 25
    const size = fitFontSize(['a', 'abcdefgh'], 200, 40, measure);
    expect(size).toBe(25);
    expect(Number.isInteger(size)).toBe(true);
    for (const t of ['a', 'abcdefgh']) expect(measure(t, size)).toBeLessThanOrEqual(200);
    expect(measure('abcdefgh', size + 1)).toBeGreaterThan(200);
  });

  it('全部放得下时返回 baseFontSize（不放大）', () => {
    expect(fitFontSize(['ab'], 1000, 40, measure)).toBe(40);
  });

  it('空文字与纯空白被忽略；全空时返回 baseFontSize', () => {
    expect(fitFontSize(['', '  ', '\n'], 10, 40, measure)).toBe(40);
    expect(fitFontSize([], 10, 40, measure)).toBe(40);
    expect(fitFontSize(['', 'abcdefgh'], 200, 40, measure)).toBe(25);
  });

  it('最小字号也放不下时返回 minFontSize（不死循环）', () => {
    expect(fitFontSize(['abcdefghij'], 5, 40, measure)).toBe(10);
    expect(fitFontSize(['abcdefghij'], 5, 40, measure, 14)).toBe(14);
  });

  it('baseFontSize 小于 minFontSize 时不放大', () => {
    expect(fitFontSize(['abcdefghij'], 5, 8, measure)).toBe(8);
  });

  it('maxWidth 非正数时返回 minFontSize', () => {
    expect(fitFontSize(['a'], 0, 40, measure)).toBe(10);
  });

  it('不同文字集合得到同一个尺寸：与单独最长文字的结果一致', () => {
    const texts = ['王', '欧阳娜娜娜', '李四'];
    expect(fitFontSize(texts, 180, 60, measure)).toBe(fitFontSize(['欧阳娜娜娜'], 180, 60, measure));
  });
});
