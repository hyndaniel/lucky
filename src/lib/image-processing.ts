// 奖品图片处理：尺寸计算、文件名转说明、上传前压缩（浏览器 API 只在函数内访问，node 下可安全 import）

export const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024;

const OUTPUT_TYPE = 'image/webp';
export const OUTPUT_QUALITY = 0.92;
// 长边上限：大屏全屏展示奖品，1024 放大后发糊
export const DEFAULT_MAX_SIDE = 1920;

// 等比缩放到长边不超过 maxSide；已在范围内则不变。结果取整且 ≥1
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// 图片说明默认值：去掉扩展名（最后一个点之后的部分）与两侧空白
export function labelFromFileName(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf('.');
  return (dot > 0 ? trimmed.slice(0, dot) : trimmed).trim();
}

// SVG 是矢量、GIF 可能是动图，重新编码会失真或丢帧
function isPassthrough(file: File): boolean {
  return file.type === 'image/svg+xml' || file.type === 'image/gif' || /\.(svg|gif)$/i.test(file.name);
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function drawScaled(ctx: Context2D, bitmap: ImageBitmap, width: number, height: number): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
}

// 优先 OffscreenCanvas；不可用或拿不到 2d 上下文时退回 DOM canvas。失败返回 null
async function encodeScaled(bitmap: ImageBitmap, width: number, height: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      drawScaled(ctx, bitmap, width, height);
      return offscreen.convertToBlob({ type: OUTPUT_TYPE, quality: OUTPUT_QUALITY });
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawScaled(ctx, bitmap, width, height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, OUTPUT_TYPE, OUTPUT_QUALITY));
}

// 上传前压缩：缩到长边 ≤ maxSide 并转 webp。不支持 webp 的浏览器（Safari）会给出其它格式，
// 同样只在比原文件小时采用；结果不更小或任何一步失败时返回原文件
export async function prepareImageBlob(file: File, maxSide = DEFAULT_MAX_SIDE): Promise<Blob> {
  if (isPassthrough(file)) return file;
  let bitmap: ImageBitmap | null = null;
  try {
    // 显式按 EXIF 方向解码：手机竖拍照片常以横向像素 + Orientation 标记保存，
    // 依赖引擎默认值可能转出侧躺的图，fitWithin 也会用错宽高。
    // 不认识该参数的旧引擎会抛错，走下方 catch 返回原文件（<img> 默认会按 EXIF 方向显示）
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
    const blob = await encodeScaled(bitmap, width, height);
    return blob && blob.size > 0 && blob.size < file.size ? blob : file;
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
