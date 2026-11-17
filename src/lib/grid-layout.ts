export interface ModuleLayoutInput {
  containerWidth: number; containerHeight: number; count: number;
  columns: number;          // 每排数量覆盖值，0 = 自动（内部调用 getGridColumns）
  gap: number;
  scale: number;            // 0.4..2（= moduleScale / 100）；>1 时可越过格子适配尺寸，上限见 MAX_OVERSHOOT
  nameFontSize: number; labelFontSize: number; showName: boolean; showLabel: boolean;
  showDept?: boolean;       // 为部门行（约 0.7× 名字字号）预留高度
}

export interface ModuleLayout {
  columns: number; rows: number; cellWidth: number; cellHeight: number;
  moduleSize: number;       // 方形图片区边长
  cardWidth: number; cardHeight: number; padding: number;
  nameFontSize: number; labelFontSize: number; deptFontSize: number; textHeight: number;
}

// 1–12 个模块的每排数量预设（下标 n−1）：6=3×2、10=5×2、12=4×3
const PRESET_COLUMNS = [1, 2, 3, 4, 5, 3, 4, 4, 5, 5, 4, 4];
const MIN_MODULE_SIZE = 40;
// scale > 1 时卡片最多向格间距内多伸出 (gap - GAP_KEEP) px，相邻卡片之间至少留 GAP_KEEP px
const GAP_KEEP = 4;
export const DEPT_RATIO = 0.7; // 部门字号 / 名字字号

export function getGridColumns(count: number, override = 0): number {
  if (count <= 0) return 1;
  if (override > 0) return Math.min(override, count);
  if (count <= PRESET_COLUMNS.length) return PRESET_COLUMNS[count - 1];
  return Math.ceil(Math.sqrt(count * 1.6));
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// 每个格子放一张卡片：方形图片区 + 下方文字区。逐步计算，每一步先取整再用于下一步；
// 字号不随 scale 缩小，只受格子上限约束；scale 最大 2，放大幅度受格间距限制
export function computeModuleLayout(input: ModuleLayoutInput): ModuleLayout {
  const { containerWidth, containerHeight, count, gap, scale } = input;

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
  // scale <= 1：按适配尺寸缩小。scale > 1：在适配尺寸之上放大，但最多越过格子 overshoot px（吃掉部分间距）
  const overshoot = scale > 1 ? Math.max(0, gap - GAP_KEEP) : 0;
  const scaledSize = scale > 1 ? Math.min(fitSize * scale, fitSize + overshoot) : fitSize * scale;
  const moduleSize = Math.max(MIN_MODULE_SIZE, Math.floor(scaledSize));

  const cardWidth = Math.floor(Math.min(cellWidth + overshoot, Math.max(moduleSize + 2 * padding, moduleSize * 1.4)));
  const cardHeight = moduleSize + 2 * padding + textHeight;

  return {
    columns, rows, cellWidth, cellHeight, moduleSize,
    cardWidth, cardHeight, padding, nameFontSize, labelFontSize, deptFontSize, textHeight,
  };
}
