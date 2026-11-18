// 基于 canvas measureText 的文字宽度测量器。canvas 2d 上下文只创建一次并复用。
// jsdom / 无 canvas 环境下 getContext 返回 null 或抛错，此时 createTextMeasurer 返回 null，
// 调用方应退回布局算出的字号（不做统一缩小）。
let ctx: CanvasRenderingContext2D | null | undefined;

function getContext(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  try {
    ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (ctx && typeof ctx.measureText !== 'function') ctx = null;
  } catch {
    ctx = null;
  }
  return ctx;
}

export type TextMeasurer = (text: string, size: number) => number;

export function createTextMeasurer(fontFamily: string | undefined, fontWeight: number): TextMeasurer | null {
  const c = getContext();
  if (!c) return null;
  const family = fontFamily || 'sans-serif';
  return (text, size) => {
    c.font = `${fontWeight} ${size}px ${family}`;
    return c.measureText(text).width;
  };
}
