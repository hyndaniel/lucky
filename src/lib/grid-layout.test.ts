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
      nameFontSize: 35, labelFontSize: 0, deptFontSize: 0, textHeight: 43, padding: 12,
      moduleSize: 189, cardWidth: 213, cardHeight: 256, slotWidth: 468, slotHeight: 256,
    });
  });

  it('scale 0.5 时图片区减半，字号不变', () => {
    const layout = computeModuleLayout({ ...base, scale: 0.5 });
    expect(layout.moduleSize).toBe(94);
    expect(layout.nameFontSize).toBe(35);
  });

  it('scale > 1 单调不减：放大只在格子内填充，200% 不小于 100%，且不超过格子', () => {
    const m = (scale: number) => computeModuleLayout({ ...base, scale });
    const sizes = [1, 1.2, 1.5, 1.8, 2].map((s) => m(s).moduleSize);
    expect(sizes).toEqual([189, 189, 190, 193, 194]);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
    expect(m(2).moduleSize).toBeGreaterThanOrEqual(m(1).moduleSize);
    // 200% 时间距为 0，卡片高度正好填满格子
    expect(m(2).cardHeight).toBe(m(2).cellHeight);
    expect(m(2).cardHeight).toBeLessThanOrEqual(m(2).cellHeight);
  });

  it('网格永不溢出（总尺寸 ≤ 容器），间距随放大收到 0', () => {
    expect(effectiveGap(16, 2)).toBe(0);
    expect(effectiveGap(16, 1)).toBe(16);
    expect(effectiveGap(16, 0.5)).toBe(16);
    for (const scale of [0.5, 1, 1.5, 2]) {
      const l = computeModuleLayout({ ...base, scale });
      const gap = effectiveGap(base.gap, scale);
      expect(l.rows * l.slotHeight + gap * (l.rows - 1), `height @${scale}`).toBeLessThanOrEqual(800);
      expect(l.columns * l.slotWidth + gap * (l.columns - 1), `width @${scale}`).toBeLessThanOrEqual(1920);
    }
  });

  it('行距 / 列距 ≥ 卡片尺寸（相邻行、列不重叠），且网格总高度不超过容器', () => {
    for (const scale of [1, 1.2, 1.5, 1.8, 2]) {
      const l = computeModuleLayout({ ...base, scale });
      const gap = effectiveGap(base.gap, scale);
      expect(l.slotHeight + gap, `row pitch @${scale}`).toBeGreaterThanOrEqual(l.cardHeight);
      expect(l.slotWidth + gap, `col pitch @${scale}`).toBeGreaterThanOrEqual(l.cardWidth);
      expect(l.rows * l.slotHeight + gap * (l.rows - 1)).toBeLessThanOrEqual(800 + l.rows);
    }
  });

  it('各种数量与容器下，scale 1.2..2 的行距都不小于卡片高度，网格不超出容器', () => {
    const failures: string[] = [];
    for (const [containerWidth, containerHeight] of [[1920, 1080], [1280, 720], [1024, 600]]) {
      for (let count = 1; count <= 40; count++) {
        for (const scale of [1.2, 1.5, 1.8, 2]) {
          const l = computeModuleLayout({ ...base, containerWidth, containerHeight, count, scale });
          const gap = effectiveGap(base.gap, scale);
          const tag = `${containerWidth}x${containerHeight} n${count} s${scale}`;
          if (l.slotHeight + gap < l.cardHeight) failures.push(tag);
          if (l.moduleSize > 40 && l.rows * l.slotHeight + gap * (l.rows - 1) > containerHeight) failures.push(`overflowH ${tag}`);
          if (l.moduleSize > 40 && l.columns * l.slotWidth + gap * (l.columns - 1) > containerWidth) failures.push(`overflowW ${tag}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('scale <= 1 的结果不受放大逻辑影响', () => {
    expect(computeModuleLayout({ ...base, scale: 1 }).moduleSize).toBe(189);
    expect(computeModuleLayout({ ...base, scale: 1 }).cardWidth).toBeLessThanOrEqual(468);
  });

  it('请求字号受格子上限约束', () => {
    expect(computeModuleLayout({ ...base, nameFontSize: 120 }).nameFontSize).toBe(35);
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
    expect(layout.textHeight).toBe(71); // (35 + 22) × 1.25
  });

  it('showDept 时为部门行预留高度（约 0.7× 名字字号）', () => {
    const layout = computeModuleLayout({ ...base, showDept: true });
    expect(layout.deptFontSize).toBe(24);
    expect(layout.textHeight).toBe(Math.floor((35 + 24) * 1.25));
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

  it('circle：卡片为正圆（宽 = 高 = 直径 ≤ 格子短边），内容落在内接正方形内', () => {
    const failures: string[] = [];
    for (const [containerWidth, containerHeight] of [[1920, 1080], [1280, 720], [1024, 600], [3840, 1600]]) {
      for (let count = 1; count <= 40; count++) {
        for (const scale of [0.5, 1, 1.5, 2]) {
          for (const showLabel of [false, true]) {
            const input = { ...base, containerWidth, containerHeight, count, scale, showLabel, showDept: true, shape: 'circle' as const };
            const l = computeModuleLayout(input);
            const tag = JSON.stringify(input);
            if (l.moduleSize <= 40) continue; // 触发下限 40 的极小格子除外
            if (l.cardWidth !== l.cardHeight) failures.push(`not square ${tag}`);
            if (l.cardWidth > Math.min(l.cellWidth, l.cellHeight)) failures.push(`exceeds cell ${tag}`);
            if (l.slotWidth > l.cellWidth || l.slotHeight > l.cellHeight) failures.push(`slot ${tag}`);
            // 内容盒（moduleSize × (moduleSize + textHeight)）四角到圆心的距离 ≤ 半径
            const halfW = l.moduleSize / 2;
            const halfH = (l.moduleSize + l.textHeight) / 2;
            if (Math.hypot(halfW, halfH) > l.cardWidth / 2) failures.push(`corner outside circle ${tag}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('circle 的精确结果（1920×800、12 个、scale 1 / 2）', () => {
    const c = (scale: number) => computeModuleLayout({ ...base, scale, shape: 'circle' });
    expect(c(1)).toEqual({
      columns: 4, rows: 3, cellWidth: 468, cellHeight: 256,
      nameFontSize: 35, labelFontSize: 0, deptFontSize: 0, textHeight: 43, padding: 38,
      moduleSize: 136, cardWidth: 256, cardHeight: 256, slotWidth: 468, slotHeight: 256,
    });
    expect(c(2).cardWidth).toBe(266);
    expect(c(2).cardHeight).toBe(266);
    expect(c(2).moduleSize).toBeGreaterThanOrEqual(c(1).moduleSize);
  });

  it('shape 为 square / rounded / 缺省时与原矩形卡片结果一致', () => {
    const plain = computeModuleLayout(base);
    expect(computeModuleLayout({ ...base, shape: 'square' })).toEqual(plain);
    expect(computeModuleLayout({ ...base, shape: 'rounded' })).toEqual(plain);
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
