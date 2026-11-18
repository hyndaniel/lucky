import { describe, expect, it } from 'vitest';
import { isNaturalStop } from '@/hooks/useStageFx';

describe('isNaturalStop', () => {
  it('同一轮次内：奖品滚动 → 定格 / 完成，名字滚动 → 完成都算自然结束', () => {
    expect(isNaturalStop('r1', 'rollingPrizes', 'r1', 'prizesRevealed')).toBe(true);
    expect(isNaturalStop('r1', 'rollingNames', 'r1', 'completed')).toBe(true);
    // image-only：奖品滚动直接完成，需要放特效
    expect(isNaturalStop('r1', 'rollingPrizes', 'r1', 'completed')).toBe(true);
  });

  it('取消、换轮次、其它转换都不算', () => {
    expect(isNaturalStop('r1', 'rollingPrizes', 'r1', 'idle')).toBe(false);
    expect(isNaturalStop('r1', 'rollingNames', 'r1', 'prizesRevealed')).toBe(false);
    expect(isNaturalStop('r1', 'rollingNames', 'r1', 'idle')).toBe(false);
    expect(isNaturalStop('r1', 'rollingPrizes', 'r2', 'completed')).toBe(false);
    expect(isNaturalStop('', 'rollingPrizes', '', 'completed')).toBe(false);
    expect(isNaturalStop('r1', 'idle', 'r1', 'rollingNames')).toBe(false);
  });
});
