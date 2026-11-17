import { FONT_PRESETS } from '@/lib/defaults';
import { DEPT_RATIO } from '@/lib/grid-layout';
import { fitFontSize } from '@/lib/fit-text';
import type { TextMeasurer } from '@/lib/text-measure';
import type { DecorPosition, UploadedFont, VAlign } from '@/lib/types';

// 后台排版编辑器的纯逻辑：各页可编辑哪些部分、字体选项、字体上传校验

export type LayoutPage = 'welcome' | 'prize' | 'lottery';

export const PAGE_LABELS: Record<LayoutPage, string> = {
  welcome: '欢迎页',
  prize: '奖项页',
  lottery: '抽奖页',
};

export interface PageEditorSections {
  subtitle: boolean;            // 该页是否渲染副标题（奖项页只有标题）
  titleLabel: string;
  subtitleLabel: string;
  verticalOptions: { value: VAlign; label: string }[];
}

const V_LABELS: Record<VAlign, string> = { top: '靠上', center: '居中', bottom: '靠下' };
const opts = (values: VAlign[]) => values.map((value) => ({ value, label: V_LABELS[value] }));

// 各页实际渲染的元素决定编辑器暴露的控件：
// - 奖项页只渲染标题，不暴露副标题
// - 抽奖页的页头在网格之前（top / center 等效）或之后（bottom），所以不提供无意义的「居中」
export function pageEditorSections(page: LayoutPage): PageEditorSections {
  switch (page) {
    case 'welcome':
      return { subtitle: true, titleLabel: '标题', subtitleLabel: '副标题', verticalOptions: opts(['top', 'center', 'bottom']) };
    case 'prize':
      return { subtitle: false, titleLabel: '标题', subtitleLabel: '', verticalOptions: opts(['top', 'center', 'bottom']) };
    case 'lottery':
      return { subtitle: true, titleLabel: '奖项名', subtitleLabel: '顶部小标题与轮次', verticalOptions: opts(['top', 'bottom']) };
  }
}

// 抽奖页的 center 与 top 渲染结果相同：存档里若是 center，编辑器按 top 显示
export function displayVerticalAlign(page: LayoutPage, value: VAlign): VAlign {
  return page === 'lottery' && value === 'center' ? 'top' : value;
}

export const DECOR_POSITIONS: DecorPosition[][] = [
  ['top-left', 'top-center', 'top-right'],
  ['center-left', 'center', 'center-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
];

export const DECOR_POSITION_LABELS: Record<DecorPosition, string> = {
  'top-left': '左上', 'top-center': '上中', 'top-right': '右上',
  'center-left': '左中', center: '正中', 'center-right': '右中',
  'bottom-left': '左下', 'bottom-center': '下中', 'bottom-right': '右下',
};

// ---- 字体 ----

export const FOLLOW_GLOBAL_FONT = '__follow__'; // Select 不允许空字符串值，用哨兵代表「跟随全局」

// 上传字体写入 fontFamily 时使用的 CSS 值（family 带引号，后接通用族兜底）
export function uploadedFontValue(font: Pick<UploadedFont, 'family'>): string {
  return `'${font.family}', sans-serif`;
}

export interface FontOption { value: string; label: string; group: 'follow' | 'preset' | 'uploaded' | 'current' }

// 字体下拉选项：跟随全局 + 内置预设 + 已上传字体；当前值不在列表里（如已删除的字体）时补一项，避免下拉空白
export function fontOptions(fonts: UploadedFont[], current: string): FontOption[] {
  const list: FontOption[] = [
    { value: FOLLOW_GLOBAL_FONT, label: '跟随全局字体', group: 'follow' },
    ...FONT_PRESETS.map((f) => ({ value: f.value, label: f.label, group: 'preset' as const })),
    ...fonts.map((f) => ({ value: uploadedFontValue(f), label: `上传 / ${f.name}`, group: 'uploaded' as const })),
  ];
  if (current && !list.some((o) => o.value === current)) list.push({ value: current, label: '当前字体（自定义）', group: 'current' });
  return list;
}

export const toSelectValue = (fontFamily: string): string => fontFamily || FOLLOW_GLOBAL_FONT;
export const fromSelectValue = (value: string): string => (value === FOLLOW_GLOBAL_FONT ? '' : value);

// 字体引用了某个上传字体 family 吗（删除字体时用来清掉引用）
export function usesFont(fontFamily: string, font: Pick<UploadedFont, 'family'>): boolean {
  return fontFamily.includes(`'${font.family}'`);
}

export const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];
export const FONT_ACCEPT = FONT_EXTENSIONS.map((e) => `.${e}`).join(',');
export const MAX_FONT_BYTES = 15 * 1024 * 1024;

export function validateFontFile(file: { name: string; size: number }): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!FONT_EXTENSIONS.includes(ext)) return '仅支持 .ttf / .otf / .woff / .woff2 字体文件';
  if (file.size > MAX_FONT_BYTES) return `字体文件不能超过 ${MAX_FONT_BYTES / 1024 / 1024}MB`;
  if (file.size === 0) return '字体文件为空';
  return null;
}

// 为一次上传生成字体记录。family 用 id 区分（不取自文件名）：同名字体两次上传也不会撞同一个 CSS family
export function createUploadedFont(id: string, fileName: string): UploadedFont {
  return { key: `font-${id}`, family: `LuckyFont-${id}`, name: fileName };
}

// ---- 模块预览 ----

export const PREVIEW_SAMPLE = { label: '示例奖品：超长的奖品说明文字', name: '张三', dept: '技术研发部' };

// 预览的统一字号：与大屏同一算法（fitFontSize 对样例文字测算）。measure 为 null（无 canvas）时退回布局字号
export function previewFontSizes(
  layout: { nameFontSize: number; labelFontSize: number; cardWidth: number; padding: number },
  showDept: boolean,
  measureFor: (weight: number) => TextMeasurer | null,
): { nameFontSize: number; labelFontSize: number; deptFontSize: number } {
  const width = Math.max(0, layout.cardWidth - 2 * layout.padding);
  const fit = (text: string, base: number, weight: number) => {
    const measure = measureFor(weight);
    return measure && base > 0 ? fitFontSize([text], width, base, measure) : base;
  };
  const nameFontSize = fit(PREVIEW_SAMPLE.name, layout.nameFontSize, 700);
  return {
    nameFontSize,
    labelFontSize: fit(PREVIEW_SAMPLE.label, layout.labelFontSize, 500),
    deptFontSize: showDept ? fit(PREVIEW_SAMPLE.dept, Math.floor(nameFontSize * DEPT_RATIO), 500) : 0,
  };
}
