import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRIZE_LAYOUT, DEFAULT_WELCOME_LAYOUT, FONT_PRESETS } from '@/lib/defaults';
import {
  FOLLOW_GLOBAL_FONT, createUploadedFont, displayVerticalAlign, fontOptions, fromSelectValue, pageEditorSections,
  previewFontSizes, toSelectValue, uploadedFontValue, usesFont, validateFontFile,
} from '@/lib/layout-editor';

vi.mock('@/lib/media-store', () => ({ putMedia: async () => undefined, deleteMedia: async () => undefined, getMediaUrl: async () => null }));
vi.mock('@/hooks/useMediaStoreAvailable', () => ({ useMediaStoreAvailable: () => true }));

import { PageLayoutEditor } from '@/components/admin/PageLayoutEditor';

describe('pageEditorSections', () => {
  it('奖项页没有副标题控件（大屏只渲染标题）', () => {
    expect(pageEditorSections('prize').subtitle).toBe(false);
    expect(pageEditorSections('welcome').subtitle).toBe(true);
    expect(pageEditorSections('lottery').subtitle).toBe(true);
  });

  it('抽奖页不提供无意义的「居中」纵向位置；欢迎页 / 奖项页三项齐全', () => {
    expect(pageEditorSections('lottery').verticalOptions.map((o) => o.value)).toEqual(['top', 'bottom']);
    expect(pageEditorSections('welcome').verticalOptions.map((o) => o.value)).toEqual(['top', 'center', 'bottom']);
    expect(pageEditorSections('prize').verticalOptions.map((o) => o.value)).toEqual(['top', 'center', 'bottom']);
  });

  it('抽奖页存档里的 center 按 top 显示，其它页原样', () => {
    expect(displayVerticalAlign('lottery', 'center')).toBe('top');
    expect(displayVerticalAlign('lottery', 'bottom')).toBe('bottom');
    expect(displayVerticalAlign('welcome', 'center')).toBe('center');
  });
});

describe('字体选项', () => {
  const uploaded = [{ key: 'font-a', family: 'LuckyFont-a', name: '站酷.ttf' }];

  it('包含跟随全局、全部内置预设与已上传字体', () => {
    const options = fontOptions(uploaded, '');
    expect(options[0]).toMatchObject({ value: FOLLOW_GLOBAL_FONT, group: 'follow' });
    expect(options.filter((o) => o.group === 'preset')).toHaveLength(FONT_PRESETS.length);
    expect(options.at(-1)).toMatchObject({ value: uploadedFontValue(uploaded[0]), group: 'uploaded' });
  });

  it('当前值不在列表里（字体已删除）时补一项，不让下拉空白', () => {
    const options = fontOptions([], "'LuckyFont-gone', sans-serif");
    expect(options.at(-1)).toMatchObject({ value: "'LuckyFont-gone', sans-serif", group: 'current' });
    expect(fontOptions([], FONT_PRESETS[0].value).some((o) => o.group === 'current')).toBe(false);
  });

  it('Select 值与 fontFamily 互转：空串 = 跟随全局', () => {
    expect(toSelectValue('')).toBe(FOLLOW_GLOBAL_FONT);
    expect(fromSelectValue(FOLLOW_GLOBAL_FONT)).toBe('');
    expect(fromSelectValue(FONT_PRESETS[1].value)).toBe(FONT_PRESETS[1].value);
  });

  it('usesFont 按引号包裹的 family 判断', () => {
    expect(usesFont(uploadedFontValue(uploaded[0]), uploaded[0])).toBe(true);
    expect(usesFont(FONT_PRESETS[0].value, uploaded[0])).toBe(false);
    expect(usesFont("'LuckyFont-ab', sans-serif", { family: 'LuckyFont-a' })).toBe(false);
  });
});

describe('字体上传', () => {
  it('同名文件两次上传得到不同的 key 与 family', () => {
    const a = createUploadedFont('id1', 'same.ttf');
    const b = createUploadedFont('id2', 'same.ttf');
    expect(a.key).toBe('font-id1');
    expect(a.family).not.toBe(b.family);
    expect(a.family).toContain('id1');
    expect(a.name).toBe('same.ttf');
  });

  it('只接受 ttf / otf / woff / woff2，限制大小，拒绝空文件', () => {
    expect(validateFontFile({ name: 'a.TTF', size: 100 })).toBeNull();
    expect(validateFontFile({ name: 'a.woff2', size: 100 })).toBeNull();
    expect(validateFontFile({ name: 'a.exe', size: 100 })).toMatch(/仅支持/);
    expect(validateFontFile({ name: 'a.ttf', size: 16 * 1024 * 1024 })).toMatch(/不能超过/);
    expect(validateFontFile({ name: 'a.ttf', size: 0 })).toMatch(/为空/);
  });
});

describe('previewFontSizes（后台预览与大屏同一算法）', () => {
  const layout = { nameFontSize: 40, labelFontSize: 24, cardWidth: 200, padding: 10 };
  const measure = (text: string, size: number) => text.length * size; // 每字一个字号宽

  it('过长的样例文字被统一缩小到放得下；放得下的保持布局字号', () => {
    const sizes = previewFontSizes(layout, false, () => measure);
    expect(sizes.nameFontSize).toBe(40); // 2 字 × 40 = 80 ≤ 180
    expect(sizes.labelFontSize).toBeLessThan(24); // 说明很长，必须缩小
    expect(sizes.labelFontSize).toBeGreaterThanOrEqual(10);
    expect(sizes.deptFontSize).toBe(0);
  });

  it('showDept 时部门字号 ≤ 名字字号 × 0.7', () => {
    const sizes = previewFontSizes(layout, true, () => measure);
    expect(sizes.deptFontSize).toBeGreaterThan(0);
    expect(sizes.deptFontSize).toBeLessThanOrEqual(Math.floor(sizes.nameFontSize * 0.7));
  });

  it('无 canvas（measure 为 null）时退回布局字号', () => {
    expect(previewFontSizes(layout, true, () => null)).toEqual({ nameFontSize: 40, labelFontSize: 24, deptFontSize: 28 });
  });
});

describe('PageLayoutEditor 渲染', () => {
  const render = (page: 'welcome' | 'prize' | 'lottery') => renderToStaticMarkup(createElement(PageLayoutEditor, {
    page,
    layout: page === 'prize' ? DEFAULT_PRIZE_LAYOUT : DEFAULT_WELCOME_LAYOUT,
    fonts: [],
  }));

  it('奖项页只出现标题控件，没有副标题控件', () => {
    const html = render('prize');
    expect(html).toContain('prize-title');
    expect(html).not.toContain('prize-subtitle');
  });

  it('没有装饰图时不显示宽度 / 位置控件', () => {
    expect(render('welcome')).not.toContain('decor-position');
  });

  it('欢迎页同时出现标题与副标题控件；有装饰图时有 9 个装饰位置按钮', () => {
    const html = renderToStaticMarkup(createElement(PageLayoutEditor, {
      page: 'welcome',
      layout: { ...DEFAULT_WELCOME_LAYOUT, decor: { ...DEFAULT_WELCOME_LAYOUT.decor, imageKey: 'decor-welcome-x', imageName: 'a.png' } },
      fonts: [],
    }));
    expect(html).toContain('welcome-title');
    expect(html).toContain('welcome-subtitle');
    expect(html.match(/data-testid="decor-position"/g)).toHaveLength(9);
  });

  it('抽奖页纵向位置没有「居中」', () => {
    const html = render('lottery');
    expect(html).toContain('靠下');
    expect(html).not.toContain('居中</');
  });
});
