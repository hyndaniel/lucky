import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageDecor } from '@/lib/types';
import { decorPositionStyle, textBlockStyle, verticalJustify } from '@/lib/page-layout-style';

// 仓库没有 jsdom：mock 掉 useMediaUrls，直接调用组件函数检查返回的 React 元素。
const media = vi.hoisted(() => ({ urls: {} as Record<string, string>, lastKeys: [] as string[][] }));
vi.mock('@/hooks/useMediaUrls', () => ({
  useMediaUrls: (keys: string[]) => {
    media.lastKeys.push(keys);
    return media.urls;
  },
}));

import PageDecorImage from '@/components/display/PageDecorImage';

const decor = (patch: Partial<PageDecor> = {}): PageDecor => ({
  imageKey: 'decor-1', imageName: 'logo.png', widthPct: 30, position: 'bottom-left', ...patch,
});

// 组件返回单个 React 元素（或 null）；props 直接可读
interface ImgElement { type: string; props: { src: string; alt: string; style: Record<string, unknown> } }

beforeEach(() => {
  media.urls = {};
  media.lastKeys = [];
});

describe('PageDecorImage', () => {
  it('blob 不存在（URL 缺失）时渲染 null，不出现 <img>', () => {
    media.urls = {};
    expect(PageDecorImage({ decor: decor() })).toBeNull();
  });

  it('未设置装饰图（imageKey 为空）时渲染 null，且不去加载空 key', () => {
    media.urls = { '': 'blob:should-not-be-used' };
    expect(PageDecorImage({ decor: decor({ imageKey: '' }) })).toBeNull();
    expect(media.lastKeys.at(-1)).toEqual([]);
  });

  it('URL 已解析时渲染 <img>，按位置与 widthPct 定位', () => {
    media.urls = { 'decor-1': 'blob:ok' };
    const el = PageDecorImage({ decor: decor() }) as unknown as ImgElement;
    expect(el.type).toBe('img');
    expect(el.props.src).toBe('blob:ok');
    expect(el.props.alt).toBe('');
    expect(el.props.style.position).toBe('absolute');
    expect(el.props.style.width).toBe('30%');
    expect(el.props.style.left).toBe(0);
    expect(el.props.style.bottom).toBe(0);
    expect(el.props.style.pointerEvents).toBe('none');
    expect(media.lastKeys.at(-1)).toEqual(['decor-1']);
  });

  it('只解析自己的 key：别的 key 有 URL 也不显示', () => {
    media.urls = { other: 'blob:other' };
    expect(PageDecorImage({ decor: decor() })).toBeNull();
  });
});

describe('decorPositionStyle 九宫格', () => {
  it.each([
    ['top-left', { top: 0, left: 0 }],
    ['top-center', { top: 0, left: '50%', transform: 'translateX(-50%)' }],
    ['top-right', { top: 0, right: 0 }],
    ['center-left', { top: '50%', left: 0, transform: 'translateY(-50%)' }],
    ['center', { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }],
    ['center-right', { top: '50%', right: 0, transform: 'translateY(-50%)' }],
    ['bottom-left', { bottom: 0, left: 0 }],
    ['bottom-center', { bottom: 0, left: '50%', transform: 'translateX(-50%)' }],
    ['bottom-right', { bottom: 0, right: 0 }],
  ] as const)('%s', (position, expected) => {
    const css = decorPositionStyle(position, 25);
    expect(css).toMatchObject({ position: 'absolute', width: '25%', ...expected });
  });

  it('widthPct 限制在 1..100，非法值回退 20', () => {
    expect(decorPositionStyle('center', 0).width).toBe('1%');
    expect(decorPositionStyle('center', 500).width).toBe('100%');
    expect(decorPositionStyle('center', Number.NaN).width).toBe('20%');
  });

  it('未知位置回退右上角', () => {
    const css = decorPositionStyle('nowhere' as never, 20);
    expect(css).toMatchObject({ top: 0, right: 0 });
  });
});

describe('textBlockStyle', () => {
  it('颜色 / 字号 / 对齐 / 字体全部走 inline 值', () => {
    expect(textBlockStyle({ fontFamily: "'Foo', serif", fontSize: 48, color: '#123456', align: 'right' })).toEqual({
      color: '#123456', fontSize: '48px', textAlign: 'right', fontFamily: "'Foo', serif",
    });
  });

  it("fontFamily 为 '' 表示跟随全局：不设置 inline fontFamily", () => {
    const css = textBlockStyle({ fontFamily: '', fontSize: 28, color: '#fff', align: 'center' });
    expect('fontFamily' in css).toBe(false);
  });
});

describe('verticalJustify', () => {
  it('映射到 flex justify-content', () => {
    expect(verticalJustify('top')).toBe('flex-start');
    expect(verticalJustify('center')).toBe('center');
    expect(verticalJustify('bottom')).toBe('flex-end');
    expect(verticalJustify('weird' as never)).toBe('center');
  });
});
