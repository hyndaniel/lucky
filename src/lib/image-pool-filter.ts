// 图片池标签页的纯逻辑：状态推导、统计、筛选
import type { PrizeImage, Winner } from '@/lib/types';
import { formatSerial } from '@/lib/serial';
import { getAvailableImages } from '@/lib/draw-engine';

export const UNGROUPED = '__ungrouped__';

export type ImageStatus = 'available' | 'used' | 'frozen';

export type ImageStatusInfo =
  | { status: 'available' }
  | { status: 'frozen' }
  | { status: 'used'; winner: Winner };

export interface ImageFilter {
  group: string;                       // 'all' | UNGROUPED | 分组名
  status: ImageStatus | 'all';
  keyword: string;
}

// 推导每张图片的状态：已被记录引用 > 本轮已定格 > 可用（可用判定复用 draw-engine）
export function deriveImageStatuses(
  images: PrizeImage[],
  winners: Winner[],
  frozenIds: string[],
): Map<string, ImageStatusInfo> {
  const available = new Set(getAvailableImages(images, winners).map((img) => img.id));
  const winnerByImage = new Map<string, Winner>();
  for (const w of winners) {
    if (w.imageId && !winnerByImage.has(w.imageId)) winnerByImage.set(w.imageId, w);
  }
  const frozen = new Set(frozenIds);
  const result = new Map<string, ImageStatusInfo>();
  for (const img of images) {
    const winner = winnerByImage.get(img.id);
    if (!available.has(img.id) && winner) result.set(img.id, { status: 'used', winner });
    else if (frozen.has(img.id)) result.set(img.id, { status: 'frozen' });
    else result.set(img.id, { status: 'available' });
  }
  return result;
}

export function countByStatus(images: PrizeImage[], statuses: Map<string, ImageStatusInfo>) {
  const counts = { total: images.length, available: 0, used: 0, frozen: 0 };
  for (const img of images) {
    const status = statuses.get(img.id)?.status ?? 'available';
    counts[status] += 1;
  }
  return counts;
}

// 已有分组名：去重去空，保持首次出现顺序
export function collectGroups(images: PrizeImage[]): string[] {
  return [...new Set(images.map((img) => img.group).filter(Boolean))];
}

export function filterImages(
  images: PrizeImage[],
  statuses: Map<string, ImageStatusInfo>,
  { group, status, keyword }: ImageFilter,
): PrizeImage[] {
  const kw = keyword.trim().toLowerCase();
  return images.filter((img) => {
    if (group === UNGROUPED ? img.group !== '' : group !== 'all' && img.group !== group) return false;
    if (status !== 'all' && (statuses.get(img.id)?.status ?? 'available') !== status) return false;
    if (kw && !img.label.toLowerCase().includes(kw) && !formatSerial('IMG', img.serial).toLowerCase().includes(kw)) return false;
    return true;
  });
}
