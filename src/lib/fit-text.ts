// 一组文字共用同一个字号：返回让每段文字宽度都 ≤ maxWidth 的最大整数字号（≤ baseFontSize），
// 但不低于 minFontSize（放不下时宁可溢出，由调用方兜底）。空文字 / 纯空白被忽略。
// measure 由调用方注入（浏览器里用 canvas.measureText，测试里用简单公式）。
export function fitFontSize(
  texts: string[],
  maxWidth: number,
  baseFontSize: number,
  measure: (text: string, size: number) => number,
  minFontSize = 10,
): number {
  const base = Math.floor(baseFontSize);
  const items = texts.filter((t) => t.trim() !== '');
  if (items.length === 0) return base;
  const floor = Math.min(minFontSize, base); // 基准字号本身小于下限时不放大
  const fits = (size: number) => items.every((t) => measure(t, size) <= maxWidth);
  if (fits(base)) return base;
  if (!fits(floor)) return floor;
  // 二分：宽度随字号单调不减；lo 已知放得下，hi 已知放不下
  let lo = floor;
  let hi = base;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return lo;
}
