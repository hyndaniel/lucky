import { describe, expect, it } from 'vitest';
import type { Participant } from '@/lib/types';
import { collectDepts, filterParticipants, NO_DEPT } from '@/lib/name-pool-filter';

const p = (id: string, serial: number, name: string, dept: string): Participant =>
  ({ id, serial, name, dept, mustWinPrizeId: null, bannedPrizes: [], weight: 1 });

const list = [p('a', 1, '张三', '研发'), p('b', 2, '李四', '市场'), p('c', 12, '王五', ''), p('d', 3, '张六', '研发')];

describe('collectDepts', () => {
  it('去重去空并保持首次出现顺序', () => {
    expect(collectDepts(list)).toEqual(['研发', '市场']);
  });
});

describe('filterParticipants', () => {
  it('all + 空关键字：全部', () => {
    expect(filterParticipants(list, 'all', '')).toHaveLength(4);
  });
  it('按部门', () => {
    expect(filterParticipants(list, '研发', '').map((x) => x.id)).toEqual(['a', 'd']);
  });
  it('无部门', () => {
    expect(filterParticipants(list, NO_DEPT, '').map((x) => x.id)).toEqual(['c']);
  });
  it('按姓名搜索', () => {
    expect(filterParticipants(list, 'all', '张').map((x) => x.id)).toEqual(['a', 'd']);
  });
  it('按编号搜索（不区分大小写）', () => {
    expect(filterParticipants(list, 'all', 'n-0012').map((x) => x.id)).toEqual(['c']);
  });
  it('部门与关键字组合', () => {
    expect(filterParticipants(list, '市场', '张')).toEqual([]);
  });
});
