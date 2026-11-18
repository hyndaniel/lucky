import { describe, expect, it } from 'vitest';
import type { Winner } from '@/lib/types';
import { countWinnerPeople, sortWinnersForDisplay } from '@/lib/winner-records';

const win = (id: string, roundId: string, extra: Partial<Winner> = {}): Winner => ({
  id, serial: 1, name: id, dept: '', mustWinPrizeId: null, bannedPrizes: [], weight: 1,
  prizeId: 'p1', roundId, wonAt: 0, ...extra,
});
const ids = (list: Winner[]) => list.map((w) => w.id);

describe('sortWinnersForDisplay', () => {
  it('轮次倒序，同轮保持模块顺序', () => {
    const winners = [win('a1', 'r1'), win('a2', 'r1'), win('b1', 'r2'), win('b2', 'r2'), win('b3', 'r2'), win('c1', 'r3')];
    expect(ids(sortWinnersForDisplay(winners))).toEqual(['c1', 'b1', 'b2', 'b3', 'a1', 'a2']);
  });

  it('不修改入参', () => {
    const winners = [win('a', 'r1'), win('b', 'r2')];
    sortWinnersForDisplay(winners);
    expect(ids(winners)).toEqual(['a', 'b']);
  });

  it('无 roundNo 的旧记录按出现先后视为更早的轮次', () => {
    const winners = [win('old1', 'x'), win('old2', 'x'), win('new1', 'r2', { roundNo: 2 }), win('new2', 'r2', { roundNo: 2 })];
    expect(ids(sortWinnersForDisplay(winners))).toEqual(['new1', 'new2', 'old1', 'old2']);
  });

  it('同一 roundId 不相邻时仍归到一起', () => {
    const winners = [win('a1', 'r1'), win('b1', 'r2'), win('a2', 'r1')];
    expect(ids(sortWinnersForDisplay(winners))).toEqual(['b1', 'a1', 'a2']);
  });

  it('空数组返回空数组', () => {
    expect(sortWinnersForDisplay([])).toEqual([]);
  });
});

describe('countWinnerPeople', () => {
  it('不计 image-only 记录（id 为空）：已中奖 / 剩余 不受其影响', () => {
    const people = [win('u1', 'r1'), win('u2', 'r1')];
    const imageOnly = [win('', 'r2', { name: '', imageId: 'img1' }), win('', 'r2', { name: '', imageId: 'img2' })];
    expect(countWinnerPeople(people)).toBe(2);
    expect(countWinnerPeople([...people, ...imageOnly])).toBe(2);
    expect(countWinnerPeople(imageOnly)).toBe(0);
    // 剩余 = 总人数 - 有人的记录，不会变负
    expect(1 - countWinnerPeople(imageOnly)).toBe(1);
  });
});
