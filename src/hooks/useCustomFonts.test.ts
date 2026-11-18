import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadedFont } from '@/lib/types';

// 仓库没有 jsdom / testing-library，且 vitest 跑在 node 环境：
// 这里用一个只实现 useRef / useEffect 的最小 react 替身来驱动 hook。
const harness = vi.hoisted(() => {
  type Slot = { deps?: unknown[]; cleanup?: void | (() => void) };
  const state = {
    refs: [] as { current: unknown }[],
    effects: [] as Slot[],
    refIdx: 0,
    effIdx: 0,
    pending: [] as (() => void)[],
  };
  return { state };
});

vi.mock('react', () => ({
  useRef: (initial: unknown) => {
    const s = harness.state;
    if (!s.refs[s.refIdx]) s.refs[s.refIdx] = { current: initial };
    return s.refs[s.refIdx++];
  },
  useEffect: (fn: () => void | (() => void), deps: unknown[]) => {
    const s = harness.state;
    const i = s.effIdx++;
    const slot = s.effects[i] ?? (s.effects[i] = {});
    const changed = !slot.deps || deps.some((d, k) => !Object.is(d, slot.deps![k]));
    if (!changed) return;
    s.pending.push(() => {
      if (typeof slot.cleanup === 'function') slot.cleanup();
      slot.deps = deps;
      slot.cleanup = fn();
    });
  },
}));

const getMedia = vi.fn<(key: string) => Promise<Blob | undefined>>();
vi.mock('@/lib/media-store', () => ({
  getMedia: (key: string) => getMedia(key),
}));

import { useCustomFonts } from '@/hooks/useCustomFonts';

const callHook: (list: UploadedFont[]) => void = useCustomFonts;

function render(fonts: UploadedFont[]) {
  const run = (list: UploadedFont[]) => {
    const s = harness.state;
    s.refIdx = 0;
    s.effIdx = 0;
    // 经别名调用：这里是最小 react 替身，不是真实组件渲染，避免 rules-of-hooks 误报
    callHook(list);
    const todo = s.pending.splice(0);
    todo.forEach((fn) => fn());
  };
  run(fonts);
  return {
    rerender: run,
    unmount: () => {
      harness.state.effects.forEach((slot) => {
        if (typeof slot.cleanup === 'function') slot.cleanup();
        slot.cleanup = undefined;
      });
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class FakeFontFace {
  static instances: FakeFontFace[] = [];
  static loadImpl: ((face: FakeFontFace) => Promise<unknown>) | null = null;
  load = vi.fn(async () => (FakeFontFace.loadImpl ? FakeFontFace.loadImpl(this) : this));
  family: string;
  source: string;
  constructor(family: string, source: string) {
    // 模拟浏览器：未加引号且含数字开头标识符的 family 解析失败
    if (!/^['"]/.test(family) && /(^|\s)\d/.test(family)) throw new SyntaxError('bad family');
    this.family = family;
    this.source = source;
    FakeFontFace.instances.push(this);
  }
}

const font = (id: string, family = `Family ${id}`): UploadedFont => ({
  key: `font-${id}`,
  family,
  name: `${id}.ttf`,
});

describe('useCustomFonts', () => {
  let fonts: { add: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let urlCounter = 0;
  const revoked: string[] = [];
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    harness.state.refs = [];
    harness.state.effects = [];
    harness.state.pending = [];
    FakeFontFace.instances = [];
    FakeFontFace.loadImpl = null;
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    revoked.length = 0;
    urlCounter = 0;
    getMedia.mockReset();
    getMedia.mockResolvedValue(new Blob(['x']));
    fonts = { add: vi.fn(), delete: vi.fn() };
    vi.stubGlobal('document', { fonts });
    vi.stubGlobal('FontFace', FakeFontFace);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:font-${++urlCounter}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      revoked.push(url);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('按 key 取 blob，并把带 family 的 FontFace 加到 document.fonts', async () => {
    render([font('a', 'My Font')]);
    await flush();
    expect(getMedia).toHaveBeenCalledWith('font-a');
    expect(FakeFontFace.instances).toHaveLength(1);
    const face = FakeFontFace.instances[0];
    expect(face.family).toBe("'My Font'");
    expect(face.source).toBe('url(blob:font-1)');
    expect(face.load).toHaveBeenCalled();
    expect(fonts.add).toHaveBeenCalledWith(face);
  });

  it('从列表移除后删除 FontFace 并 revoke 自己创建的 URL', async () => {
    const view = render([font('a')]);
    await flush();
    view.rerender([]);
    expect(fonts.delete).toHaveBeenCalledWith(FakeFontFace.instances[0]);
    expect(revoked).toEqual(['blob:font-1']);
  });

  it('卸载时清理所有字体', async () => {
    const view = render([font('a'), font('b')]);
    await flush();
    view.unmount();
    expect(fonts.delete).toHaveBeenCalledTimes(2);
    expect(revoked.sort()).toEqual(['blob:font-1', 'blob:font-2']);
  });

  it('blob 取回前就被移除：不会创建 URL，也不会添加 FontFace', async () => {
    let release!: (b: Blob) => void;
    getMedia.mockImplementationOnce(() => new Promise<Blob>((resolve) => (release = resolve)));
    const view = render([font('a')]);
    view.rerender([]);
    release(new Blob(['x']));
    await flush();
    expect(fonts.add).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('document.fonts 不存在时静默 no-op', async () => {
    vi.stubGlobal('document', {});
    expect(() => render([font('a')])).not.toThrow();
    await flush();
    expect(getMedia).not.toHaveBeenCalled();
  });

  it('没有 document 时静默 no-op', async () => {
    vi.stubGlobal('document', undefined);
    expect(() => render([font('a')])).not.toThrow();
    await flush();
    expect(getMedia).not.toHaveBeenCalled();
  });

  it('媒体库不可用（getMedia 返回 undefined 或 reject）时不抛错、不添加', async () => {
    getMedia.mockResolvedValueOnce(undefined);
    getMedia.mockRejectedValueOnce(new Error('no idb'));
    render([font('a'), font('b')]);
    await flush();
    expect(fonts.add).not.toHaveBeenCalled();
  });

  it('内容相同的新数组不会重复添加（按 family 去重）', async () => {
    const view = render([font('a')]);
    await flush();
    view.rerender([font('a')]);
    await flush();
    expect(getMedia).toHaveBeenCalledTimes(1);
    expect(fonts.add).toHaveBeenCalledTimes(1);
    expect(fonts.delete).not.toHaveBeenCalled();
  });

  it('同一 family 出现在多个条目时只注册一次', async () => {
    render([font('a', 'Dup'), font('b', 'Dup')]);
    await flush();
    expect(fonts.add).toHaveBeenCalledTimes(1);
  });

  it('新增字体只加载新增的那一个', async () => {
    const view = render([font('a')]);
    await flush();
    view.rerender([font('a'), font('b')]);
    await flush();
    expect(getMedia).toHaveBeenCalledTimes(2);
    expect(fonts.add).toHaveBeenCalledTimes(2);
  });

  it('数字开头的 family 加引号后可构造，不抛错也不告警', async () => {
    render([font('a', 'Font 2')]);
    await flush();
    expect(fonts.add).toHaveBeenCalledTimes(1);
    expect(FakeFontFace.instances[0].family).toBe("'Font 2'");
    expect(warn).not.toHaveBeenCalled();
  });

  it('family 含引号/反斜杠时转义', async () => {
    render([font('a', "It's \\ x")]);
    await flush();
    expect(FakeFontFace.instances[0].family).toBe("'It\\'s \\\\ x'");
  });

  it('FontFace 构造抛错时不抛出、只告警一次并指明 family', async () => {
    vi.stubGlobal(
      'FontFace',
      class {
        constructor() {
          throw new SyntaxError('boom');
        }
      },
    );
    expect(() => render([font('a', 'Bad Family')])).not.toThrow();
    await flush();
    expect(fonts.add).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('自定义字体加载失败: Bad Family');
    expect(revoked).toEqual(['blob:font-1']);
  });

  it('getMedia reject 一次后，内容相同的新数组不会重试（依赖是原始值）', async () => {
    getMedia.mockRejectedValueOnce(new Error('no idb'));
    const view = render([font('a')]);
    await flush();
    view.rerender([font('a')]);
    await flush();
    expect(getMedia).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('自定义字体加载失败: Family a');
  });

  it('face.load() 期间被移除：不添加 FontFace，并 revoke URL，且不告警', async () => {
    let finish!: () => void;
    FakeFontFace.loadImpl = () => new Promise<void>((resolve) => (finish = resolve));
    const view = render([font('a')]);
    await flush();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    view.rerender([]);
    expect(revoked).toEqual(['blob:font-1']);
    finish();
    await flush();
    expect(fonts.add).not.toHaveBeenCalled();
    expect(fonts.delete).not.toHaveBeenCalled();
    expect(revoked).toEqual(['blob:font-1']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('face.load() reject：revoke URL、清除登记，列表变化后可重试', async () => {
    FakeFontFace.loadImpl = () => Promise.reject(new Error('corrupt'));
    const view = render([font('a')]);
    await flush();
    expect(fonts.add).not.toHaveBeenCalled();
    expect(revoked).toEqual(['blob:font-1']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('自定义字体加载失败: Family a');

    FakeFontFace.loadImpl = null;
    view.rerender([font('a'), font('b')]);
    await flush();
    expect(getMedia).toHaveBeenCalledTimes(3);
    expect(fonts.add).toHaveBeenCalledTimes(2);
  });
});
