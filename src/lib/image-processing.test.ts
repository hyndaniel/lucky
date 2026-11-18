import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_SIDE,
  MAX_IMAGE_FILE_BYTES,
  OUTPUT_QUALITY,
  fitWithin,
  labelFromFileName,
  prepareImageBlob,
} from '@/lib/image-processing';

describe('fitWithin', () => {
  it('横图按长边缩到 maxSide，等比', () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
  });

  it('竖图按长边缩到 maxSide，等比', () => {
    expect(fitWithin(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });

  it('已在范围内原样返回', () => {
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1024, 1024, 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('结果取整', () => {
    // 2000 × 1024 / 3000 = 682.67
    expect(fitWithin(3000, 2000, 1024)).toEqual({ width: 1024, height: 683 });
  });

  it('极端比例时短边至少为 1', () => {
    expect(fitWithin(10000, 1, 1024)).toEqual({ width: 1024, height: 1 });
    expect(fitWithin(1, 50000, 1024)).toEqual({ width: 1, height: 1024 });
  });
});

describe('labelFromFileName', () => {
  it('去掉扩展名', () => {
    expect(labelFromFileName('一等奖-iPhone.png')).toBe('一等奖-iPhone');
  });

  it('多个点时只去掉最后一段', () => {
    expect(labelFromFileName('a.b.c.jpg')).toBe('a.b.c');
  });

  it('无扩展名原样返回', () => {
    expect(labelFromFileName('特等奖')).toBe('特等奖');
  });

  it('去掉两侧空格', () => {
    expect(labelFromFileName('  二等奖.jpeg  ')).toBe('二等奖');
    expect(labelFromFileName(' 三等奖 .png')).toBe('三等奖');
  });
});

describe('prepareImageBlob', () => {
  it('SVG 原样返回', async () => {
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', {
      type: 'image/svg+xml',
    });
    expect(await prepareImageBlob(file)).toBe(file);
  });

  it('GIF 原样返回（保留动图）', async () => {
    const file = new File(['GIF89a'], 'anim.gif', { type: 'image/gif' });
    expect(await prepareImageBlob(file)).toBe(file);
  });

  it('无法解码时（node 无 createImageBitmap）返回原文件，不抛错', async () => {
    const file = new File(['not really a png'], 'photo.png', { type: 'image/png' });
    expect(await prepareImageBlob(file)).toBe(file);
  });
});

describe('prepareImageBlob 解码方向', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('按 EXIF 方向解码（imageOrientation: from-image），并关闭 ImageBitmap', async () => {
    const close = vi.fn();
    const decode = vi.fn(async () => ({ width: 3000, height: 4000, close }));
    vi.stubGlobal('createImageBitmap', decode);
    const file = new File(['jpeg'], 'phone.jpg', { type: 'image/jpeg' });
    await prepareImageBlob(file);
    expect(decode).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('引擎不接受解码参数（同步抛错）时返回原文件', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => {
        throw new TypeError('unsupported imageOrientation');
      }),
    );
    const file = new File(['jpeg'], 'phone.jpg', { type: 'image/jpeg' });
    expect(await prepareImageBlob(file)).toBe(file);
  });
});

describe('MAX_IMAGE_FILE_BYTES', () => {
  it('为 20MB', () => {
    expect(MAX_IMAGE_FILE_BYTES).toBe(20 * 1024 * 1024);
  });
});

describe('图片保真参数', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('默认长边 1920、webp 质量 0.92', () => {
    expect(DEFAULT_MAX_SIDE).toBe(1920);
    expect(OUTPUT_QUALITY).toBe(0.92);
  });

  it('默认长边下 4000×3000 缩到 1920×1440', () => {
    expect(fitWithin(4000, 3000, DEFAULT_MAX_SIDE)).toEqual({ width: 1920, height: 1440 });
  });

  it('prepareImageBlob 默认按 1920 解码后缩放（不传 maxSide）', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close })));
    const toBlob = vi.fn();
    vi.stubGlobal('OffscreenCanvas', class {
      constructor(width: number, height: number) { sizes.push([width, height]); }
      getContext() { return { drawImage() {} }; }
      async convertToBlob(opts: { quality: number }) { toBlob(opts.quality); return new Blob(['x']); }
    });
    const sizes: number[][] = [];
    const file = new File([new Uint8Array(100)], 'big.jpg', { type: 'image/jpeg' });
    await prepareImageBlob(file);
    expect(sizes).toEqual([[1920, 1440]]);
    expect(toBlob).toHaveBeenCalledWith(0.92);
  });
});
