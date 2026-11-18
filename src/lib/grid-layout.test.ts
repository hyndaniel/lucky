import { describe, expect, it } from 'vitest';
import { computeModuleLayout, effectiveGap, getGridColumns, type ModuleLayoutInput } from '@/lib/grid-layout';

describe('getGridColumns', () => {
  it('1..12 使用预设表', () => {
    const result = Array.from({ length: 12 }, (_, i) => getGridColumns(i + 1));
    expect(result).toEqual([1, 2, 3, 4, 5, 3, 4, 4, 5, 5, 4, 4]);
  });

  it('>12 用 ceil(sqrt(n × 1.6))', () => {
    expect(getGridColumns(13)).toBe(5);
    expect(getGridColumns(20)).toBe(6);
    expect(getGridColumns(58)).toBe(10);
    expect(getGridColumns(60)).toBe(10);
  });

  it('override > 0 时固定每排数量，但不超过 count', () => {
    expect(getGridColumns(12, 3)).toBe(3);
    expect(getGridColumns(2, 5)).toBe(2);
    expect(getGridColumns(20, 0)).toBe(6);
  });

  it('count <= 0 时返回 1', () => {
    expect(getGridColumns(0)).toBe(1);
    expect(getGridColumns(0, 4)).toBe(1);
  });
});

describe('computeModuleLayout', () => {
  const base: ModuleLayoutInput = {
    containerWidth: 1920, containerHeight: 800, count: 12, columns: 0, gap: 16, scale: 1,
    nameFontSize: 40, labelFontSize: 22, showName: true, showLabel: false,
  };

  it('1920×800、12 个、只显示名字 40px 时的精确结果', () => {
    expect(computeModuleLayout(base)).toEqual({
      columns: 4, rows: 3, cellWidth: 468, cellHeight: 256,
      nameFontSize: 40, labelFontSize: 0, deptFontSize: 0, textHeight: 60, padding: 12,
      moduleSize: 172, cardWidth: 240, cardHeight: 256, slotWidth: 468, slotHeight: 256,
    });
  });

  it('scale 0.5 时图片区减半，字号不变', () => {
    const layout = computeModuleLayout({ ...base, scale: 0.5 });
    expect(layout.moduleSize).toBe(86);
    expect(layout.nameFontSize).toBe(40);
  });

  it('scale > 1 真正放大：200% 至少是 100% 的 1.5 倍，且不同档位有区别（无死区）', () => {
    const one = computeModuleLayout(base).moduleSize;
    const m = (scale: number) => computeModuleLayout({ ...base, scale }).moduleSize;
    expect(m(2)).toBeGreaterThanOrEqual(one * 1.5);
    expect(m(2)).toBeGreaterThanOrEqual(m(1.8) + 10); // 1.8 与 2 之间无死区
    expect(m(1.5)).toBeGreaterThan(m(1.2));
    expect(m(1.8)).toBeGreaterThan(m(1.5));
    expect(m(1.2)).toBeGreaterThan(one);
  });

  it('放大时网格总尺寸有上限（≤ 容器 × 1.6），间距随放大收到 0', () => {
    const layout = computeModuleLayout({ ...base, scale: 2 });
    expect(effectiveGap(16, 2)).toBe(0);
    expect(effectiveGap(16, 1)).toBe(16);
    expect(effectiveGap(16, 0.5)).toBe(16);
    expect(layout.rows * layout.cardHeight).toBeLessThanOrEqual(800 * 1.6 + 1);
    expect(layout.columns * layout.cardWidth).toBeLessThanOrEqual(1920 * 1.6 + 1);
  });

  it('放大时行距 / 列距 ≥ 卡片尺寸（相邻行、列不重叠），且网格总高度有上限', () => {
    for (const scale of [1, 1.2, 1.5, 1.8, 2]) {
      const l = computeModuleLayout({ ...base, scale });
      const gap = effectiveGap(base.gap, scale);
      expect(l.slotHeight + gap, `row pitch @${scale}`).toBeGreaterThanOrEqual(l.cardHeight);
      expect(l.slotWidth + gap, `col pitch @${scale}`).toBeGreaterThanOrEqual(l.cardWidth);
      expect(l.rows * l.slotHeight + gap * (l.rows - 1)).toBeLessThanOrEqual(800 * 1.6 + l.rows);
    }
  });

  it('各种数量与容器下，scale 1.2..2 的行距都不小于卡片高度', () => {
    const failures: string[] = [];
    for (const [containerWidth, containerHeight] of [[1920, 1080], [1280, 720], [1024, 600]]) {
      for (let count = 1; count <= 40; count++) {
        for (const scale of [1.2, 1.5, 1.8, 2]) {
          const l = computeModuleLayout({ ...base, containerWidth, containerHeight, count, scale });
          const gap = effectiveGap(base.gap, scale);
          if (l.slotHeight + gap < l.cardHeight) failures.push(`${containerWidth}x${containerHeight} n${count} s${scale}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('scale <= 1 的结果不受放大逻辑影响', () => {
    expect(computeModuleLayout({ ...base, scale: 1 }).moduleSize).toBe(172);
    expect(computeModuleLayout({ ...base, scale: 1 }).cardWidth).toBeLessThanOrEqual(468);
  });

  it('请求字号受格子上限约束', () => {
    expect(computeModuleLayout({ ...base, nameFontSize: 120 }).nameFontSize).toBe(51);
  });

  it('58 个（10 列 6 行）在 1920×1000 下名字仍可读', () => {
    const layout = computeModuleLayout({ ...base, containerHeight: 1000, count: 58 });
    expect(layout.columns).toBe(10);
    expect(layout.rows).toBe(6);
    expect(layout.nameFontSize).toBeGreaterThanOrEqual(18);
  });

  it('同时显示名字与说明时文字区高度合计', () => {
    const layout = computeModuleLayout({ ...base, showLabel: true });
    expect(layout.labelFontSize).toBe(22);
    expect(layout.textHeight).toBe(93); // 40×1.5 + 22×1.5
  });

  it('showDept 时为部门行预留高度（约 0.7× 名字字号）', () => {
    const layout = computeModuleLayout({ ...base, showDept: true });
    expect(layout.deptFontSize).toBe(28);
    expect(layout.textHeight).toBe(60 + 42);
    expect(computeModuleLayout({ ...base, showDept: true, showName: false }).deptFontSize).toBe(0);
  });

  it('columns 覆盖值生效', () => {
    const layout = computeModuleLayout({ ...base, columns: 6 });
    expect(layout.columns).toBe(6);
    expect(layout.rows).toBe(2);
  });

  it('任意输入下卡片不超出格子（moduleSize 触发下限 40 的极小容器除外），且结果均为非负整数', () => {
    const containers = [[1920, 1080], [1280, 720], [3840, 1600], [1024, 600], [800, 400], [320, 240]];
    const failures: string[] = [];
    for (const [containerWidth, containerHeight] of containers) {
      for (let count = 1; count <= 60; count++) {
        for (const [showName, showLabel] of [[true, false], [true, true], [false, true], [false, false]]) {
          for (const fontSize of [12, 40, 120]) {
            for (const gap of [0, 16, 32]) {
              const input = {
                containerWidth, containerHeight, count, columns: 0, gap, scale: 1,
                nameFontSize: fontSize, labelFontSize: fontSize, showName, showLabel,
              };
              const layout = computeModuleLayout(input);
              const tag = JSON.stringify(input);
              if (!Object.values(layout).every((v) => Number.isInteger(v) && v >= 0)) failures.push(`非负整数 ${tag}`);
              const { cellWidth, cellHeight, padding, textHeight } = layout;
              const clamped = Math.min(cellWidth - 2 * padding, cellHeight - 2 * padding - textHeight) < 40;
              if (clamped) continue;
              if (layout.cardWidth > cellWidth) failures.push(`cardWidth ${tag}`);
              if (layout.cardHeight > cellHeight) failures.push(`cardHeight ${tag}`);
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('count 为 0 或容器尚未测量时不产生 NaN / 负数', () => {
    for (const input of [{ ...base, count: 0 }, { ...base, containerWidth: 0, containerHeight: 0 }]) {
      Object.values(computeModuleLayout(input)).forEach((v) => {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      });
    }
  });
});
