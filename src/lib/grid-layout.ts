import type { ModuleShape } from '@/lib/types';

export interface ModuleLayoutInput {
  containerWidth: number; containerHeight: number; count: number;
  columns: number;          // 每排数量覆盖值，0 = 自动（内部调用 getGridColumns）
  gap: number;
  scale: number;            // 0.4..2（= moduleScale / 100）；<1 缩小，>1 时格间距收到 0、卡片尽量撑满格子；网格永不超出容器（MAX_OVERFLOW = 1）
  nameFontSize: number; labelFontSize: number; showName: boolean; showLabel: boolean;
  showDept?: boolean;       // 为部门行（约 0.7× 名字字号）预留高度
  shape?: ModuleShape;      // 'circle' 时卡片为正圆（宽 = 高 = 直径），内容收进内接正方形；缺省 / 其它形状走矩形卡片
}

export interface ModuleLayout {
  columns: number; rows: number; cellWidth: number; cellHeight: number;
  moduleSize: number;       // 方形图片区边长
  cardWidth: number; cardHeight: number; padding: number;
  // 渲染网格时每个格子 / 每排的实际尺寸 = cellWidth / cellHeight（卡片永不超出格子，网格永不超出容器）
  slotWidth: number; slotHeight: number;
  nameFontSize: number; labelFontSize: number; deptFontSize: number; textHeight: number;
}

// 1–12 个模块的每排数量预设（下标 n−1）：6=3×2、10=5×2、12=4×3
const PRESET_COLUMNS = [1, 2, 3, 4, 5, 3, 4, 4, 5, 5, 4, 4];
const MIN_MODULE_SIZE = 40;
// 整个网格（含间距）最多是容器的这个倍数。1 = 永不溢出：放大只在网格自己的区域内进行，不会盖住页头
const MAX_OVERFLOW = 1;
// 大屏模块网格的格间距（px）；后台预览用同一个值
export const GRID_GAP = 20;
export const DEPT_RATIO = 0.7; // 部门字号 / 名字字号
const LINE_HEIGHT_RATIO = 1.25; // 文字行高系数（与 PrizeModule 的 FitLine 保持一致）
// 卡片宽度相对图片区的系数：越接近 1 卡片越方正、横向留白越少
const CARD_WIDTH_RATIO = 1.12;
// 圆形卡片：内容区（正方形）边长 / 直径。严格小于 1/√2≈0.7071，内容四角留在圆内
const CIRCLE_CONTENT_RATIO = 0.7;

export function getGridColumns(count: number, override = 0): number {
  if (count <= 0) return 1;
  if (override > 0) return Math.min(override, count);
  if (count <= PRESET_COLUMNS.length) return PRESET_COLUMNS[count - 1];
  return Math.ceil(Math.sqrt(count * 1.6));
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// 实际使用的格间距：scale > 1 时随放大线性收到 0（scale 2 时为 0），避免放大后相邻卡片过早相撞。
// DrawStage 渲染网格时也必须用这个值
export function effectiveGap(gap: number, scale: number): number {
  return scale > 1 ? Math.max(0, Math.round(gap * (2 - Math.min(2, scale)))) : gap;
}

// 每个格子放一张卡片：方形图片区 + 下方文字区。逐步计算，每一步先取整再用于下一步；
// 字号不随 scale 缩小，只受格子上限约束；scale > 1 时图片区 = 适配尺寸 × scale，但总尺寸不超过格子（网格 ≤ 容器 × MAX_OVERFLOW）
export function computeModuleLayout(input: ModuleLayoutInput): ModuleLayout {
  const { containerWidth, containerHeight, count, scale } = input;
  const gap = effectiveGap(input.gap, scale);

  const columns = getGridColumns(count, input.columns);
  const rows = Math.max(1, Math.ceil(count / columns)); // count 为 0 时按 1 排，避免除以 0

  // 容器尚未测量（宽高为 0）时不产生负数
  const cellWidth = Math.max(0, Math.floor((containerWidth - gap * (columns - 1)) / columns));
  const cellHeight = Math.max(0, Math.floor((containerHeight - gap * (rows - 1)) / rows));
  const isCircle = input.shape === 'circle';

  // 圆形：卡片直径 = 格子短边（scale < 1 时再按倍数缩小），字号上限与内边距都按直径算；其它形状按格子宽高
  const diameter = isCircle ? Math.floor(Math.min(cellWidth, cellHeight) * Math.min(1, scale)) : 0;
  const boxWidth = isCircle ? diameter : cellWidth;
  const boxHeight = isCircle ? diameter : cellHeight;

  // 文字区按格子比例设上限：name/label 的高度占比压低（0.2→0.14、0.14→0.10），
  // 让方形图片区成为卡片主体，减少瘦高卡片与横向留白
  const nameFontSize = input.showName
    ? Math.floor(Math.min(input.nameFontSize, boxHeight * 0.14, boxWidth * 0.16))
    : 0;
  const labelFontSize = input.showLabel
    ? Math.floor(Math.min(input.labelFontSize, boxHeight * 0.1, boxWidth * 0.12))
    : 0;

  const deptFontSize = input.showDept && nameFontSize > 0 ? Math.floor(nameFontSize * DEPT_RATIO) : 0;
  // 行高 1.5→1.25：文字区整体收窄，卡片更方正
  const textHeight = Math.floor((nameFontSize + labelFontSize + deptFontSize) * LINE_HEIGHT_RATIO);

  if (isCircle) {
    // 内容（宽 = moduleSize，高 = moduleSize + textHeight）必须落在内接正方形里；padding 把内容区撑到 content 边长
    const content = Math.floor(diameter * CIRCLE_CONTENT_RATIO);
    const padding = Math.floor((diameter - content) / 2);
    const moduleSize = Math.max(MIN_MODULE_SIZE, content - textHeight);
    return {
      columns, rows, cellWidth, cellHeight, moduleSize,
      slotWidth: cellWidth, slotHeight: cellHeight,
      cardWidth: diameter, cardHeight: diameter, padding, nameFontSize, labelFontSize, deptFontSize, textHeight,
    };
  }

  const padding = Math.floor(clamp(Math.min(cellWidth, cellHeight) * 0.05, 4, 16));

  const fitSize = Math.min(cellWidth - 2 * padding, cellHeight - 2 * padding - textHeight);
  // scale <= 1：按适配尺寸缩小。scale > 1：按倍数放大，但网格总尺寸不超过容器 × MAX_OVERFLOW
  let scaledSize = fitSize * scale;
  if (scale > 1) {
    const boundH = Math.floor((containerHeight * MAX_OVERFLOW - gap * (rows - 1)) / rows) - 2 * padding - textHeight;
    const boundW = Math.floor(((containerWidth * MAX_OVERFLOW - gap * (columns - 1)) / columns) / CARD_WIDTH_RATIO);
    scaledSize = Math.max(fitSize, Math.min(scaledSize, boundH, boundW));
  }
  const moduleSize = Math.max(MIN_MODULE_SIZE, Math.floor(scaledSize));

  // 卡片宽度：略宽于图片区（留文字边距），不超过格子宽度
  const cardWidth = Math.min(cellWidth, Math.floor(Math.max(moduleSize + 2 * padding, moduleSize * CARD_WIDTH_RATIO)));
  const cardHeight = moduleSize + 2 * padding + textHeight;

  return {
    columns, rows, cellWidth, cellHeight, moduleSize,
    slotWidth: cellWidth, slotHeight: cellHeight,
    cardWidth, cardHeight, padding, nameFontSize, labelFontSize, deptFontSize, textHeight,
  };
}
