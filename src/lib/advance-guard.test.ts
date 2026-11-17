import { describe, expect, it } from 'vitest';
import { ADVANCE_COOLDOWN_MS, isAdvanceTooSoon, isSpaceOwnedByControl } from '@/lib/advance-guard';

const el = (tagName: string, matchesRole = false, isContentEditable = false) =>
  ({ tagName, isContentEditable, closest: () => (matchesRole ? {} : null) }) as unknown as EventTarget;

describe('isSpaceOwnedByControl', () => {
  it('输入类控件和可编辑区拥有空格', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(isSpaceOwnedByControl(el(tag))).toBe(true);
    expect(isSpaceOwnedByControl(el('DIV', false, true))).toBe(true);
  });
  it('复选框/开关/标签页等 role 控件（含其内部元素）拥有空格', () => {
    expect(isSpaceOwnedByControl(el('BUTTON', true))).toBe(true);
    expect(isSpaceOwnedByControl(el('SPAN', true))).toBe(true);
  });
  it('普通按钮、body、无目标不拥有空格', () => {
    expect(isSpaceOwnedByControl(el('BUTTON'))).toBe(false);
    expect(isSpaceOwnedByControl(el('BODY'))).toBe(false);
    expect(isSpaceOwnedByControl(null)).toBe(false);
  });
});

describe('isAdvanceTooSoon', () => {
  it('冷却内忽略，冷却后放行', () => {
    expect(isAdvanceTooSoon(1000, 1000 + ADVANCE_COOLDOWN_MS - 1)).toBe(true);
    expect(isAdvanceTooSoon(1000, 1000 + ADVANCE_COOLDOWN_MS)).toBe(false);
  });
  it('从未推进过（0）时首次推进不被拦截', () => {
    expect(isAdvanceTooSoon(0, Date.now())).toBe(false);
  });
});
