import { expect, it } from 'vitest';
import { soundEngine } from '@/lib/sound';

// sound.ts 依赖浏览器音频 API，这里只保证 node 中 import 不报错（模块顶层不访问 window / AudioContext）
it('node 中可以导入，初始未解锁', () => {
  expect(soundEngine.isUnlocked()).toBe(false);
});
