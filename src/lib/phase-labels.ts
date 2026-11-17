import type { DrawMode, RoundPhase } from '@/lib/types';

// 后台头部 Badge 的阶段文案
export const PHASE_LABELS: Record<RoundPhase, string> = {
  idle: '等待开始',
  rollingPrizes: '奖品抽取中',
  prizesRevealed: '奖品已定格',
  rollingNames: '名字抽取中',
  completed: '本轮完成',
};

// 主按钮文案随阶段变化
export const ADVANCE_LABELS: Record<RoundPhase, string> = {
  idle: '开始抽奖品',
  rollingPrizes: '停止 · 定格奖品',
  prizesRevealed: '开始抽名字',
  rollingNames: '停止 · 定格名字',
  completed: '下一轮',
};

// 主按钮文案：name-only 没有奖品阶段，idle 即「开始抽名字」；image-only 停止即完成
export function advanceLabel(phase: RoundPhase, drawMode: DrawMode): string {
  if (drawMode === 'name-only' && phase === 'idle') return '开始抽名字';
  if (drawMode === 'image-only' && phase === 'rollingPrizes') return '停止 · 定格奖品并完成';
  return ADVANCE_LABELS[phase];
}
