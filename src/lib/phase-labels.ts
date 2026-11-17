import type { RoundPhase } from '@/lib/types';

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
