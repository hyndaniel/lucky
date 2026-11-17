import { describe, expect, it } from 'vitest';
import { DEFAULT_LOTTERY_LAYOUT, DEFAULT_PRIZE_LAYOUT, DEFAULT_WELCOME_LAYOUT } from '@/lib/defaults';

// 大屏底色被 index.css 强制为 #fffdfb（.hermes-display / .hermes-display-board / .hermes-background）
const BOARD_BG = '#fffdfb';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('页面排版默认值在大屏米白底上可读', () => {
  const layouts = { welcome: DEFAULT_WELCOME_LAYOUT, prize: DEFAULT_PRIZE_LAYOUT, lottery: DEFAULT_LOTTERY_LAYOUT };
  for (const [name, layout] of Object.entries(layouts)) {
    it(`${name}：标题 / 副标题对比度 >= 3:1（大字号 AA）`, () => {
      expect(contrast(layout.title.color, BOARD_BG)).toBeGreaterThanOrEqual(3);
      expect(contrast(layout.subtitle.color, BOARD_BG)).toBeGreaterThanOrEqual(3);
    });
  }

  it('各页默认字号对应改版前的视觉权重：欢迎页大标题最大，副标题小于标题', () => {
    expect(DEFAULT_WELCOME_LAYOUT.title.fontSize).toBeGreaterThanOrEqual(120);
    expect(DEFAULT_WELCOME_LAYOUT.title.fontSize).toBeGreaterThan(DEFAULT_LOTTERY_LAYOUT.title.fontSize);
    expect(DEFAULT_LOTTERY_LAYOUT.title.fontSize).toBeGreaterThan(DEFAULT_PRIZE_LAYOUT.title.fontSize);
    for (const layout of [DEFAULT_WELCOME_LAYOUT, DEFAULT_PRIZE_LAYOUT, DEFAULT_LOTTERY_LAYOUT]) {
      expect(layout.subtitle.fontSize).toBeLessThan(layout.title.fontSize);
    }
  });
});
