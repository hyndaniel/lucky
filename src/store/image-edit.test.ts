import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrizeImage } from '@/lib/types';
import { groupUpdates } from '@/lib/image-pool-filter';
import { imageLabelFor } from '@/lib/draw-engine';
import { useLotteryStore } from '@/store/useStore';

const s = () => useLotteryStore.getState();
const byId = () => new Map(s().prizeImages.map((img) => [img.id, img]));
const image = (n: number, group = ''): PrizeImage => ({ id: `img${n}`, serial: n, label: `图片${n}`, group, createdAt: 0 });

beforeEach(() => {
  useLotteryStore.setState({ prizeImages: [1, 2, 3, 4].map((n) => image(n, n === 2 ? '旧组' : '')), winners: [], currentRound: null });
});

// 与 ImagePoolTab.handleBatchGroup 同一条路径：groupUpdates → updatePrizeImage（空串 = 清除分组）
function batchSet(ids: string[], raw: string) {
  for (const u of groupUpdates(s().prizeImages, ids, raw)) s().updatePrizeImage(u.id, { group: u.group });
}

describe('B5 批量设分组', () => {
  it('对 N 张选中图片设「一等奖」后全部为「一等奖」（含原本有旧分组的）', () => {
    const ids = ['img1', 'img2', 'img3'];
    batchSet(ids, '一等奖');
    expect(s().prizeImages.filter((i) => ids.includes(i.id)).map((i) => i.group)).toEqual(['一等奖', '一等奖', '一等奖']);
    expect(s().prizeImages.find((i) => i.id === 'img4')!.group).toBe('');
  });

  it('输入两侧空白会去掉；重复 id 不重复写', () => {
    expect(groupUpdates(s().prizeImages, ['img1', 'img1'], '  一等奖 ')).toEqual([{ id: 'img1', group: '一等奖' }]);
  });

  it('目标分组留空 = 清除分组（输入框占位提示的既有行为）', () => {
    batchSet(['img2'], '  ');
    expect(s().prizeImages[1].group).toBe('');
  });

  it('已是目标分组的跳过', () => {
    expect(groupUpdates(s().prizeImages, ['img2'], '旧组')).toEqual([]);
  });
});

describe('B5 根因：持久化写入失败时后台 1s 轮询 rehydrate 把批量结果还原', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('localStorage 写入失败（配额）后，rehydrate 不能把内存里刚设的分组冲掉', async () => {
    useLotteryStore.setState({ prizeImages: [1, 2, 3].map((n) => image(n)) });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    batchSet(['img1', 'img2', 'img3'], '一等奖');
    expect(s().prizeImages.map((i) => i.group)).toEqual(['一等奖', '一等奖', '一等奖']);
    await useLotteryStore.persist.rehydrate(); // 后台每秒一次
    expect(s().prizeImages.map((i) => i.group)).toEqual(['一等奖', '一等奖', '一等奖']);
  });
});

describe('B4 图片说明修改 → 大屏读到新说明', () => {
  it('updatePrizeImage 改说明后 prizeImages 与大屏解析的说明同时变化', () => {
    const before = imageLabelFor(byId(), 'img1', '旧快照');
    expect(before).toBe('图片1');
    s().updatePrizeImage('img1', { label: '新说明' });
    expect(s().prizeImages[0].label).toBe('新说明');
    expect(imageLabelFor(byId(), 'img1', '旧快照')).toBe('新说明');
  });

  it('图片已被删除时退回中奖记录里的说明快照；两者都没有则为 null', () => {
    expect(imageLabelFor(byId(), 'gone', '快照')).toBe('快照');
    expect(imageLabelFor(byId(), 'gone', undefined)).toBeNull();
    expect(imageLabelFor(byId(), null, undefined)).toBeNull();
  });
});
