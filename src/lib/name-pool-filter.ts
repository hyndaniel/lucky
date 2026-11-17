// 名字池选择器的筛选：按部门、按姓名/编号搜索
import type { Participant } from '@/lib/types';
import { formatSerial } from '@/lib/serial';

export const NO_DEPT = '__no_dept__';

export function collectDepts(participants: Participant[]): string[] {
  return [...new Set(participants.map((p) => p.dept).filter(Boolean))];
}

// dept：'all' | NO_DEPT | 部门名
export function filterParticipants(participants: Participant[], dept: string, keyword: string): Participant[] {
  const kw = keyword.trim().toLowerCase();
  return participants.filter((p) => {
    if (dept === NO_DEPT ? p.dept !== '' : dept !== 'all' && p.dept !== dept) return false;
    if (kw && !p.name.toLowerCase().includes(kw) && !formatSerial('N', p.serial).toLowerCase().includes(kw)) return false;
    return true;
  });
}
