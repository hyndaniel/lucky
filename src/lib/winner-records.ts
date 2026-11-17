import type { Winner } from '@/lib/types';

// 记录展示顺序：轮次倒序，同轮保持模块顺序。
// winners 按时间追加，轮次的先后即 roundId 首次出现的先后（旧记录无 roundNo 也适用）。
export function sortWinnersForDisplay(winners: readonly Winner[]): Winner[] {
  const groups = new Map<string, Winner[]>();
  for (const winner of winners) {
    const group = groups.get(winner.roundId);
    if (group) group.push(winner);
    else groups.set(winner.roundId, [winner]);
  }
  return [...groups.values()].reverse().flat();
}
