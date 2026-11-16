// 后台编号：IMG-0001 / N-0001，至少 4 位，超出时自然变长
export function formatSerial(prefix: 'IMG' | 'N', n: number): string {
  return `${prefix}-${String(n).padStart(4, '0')}`;
}
