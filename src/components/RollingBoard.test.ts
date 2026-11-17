import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageLayout } from '@/lib/types';
import { DEFAULT_LOTTERY_LAYOUT, DEFAULT_PRIZE_LAYOUT, DEFAULT_WELCOME_LAYOUT } from '@/lib/defaults';

// 没有 jsdom：用 react-dom/server 渲染静态标记，断言 inline 样式落在正确的元素上。
const fonts = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@/hooks/useCustomFonts', () => ({ useCustomFonts: (f: unknown) => { fonts.calls.push(f); } }));

// zustand 的服务端渲染读取 getInitialState()，setState 不会生效：这里把 hook 换成读取可变种子状态的替身。
const seed = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/store/useStore', async (importActual) => {
  const actual = await importActual<typeof import('@/store/useStore')>();
  seed.state = { ...actual.useLotteryStore.getInitialState() };
  const useLotteryStore = Object.assign(
    (selector?: (s: unknown) => unknown) => (selector ? selector(seed.state) : seed.state),
    { getState: () => seed.state },
  );
  return { ...actual, useLotteryStore };
});

import RollingBoard from '@/components/RollingBoard';

const layout = (base: PageLayout, patch: Partial<PageLayout> = {}): PageLayout => ({
  ...base,
  ...patch,
  title: { ...base.title, color: '#112233', fontSize: 99, fontFamily: "'Custom A', serif", align: 'left', ...patch.title },
  subtitle: { ...base.subtitle, color: '#445566', fontSize: 33, ...patch.subtitle },
});

function render(viewMode: 'welcome' | 'prize' | 'lottery', patch: Record<string, unknown>): string {
  const settings = seed.state.settings as Record<string, unknown>;
  seed.state = { ...seed.state, viewMode, settings: { ...settings, ...patch } };
  return renderToStaticMarkup(createElement(RollingBoard));
}

beforeEach(() => {
  fonts.calls = [];
});

describe('RollingBoard 页面排版接线', () => {
  it('调用 useCustomFonts(settings.fonts)', () => {
    const uploaded = [{ key: 'font-1', family: 'Custom A', name: 'a.ttf' }];
    render('welcome', { fonts: uploaded });
    expect(fonts.calls.at(-1)).toEqual(uploaded);
  });

  it('欢迎页：标题 / 副标题 inline 样式、纵向 justify-content', () => {
    const html = render('welcome', {
      welcomeTitle: '年会',
      welcomeSubtitle: 'SUB',
      welcomeLayout: layout(DEFAULT_WELCOME_LAYOUT, { verticalAlign: 'bottom' }),
    });
    expect(html).toMatch(/<h1[^>]*style="[^"]*color:#112233[^"]*font-size:99px[^"]*text-align:left[^"]*font-family:[^"]*Custom A[^"]*"[^>]*>年会<\/h1>/);
    expect(html).toMatch(/<h2[^>]*style="[^"]*color:#445566[^"]*font-size:33px[^"]*"[^>]*>SUB<\/h2>/);
    expect(html).toContain('justify-content:flex-end');
  });

  it("字体为 '' 时欢迎页标题不设置 inline font-family", () => {
    const base = layout(DEFAULT_WELCOME_LAYOUT, { title: { fontFamily: '' } as never });
    const html = render('welcome', { welcomeTitle: '年会', welcomeLayout: base });
    const h1 = html.match(/<h1[^>]*>/)![0];
    expect(h1).not.toContain('font-family');
  });

  it('奖项页：标题 inline 样式、纵向 justify-content', () => {
    const html = render('prize', {
      prizePageTitle: '今日奖项',
      prizeLayout: layout(DEFAULT_PRIZE_LAYOUT, { verticalAlign: 'center' }),
    });
    expect(html).toMatch(/<h2[^>]*style="[^"]*color:#112233[^"]*font-size:99px[^"]*"[^>]*>今日奖项<\/h2>/);
    expect(html).toContain('justify-content:center');
  });

  it('抽奖页：页头标题 / 副标题 inline 样式；verticalAlign=bottom 时页头 order:2，否则 order:0', () => {
    const bottom = render('lottery', { lotteryLayout: layout(DEFAULT_LOTTERY_LAYOUT, { verticalAlign: 'bottom' }) });
    expect(bottom).toMatch(/<h1[^>]*style="[^"]*color:#112233[^"]*font-size:99px[^"]*"/);
    expect(bottom).toMatch(/<header[^>]*style="[^"]*order:2/);
    const top = render('lottery', { lotteryLayout: layout(DEFAULT_LOTTERY_LAYOUT, { verticalAlign: 'top' }) });
    expect(top).toMatch(/<header[^>]*style="[^"]*order:0/);
  });
});
