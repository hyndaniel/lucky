import { describe, expect, it } from 'vitest';
import { splitEmojis } from '@/lib/effects';

describe('splitEmojis', () => {
  it('按字素拆成单个 emoji', () => {
    expect(splitEmojis('🎉🧧✨')).toEqual(['🎉', '🧧', '✨']);
  });

  it('去掉空格、制表符与换行', () => {
    expect(splitEmojis(' 🎉 🧧\n✨\t\r\n')).toEqual(['🎉', '🧧', '✨']);
  });

  it('ZWJ 组合 emoji 算 1 个', () => {
    expect(splitEmojis('👨‍👩‍👧')).toEqual(['👨‍👩‍👧']);
  });

  it('超过 8 个截断为前 8 个', () => {
    expect(splitEmojis('1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟')).toEqual([
      '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣',
    ]);
  });

  it('空串返回空数组', () => {
    expect(splitEmojis('')).toEqual([]);
  });

  it('全是空白返回空数组（不在这里回退 🎉）', () => {
    expect(splitEmojis(' \n\t ')).toEqual([]);
  });
});
