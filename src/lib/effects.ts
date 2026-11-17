// 中奖特效：撒花 / 星光 / 火箭 / emoji，全部基于 canvas-confetti，持续 durationSec 秒。
// 模块顶层不访问 window / document / matchMedia，node 下可安全 import（splitEmojis 有单测）。
import confetti from 'canvas-confetti';
import type { EffectSettings } from '@/lib/types';

const MAX_EMOJIS = 8;
const FALLBACK_EMOJI = '🎉';
const CANNON_COLORS = ['#FFD700', '#FF4500', '#FFFFFF'];
const STAR_COLORS = ['#FFE400', '#FFBD00', '#E89400', '#FFCA6C', '#FDFFB8'];
const STAR_INTERVAL_MS = 300;
const EMOJI_INTERVAL_MS = 150;
const EMOJI_SCALAR = 3;
const ROCKET_INTERVAL_MS = 400;
const ROCKET_FLIGHT_MS = 900;
const ROCKET_FONT_PX = 44;
const ROCKET_Z_INDEX = '2147483000';

// 一次播放持有的定时器与火箭 DOM，停止时统一清理
interface Playback {
  end: number;
  frameId: number | null;
  intervals: ReturnType<typeof setInterval>[];
  timeouts: Set<ReturnType<typeof setTimeout>>;
  rockets: Set<HTMLElement>;
}

// 按字素拆分：去掉空白，最多 8 个。为空时的 🎉 回退在 playCelebration 里做
export function splitEmojis(text: string): string[] {
  const result: string[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const { segment } of segmenter.segment(text)) {
    if (segment.trim() === '') continue;
    result.push(segment);
    if (result.length === MAX_EMOJIS) break;
  }
  return result;
}

// 所有发射都尊重系统的「减少动态效果」设置
function fire(options: confetti.Options): void {
  void confetti({ ...options, disableForReducedMotion: true });
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 立即执行一次，之后每 intervalMs 执行一次，到时自动停
function repeatUntilEnd(playback: Playback, intervalMs: number, run: () => void): void {
  run();
  const id = setInterval(() => {
    if (Date.now() >= playback.end) clearInterval(id);
    else run();
  }, intervalMs);
  playback.intervals.push(id);
}

// 左右两侧礼炮，逐帧发射（同原 RollingBoard 实现）
function startCannons(playback: Playback): void {
  const frame = () => {
    fire({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors: CANNON_COLORS });
    fire({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors: CANNON_COLORS });
    playback.frameId = Date.now() < playback.end ? requestAnimationFrame(frame) : null;
  };
  frame();
}

// 金色星星，从屏幕上半部随机点爆开
function startStars(playback: Playback): void {
  repeatUntilEnd(playback, STAR_INTERVAL_MS, () =>
    fire({
      particleCount: 30,
      spread: 360,
      startVelocity: 25,
      decay: 0.94,
      gravity: 0.3,
      ticks: 80,
      scalar: 1.2,
      shapes: ['star'],
      colors: STAR_COLORS,
      origin: { x: randomBetween(0.1, 0.9), y: randomBetween(0.05, 0.5) },
    }),
  );
}

// emoji 从顶部飘落
function startEmojiRain(playback: Playback, text: string): void {
  const emojis = splitEmojis(text);
  let shapes: confetti.Shape[];
  try {
    shapes = (emojis.length > 0 ? emojis : [FALLBACK_EMOJI]).map((emoji) =>
      confetti.shapeFromText({ text: emoji, scalar: EMOJI_SCALAR }),
    );
  } catch {
    // 不支持 OffscreenCanvas 的浏览器生成不了 emoji 形状，跳过这一种
    return;
  }
  repeatUntilEnd(playback, EMOJI_INTERVAL_MS, () =>
    fire({
      particleCount: 2,
      angle: 270,
      spread: 40,
      startVelocity: 8,
      decay: 0.95,
      gravity: 1.2,
      ticks: 320,
      drift: randomBetween(-0.6, 0.6),
      flat: true,
      scalar: EMOJI_SCALAR,
      shapes,
      origin: { x: Math.random(), y: -0.05 },
    }),
  );
}

// 底部随机位置升起一枚 🚀，飞到 15%–45% 高度后移除，并在该点 360° 爆开
function launchRocket(playback: Playback): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const x = width * randomBetween(0.1, 0.9);
  const targetY = height * randomBetween(0.15, 0.45);

  const el = document.createElement('div');
  el.textContent = '🚀';
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    left: `${x}px`,
    top: `${height}px`,
    zIndex: ROCKET_Z_INDEX,
    pointerEvents: 'none',
    fontSize: `${ROCKET_FONT_PX}px`,
    lineHeight: '1',
    // 🚀 字形朝右上 45°，转 -45° 后竖直向上
    transform: 'translate(-50%, -50%) rotate(-45deg)',
    transition: `transform ${ROCKET_FLIGHT_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1)`,
    willChange: 'transform',
  });
  document.body.appendChild(el);
  playback.rockets.add(el);
  // 先让起始位置生效，再改 transform 才会触发过渡
  void el.getBoundingClientRect();
  el.style.transform = `translate(-50%, calc(-50% - ${height - targetY}px)) rotate(-45deg)`;

  const id = setTimeout(() => {
    playback.timeouts.delete(id);
    playback.rockets.delete(el);
    el.remove();
    fire({
      particleCount: 80,
      spread: 360,
      startVelocity: 30,
      gravity: 0.8,
      ticks: 120,
      colors: CANNON_COLORS,
      origin: { x: x / width, y: targetY / height },
    });
  }, ROCKET_FLIGHT_MS);
  playback.timeouts.add(id);
}

// 播放中奖特效（多种同时进行），返回停止函数。是否在奖品定格时播放（onPrizeReveal）由调用方决定
export function playCelebration(effects: EffectSettings): () => void {
  const kinds = new Set(effects.kinds);
  if (kinds.size === 0) return () => {};

  const playback: Playback = {
    end: Date.now() + effects.durationSec * 1000,
    frameId: null,
    intervals: [],
    timeouts: new Set(),
    rockets: new Set(),
  };
  if (kinds.has('confetti')) startCannons(playback);
  if (kinds.has('stars')) startStars(playback);
  if (kinds.has('emoji')) startEmojiRain(playback, effects.emojis);
  if (kinds.has('rockets') && !prefersReducedMotion()) {
    repeatUntilEnd(playback, ROCKET_INTERVAL_MS, () => launchRocket(playback));
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (playback.frameId !== null) cancelAnimationFrame(playback.frameId);
    for (const id of playback.intervals) clearInterval(id);
    for (const id of playback.timeouts) clearTimeout(id);
    for (const el of playback.rockets) el.remove();
    playback.timeouts.clear();
    playback.rockets.clear();
    confetti.reset();
  };
}
