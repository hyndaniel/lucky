export interface ModuleLayoutInput {
  containerWidth: number; containerHeight: number; count: number;
  columns: number;          // 每排数量覆盖值，0 = 自动（内部调用 getGridColumns）
  gap: number;
  scale: number;            // 0.4..2（= moduleScale / 100）；>1 时图片区按倍数放大并允许溢出格子，上限见 MAX_OVERFLOW
  nameFontSize: number; labelFontSize: number; showName: boolean; showLabel: boolean;
  showDept?: boolean;       // 为部门行（约 0.7× 名字字号）预留高度
}

export interface ModuleLayout {
  columns: number; rows: number; cellWidth: number; cellHeight: number;
  moduleSize: number;       // 方形图片区边长
  cardWidth: number; cardHeight: number; padding: number;
  // 渲染网格时每个格子 / 每排的实际尺寸：scale <= 1 时 = cellWidth / cellHeight；
  // scale > 1 时取 max(cell, card)，使行 / 列间距 ≥ 卡片尺寸，放大后的卡片互不重叠（整个网格居中并向四周溢出）
  slotWidth: number; slotHeight: number;
  nameFontSize: number; labelFontSize: number; deptFontSize: number; textHeight: number;
}

// 1–12 个模块的每排数量预设（下标 n−1）：6=3×2、10=5×2、12=4×3
const PRESET_COLUMNS = [1, 2, 3, 4, 5, 3, 4, 4, 5, 5, 4, 4];
const MIN_MODULE_SIZE = 40;
// scale > 1 时整个网格（含间距）最多比容器大这个倍数；超出部分向四周对称溢出
const MAX_OVERFLOW = 1.6;
// 大屏模块网格的格间距（px）；后台预览用同一个值
export const GRID_GAP = 20;
export const DEPT_RATIO = 0.7; // 部门字号 / 名字字号

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
// 字号不随 scale 缩小，只受格子上限约束；scale > 1 时图片区 = 适配尺寸 × scale，允许溢出格子（网格总尺寸 ≤ 容器 × MAX_OVERFLOW）
export function computeModuleLayout(input: ModuleLayoutInput): ModuleLayout {
  const { containerWidth, containerHeight, count, scale } = input;
  const gap = effectiveGap(input.gap, scale);

  const columns = getGridColumns(count, input.columns);
  const rows = Math.max(1, Math.ceil(count / columns)); // count 为 0 时按 1 排，避免除以 0

  // 容器尚未测量（宽高为 0）时不产生负数
  const cellWidth = Math.max(0, Math.floor((containerWidth - gap * (columns - 1)) / columns));
  const cellHeight = Math.max(0, Math.floor((containerHeight - gap * (rows - 1)) / rows));

  const nameFontSize = input.showName
    ? Math.floor(Math.min(input.nameFontSize, cellHeight * 0.2, cellWidth * 0.16))
    : 0;
  const labelFontSize = input.showLabel
    ? Math.floor(Math.min(input.labelFontSize, cellHeight * 0.14, cellWidth * 0.12))
    : 0;

  const deptFontSize = input.showDept && nameFontSize > 0 ? Math.floor(nameFontSize * DEPT_RATIO) : 0;
  const textHeight = Math.floor(nameFontSize * 1.5 + labelFontSize * 1.5 + deptFontSize * 1.5);
  const padding = Math.floor(clamp(Math.min(cellWidth, cellHeight) * 0.05, 4, 16));

  const fitSize = Math.min(cellWidth - 2 * padding, cellHeight - 2 * padding - textHeight);
  // scale <= 1：按适配尺寸缩小。scale > 1：真正按倍数放大，但网格总尺寸不超过容器 × MAX_OVERFLOW
  let scaledSize = fitSize * scale;
  if (scale > 1) {
    const boundH = Math.floor((containerHeight * MAX_OVERFLOW - gap * (rows - 1)) / rows) - 2 * padding - textHeight;
    const boundW = Math.floor(((containerWidth * MAX_OVERFLOW - gap * (columns - 1)) / columns) / 1.4);
    scaledSize = Math.max(fitSize, Math.min(scaledSize, boundH, boundW));
  }
  const moduleSize = Math.max(MIN_MODULE_SIZE, Math.floor(scaledSize));

  // 卡片宽度：放大后可超出格子宽度
  const cardWidth = Math.floor(Math.max(moduleSize + 2 * padding, moduleSize * 1.4));
  const cardWidthCapped = scale > 1 ? cardWidth : Math.min(cellWidth, cardWidth);
  const cardHeight = moduleSize + 2 * padding + textHeight;

  const slotWidth = scale > 1 ? Math.max(cellWidth, cardWidthCapped) : cellWidth;
  const slotHeight = scale > 1 ? Math.max(cellHeight, cardHeight) : cellHeight;

  return {
    columns, rows, cellWidth, cellHeight, moduleSize,
    slotWidth, slotHeight,
    cardWidth: cardWidthCapped, cardHeight, padding, nameFontSize, labelFontSize, deptFontSize, textHeight,
  };
}
