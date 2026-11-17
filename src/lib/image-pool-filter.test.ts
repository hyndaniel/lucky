import { describe, expect, it } from 'vitest';
import type { PrizeImage, Winner } from '@/lib/types';
import {
  UNGROUPED,
  collectGroups,
  countByStatus,
  deriveImageStatuses,
  filterImages,
} from '@/lib/image-pool-filter';

const img = (id: string, serial: number, label = `说明${id}`, group = ''): PrizeImage =>
  ({ id, serial, label, group, createdAt: 0 });
const win = (imageId: string, roundNo = 1): Winner =>
  ({ id: `u-${imageId}`, serial: 1, name: 'x', dept: '', mustWinPrizeId: null, bannedPrizes: [], weight: 1,
    prizeId: 'p1', roundId: 'r0', wonAt: 0, roundNo, imageId }) as Winner;

const images = [img('a', 1, '红包', '一等奖'), img('b', 2, '手机', '一等奖'), img('c', 3, '电视'), img('d', 4, '旅行', '二等奖')];

describe('deriveImageStatuses', () => {
  it('已被记录引用为 used，并带上中奖记录；定格为 frozen；其余 available', () => {
    const map = deriveImageStatuses(images, [win('a', 2)], ['b']);
    expect(map.get('a')).toMatchObject({ status: 'used', winner: { roundNo: 2, prizeId: 'p1' } });
    expect(map.get('b')).toEqual({ status: 'frozen' });
    expect(map.get('c')).toEqual({ status: 'available' });
    expect(map.get('d')).toEqual({ status: 'available' });
  });

  it('既被引用又在定格列表中时按 used 处理', () => {
    expect(deriveImageStatuses(images, [win('a')], ['a']).get('a')?.status).toBe('used');
  });
});

describe('countByStatus', () => {
  it('统计总数 / 可用 / 已抽中 / 已定格', () => {
    const map = deriveImageStatuses(images, [win('a')], ['b']);
    expect(countByStatus(images, map)).toEqual({ total: 4, available: 2, used: 1, frozen: 1 });
  });
});

describe('collectGroups', () => {
  it('去重、去空，保持首次出现顺序', () => {
    expect(collectGroups(images)).toEqual(['一等奖', '二等奖']);
  });
});

describe('filterImages', () => {
  const map = deriveImageStatuses(images, [win('a')], ['b']);
  const ids = (list: PrizeImage[]) => list.map((i) => i.id);

  it('无条件返回全部（保持顺序）', () => {
    expect(ids(filterImages(images, map, { group: 'all', status: 'all', keyword: '' }))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('按分组筛选', () => {
    expect(ids(filterImages(images, map, { group: '一等奖', status: 'all', keyword: '' }))).toEqual(['a', 'b']);
  });

  it('未分组筛选只返回 group 为空的图片', () => {
    expect(ids(filterImages(images, map, { group: UNGROUPED, status: 'all', keyword: '' }))).toEqual(['c']);
  });

  it('按状态筛选', () => {
    expect(ids(filterImages(images, map, { group: 'all', status: 'available', keyword: '' }))).toEqual(['c', 'd']);
    expect(ids(filterImages(images, map, { group: 'all', status: 'used', keyword: '' }))).toEqual(['a']);
    expect(ids(filterImages(images, map, { group: 'all', status: 'frozen', keyword: '' }))).toEqual(['b']);
  });

  it('关键字匹配说明或编号，忽略大小写与首尾空白', () => {
    expect(ids(filterImages(images, map, { group: 'all', status: 'all', keyword: ' 手机 ' }))).toEqual(['b']);
    expect(ids(filterImages(images, map, { group: 'all', status: 'all', keyword: 'img-0003' }))).toEqual(['c']);
    expect(ids(filterImages(images, map, { group: 'all', status: 'all', keyword: '0004' }))).toEqual(['d']);
  });

  it('条件取交集', () => {
    expect(ids(filterImages(images, map, { group: '一等奖', status: 'used', keyword: '红' }))).toEqual(['a']);
    expect(filterImages(images, map, { group: '二等奖', status: 'used', keyword: '' })).toEqual([]);
  });
});
