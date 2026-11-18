import { describe, expect, it } from 'vitest';
import type { Participant, PrizeImage, Winner } from '@/lib/types';
import { describeImagePool, describeNamePool, formatLayoutHint } from '@/lib/pool-summary';

const img = (id: string, group = ''): PrizeImage => ({ id, serial: 1, label: id, group, createdAt: 0 });
const person = (id: string, extra: Partial<Participant> = {}): Participant =>
  ({ id, serial: 1, name: id, dept: '', mustWinPrizeId: null, bannedPrizes: [], weight: 1, ...extra }) as Participant;
const won = (id: string, extra: Partial<Winner> = {}): Winner =>
  ({ ...person(id), prizeId: 'p0', roundId: 'r0', wonAt: 0, ...extra }) as Winner;

describe('describeImagePool', () => {
  const images = [img('a', '一等奖'), img('b', '一等奖'), img('c'), img('d')];

  it('null 且无同名分组：全部可用', () => {
    expect(describeImagePool(images, [], null, '二等奖')).toBe('自动：全部可用 4 张');
  });

  it('已用图片不计入可用数', () => {
    expect(describeImagePool(images, [won('x', { imageId: 'c' })], null, '二等奖')).toBe('自动：全部可用 3 张');
  });

  it('选择集合等于默认分组：显示分组', () => {
    expect(describeImagePool(images, [], ['b', 'a'], '一等奖')).toBe('自动：分组「一等奖」2 张');
  });

  it('null 即使存在同名分组：仍是全部可用（分组默认池由 store 以显式 id 写入）', () => {
    expect(describeImagePool(images, [], null, '一等奖')).toBe('自动：全部可用 4 张');
  });

  it('显式选择：已选 X 张，只计仍可用的', () => {
    const winners = [won('x', { imageId: 'c' })];
    expect(describeImagePool(images, winners, ['a', 'c', 'd'], '一等奖')).toBe('已选 2 张');
  });

  it('显式选择空集合：已选 0 张', () => {
    expect(describeImagePool(images, [], [], '一等奖')).toBe('已选 0 张');
  });
});

describe('describeNamePool', () => {
  const people = [person('a'), person('b'), person('c', { bannedPrizes: ['p1'] })];

  it('null：自动，全部合格', () => {
    expect(describeNamePool(people, [], 'p1', null)).toBe('自动：全部合格 2 人');
  });

  it('已中奖者不计入', () => {
    expect(describeNamePool(people, [won('a')], 'p1', null)).toBe('自动：全部合格 1 人');
  });

  it('显式选择：已选 X 人，只计合格者，并含内定者', () => {
    const list = [...people, person('m', { mustWinPrizeId: 'p1' })];
    expect(describeNamePool(list, [], 'p1', ['a', 'c'])).toBe('已选 2 人');
  });

  it('无当前奖项（prizeId 为 undefined）：提示先选奖项', () => {
    expect(describeNamePool(people, [], undefined, null)).toBe('请先选择奖项');
  });
});

describe('formatLayoutHint', () => {
  it('列×排', () => {
    expect(formatLayoutHint(12, 0)).toBe('4×3');
    expect(formatLayoutHint(10, 0)).toBe('5×2');
    expect(formatLayoutHint(6, 0)).toBe('3×2');
  });
  it('固定每排数量', () => {
    expect(formatLayoutHint(12, 6)).toBe('6×2');
    expect(formatLayoutHint(3, 8)).toBe('3×1');
  });
  it('非法模块数返回空串', () => {
    expect(formatLayoutHint(0, 0)).toBe('');
    expect(formatLayoutHint(NaN, 0)).toBe('');
  });
});
