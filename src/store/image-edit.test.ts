import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuleStyle, PrizeImage } from '@/lib/types';
import { clearGroupUpdates, groupUpdates, setGroupUpdates } from '@/lib/image-pool-filter';
import { imageLabelFor } from '@/lib/draw-engine';
import { computeModuleLayout } from '@/lib/grid-layout';
import { DEFAULT_MODULE_STYLE } from '@/lib/defaults';
import PrizeModule from '@/components/display/PrizeModule';
import { setWriteFailureGuard, useLotteryStore } from '@/store/useStore';

const s = () => useLotteryStore.getState();
const byId = () => new Map(s().prizeImages.map((img) => [img.id, img]));
const image = (n: number, group = ''): PrizeImage => ({ id: `img${n}`, serial: n, label: `图片${n}`, group, createdAt: 0 });

// 写入失败标记是模块级状态：每个用例前后都复位，避免用例间泄漏
beforeEach(() => {
  setWriteFailureGuard(false);
  useLotteryStore.setState({ prizeImages: [1, 2, 3, 4].map((n) => image(n, n === 2 ? '旧组' : '')), winners: [], currentRound: null });
});

afterEach(() => {
  setWriteFailureGuard(false);
  vi.restoreAllMocks();
});

const apply = (updates: { id: string; group: string }[]) => {
  for (const u of updates) s().updatePrizeImage(u.id, { group: u.group });
};
// 与 ImagePoolTab 的「批量设分组」同一条路径：setGroupUpdates → updatePrizeImage
function batchSet(ids: string[], raw: string) {
  apply(setGroupUpdates(s().prizeImages, ids, raw));
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

  it('目标分组留空时「批量设分组」不清除任何分组（只有显式「清除分组」才清）', () => {
    const before = s().prizeImages;
    expect(setGroupUpdates(before, ['img1', 'img2'], '')).toEqual([]);
    batchSet(['img1', 'img2'], '   ');
    expect(s().prizeImages).toBe(before);
    expect(s().prizeImages[1].group).toBe('旧组');
  });

  it('显式「清除分组」清空选中图片的分组，并只报告真正改动的张数', () => {
    const updates = clearGroupUpdates(s().prizeImages, ['img1', 'img2']);
    expect(updates).toEqual([{ id: 'img2', group: '' }]); // img1 本来就没有分组，不计入
    apply(updates);
    expect(s().prizeImages[1].group).toBe('');
  });

  it('改动张数 = 实际变化的张数（已在目标分组的不计）', () => {
    expect(setGroupUpdates(s().prizeImages, ['img1', 'img2', 'img3'], '旧组').map((u) => u.id)).toEqual(['img1', 'img3']);
  });

  it('已是目标分组的跳过', () => {
    expect(groupUpdates(s().prizeImages, ['img2'], '旧组')).toEqual([]);
  });
});

describe('持久化写入失败保护（后台 1s 轮询 rehydrate 不能还原内存修改）', () => {
  const failWrites = () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  };
  const groups = () => s().prizeImages.map((i) => i.group);
  const SET = ['一等奖', '一等奖', '一等奖'];

  it('后台（开启保护）：写入失败后 rehydrate 不会把刚设的分组冲掉', async () => {
    setWriteFailureGuard(true);
    useLotteryStore.setState({ prizeImages: [1, 2, 3].map((n) => image(n)) });
    failWrites();
    batchSet(['img1', 'img2', 'img3'], '一等奖');
    await useLotteryStore.persist.rehydrate();
    expect(groups()).toEqual(SET);
  });

  it('恢复：写入失败后空间释放、再次写入成功，rehydrate 恢复与存档同步', async () => {
    setWriteFailureGuard(true);
    useLotteryStore.setState({ prizeImages: [1, 2, 3].map((n) => image(n)) });
    failWrites();
    batchSet(['img1', 'img2', 'img3'], '一等奖');
    vi.restoreAllMocks(); // 空间释放
    s().updatePrizeImage('img1', { label: '触发一次成功写入' });
    // 存档里现在是最新状态；另一个窗口随后写入的内容应被 rehydrate 读到
    const stored = localStorage.getItem('lucky-draw-storage')!;
    expect(stored).toBeTruthy();
    await useLotteryStore.persist.rehydrate();
    expect(groups()).toEqual(SET);
    expect(s().prizeImages[0].label).toBe('触发一次成功写入');
  });

  it('大屏（不开启保护）：自己的写入失败不会冻结同步，仍读取后台写入的存档', async () => {
    // 大屏写入失败（例如挂载时 setViewMode）：标记置位，但大屏没有开启保护
    failWrites();
    s().setViewMode('lottery');
    vi.restoreAllMocks();
    // 之后后台（另一个窗口）写入了新的存档：分组全为一等奖
    // 存档读取兼容明文 JSON（历史格式），这里直接写明文
    const adminState = { prizeImages: [1, 2, 3].map((n) => image(n, '一等奖')) };
    localStorage.setItem('lucky-draw-storage', JSON.stringify({ state: adminState, version: 9 }));
    await useLotteryStore.persist.rehydrate();
    expect(groups()).toEqual(SET);
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

  const SHOW_ON: ModuleStyle = { ...DEFAULT_MODULE_STYLE, showImageLabel: true, showName: true };
  const SHOW_OFF: ModuleStyle = { ...DEFAULT_MODULE_STYLE, showImageLabel: false, showName: true };
  // 大屏渲染一个已定格的模块：说明取自 imageLabelFor（与 DrawStage 同一条路径）
  const renderModule = (style: ModuleStyle) => {
    const layout = computeModuleLayout({
      containerWidth: 400, containerHeight: 400, count: 1, columns: 0, gap: 20, scale: 1,
      nameFontSize: style.nameStyle.fontSize, labelFontSize: style.labelStyle.fontSize,
      showName: style.showName, showLabel: style.showImageLabel,
    });
    return renderToStaticMarkup(createElement(PrizeModule, {
      layout, style, state: 'revealed', name: '张三',
      label: imageLabelFor(byId(), 'img1', undefined),
    }));
  };

  it('showImageLabel 开启：编辑后的说明出现在大屏模块里（旧说明消失）', () => {
    expect(renderModule(SHOW_ON)).toContain('图片1');
    s().updatePrizeImage('img1', { label: '新说明XYZ' });
    const html = renderModule(SHOW_ON);
    expect(html).toContain('新说明XYZ');
    expect(html).not.toContain('>图片1<');
  });

  it('showImageLabel 关闭：说明不会渲染（编辑「没有效果」的原因）', () => {
    s().updatePrizeImage('img1', { label: '新说明XYZ' });
    expect(renderModule(SHOW_OFF)).not.toContain('新说明XYZ');
  });

  it('showImageLabel 默认关闭', () => {
    expect(DEFAULT_MODULE_STYLE.showImageLabel).toBe(false);
  });

  it('图片已被删除时退回中奖记录里的说明快照；两者都没有则为 null', () => {
    expect(imageLabelFor(byId(), 'gone', '快照')).toBe('快照');
    expect(imageLabelFor(byId(), 'gone', undefined)).toBeNull();
    expect(imageLabelFor(byId(), null, undefined)).toBeNull();
  });
});
