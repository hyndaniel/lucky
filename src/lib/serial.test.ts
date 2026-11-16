import { describe, expect, it } from 'vitest';
import { formatSerial } from '@/lib/serial';

describe('formatSerial', () => {
  it('图片编号 4 位补零', () => {
    expect(formatSerial('IMG', 1)).toBe('IMG-0001');
  });

  it('名字编号 4 位补零', () => {
    expect(formatSerial('N', 42)).toBe('N-0042');
  });

  it('超过 4 位时自然变长', () => {
    expect(formatSerial('N', 12345)).toBe('N-12345');
  });
});
