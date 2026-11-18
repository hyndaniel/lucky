// 现场控制主按钮 / 空格推进的防误触规则（纯函数，便于测试）

// 连续两次成功推进的最小间隔：快速连点不应跳过中间的中奖展示
export const ADVANCE_COOLDOWN_MS = 800;

const TEXT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];
// 这些控件自己使用空格（勾选、切换、选中、展开），聚焦时空格不能推进抽奖
const INTERACTIVE_ROLE_SELECTOR =
  '[role="checkbox"],[role="switch"],[role="tab"],[role="combobox"],[role="menuitem"],[role="radio"]';

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

// 焦点在输入控件、编辑区或带有自身空格语义的控件内时，空格留给控件本身
export function isSpaceOwnedByControl(target: EventTarget | null): boolean {
  const el = target as TargetLike | null;
  if (!el?.tagName) return false;
  if (TEXT_TAGS.includes(el.tagName) || el.isContentEditable) return true;
  return typeof el.closest === 'function' && el.closest(INTERACTIVE_ROLE_SELECTOR) != null;
}

// 距上一次成功推进不足冷却时间时忽略本次推进
export function isAdvanceTooSoon(lastAdvanceAt: number, now: number, cooldownMs: number = ADVANCE_COOLDOWN_MS): boolean {
  return now - lastAdvanceAt < cooldownMs;
}
