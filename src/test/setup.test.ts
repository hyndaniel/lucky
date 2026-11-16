import { describe, expect, it } from 'vitest';

describe('测试环境 Web Storage', () => {
  it.each(['localStorage', 'sessionStorage'] as const)('%s 可读写、可清空', (name) => {
    const storage = globalThis[name];
    storage.clear();
    storage.setItem('a', '1');
    storage.setItem('b', '2');
    expect(storage.getItem('a')).toBe('1');
    expect(storage.getItem('missing')).toBeNull();
    expect(storage.length).toBe(2);
    expect(['a', 'b']).toContain(storage.key(0));
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();
    storage.clear();
    expect(storage.length).toBe(0);
  });
});
