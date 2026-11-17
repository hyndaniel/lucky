import { describe, expect, it } from 'vitest';
import {
  getRollSpeed, ROLL_ACCEL_MS, ROLL_DECEL_MS, ROLL_MAX_SPEED, ROLL_MIN_SPEED,
} from '@/hooks/useRollingTicker';

describe('getRollSpeed', () => {
  it('沿用原节奏常量：2→12 次/秒，加速 1s，减速 1.5s', () => {
    expect(ROLL_MIN_SPEED).toBe(2);
    expect(ROLL_MAX_SPEED).toBe(12);
    expect(ROLL_ACCEL_MS).toBe(1000);
    expect(ROLL_DECEL_MS).toBe(1500);
  });

  it('加速从 2 次/秒开始，1s 时到 12 次/秒，之后保持', () => {
    expect(getRollSpeed('accelerating', 0, 0)).toBe(2);
    expect(getRollSpeed('accelerating', 1000, 0)).toBe(12);
    expect(getRollSpeed('accelerating', 5000, 0)).toBe(12);
  });

  it('加速为 ease-out：中点 = 2 + 10 × (1 − 0.5²)', () => {
    expect(getRollSpeed('accelerating', 500, 0)).toBeCloseTo(9.5);
  });

  it('加速期间单调不减', () => {
    let last = 0;
    for (let t = 0; t <= 1200; t += 50) {
      const speed = getRollSpeed('accelerating', t, 0);
      expect(speed).toBeGreaterThanOrEqual(last);
      last = speed;
    }
  });

  it('减速从停止时的速度开始，1.5s 时降到 0，之后保持 0', () => {
    expect(getRollSpeed('decelerating', 0, 12)).toBe(12);
    expect(getRollSpeed('decelerating', 0, 7)).toBe(7);
    expect(getRollSpeed('decelerating', 1500, 12)).toBe(0);
    expect(getRollSpeed('decelerating', 4000, 12)).toBe(0);
  });

  it('减速为 ease-out：中点 = 起始速度 × 0.5²', () => {
    expect(getRollSpeed('decelerating', 750, 12)).toBeCloseTo(3);
  });

  it('减速期间单调不增', () => {
    let last = Infinity;
    for (let t = 0; t <= 1600; t += 50) {
      const speed = getRollSpeed('decelerating', t, 12);
      expect(speed).toBeLessThanOrEqual(last);
      last = speed;
    }
  });

  it('负的经过时间按 0 处理', () => {
    expect(getRollSpeed('accelerating', -10, 0)).toBe(2);
    expect(getRollSpeed('decelerating', -10, 12)).toBe(12);
  });
});
