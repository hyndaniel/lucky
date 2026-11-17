// 现场控制面板的纯展示逻辑：池摘要文案与布局提示
import type { Participant, PrizeImage, Winner } from '@/lib/types';
import {
  getAvailableImages,
  getDefaultImagePoolIds,
  getEligibleParticipants,
  resolveImagePool,
  resolveNamePool,
} from '@/lib/draw-engine';
import { getGridColumns } from '@/lib/grid-layout';

// 图片池摘要。自动 = null，或选择集合恰好等于「与奖项同名分组」的默认池（与 store 的约定一致）
export function describeImagePool(
  images: PrizeImage[],
  winners: Winner[],
  imagePoolIds: string[] | null,
  prizeName: string,
): string {
  const available = getAvailableImages(images, winners);
  if (imagePoolIds === null) return `自动：全部可用 ${available.length} 张`;
  const defaults = getDefaultImagePoolIds(available, prizeName);
  const picked = new Set(imagePoolIds);
  if (defaults !== null && picked.size === defaults.length && defaults.every((id) => picked.has(id))) {
    return `自动：分组「${prizeName}」${defaults.length} 张`;
  }
  return `已选 ${resolveImagePool(images, winners, imagePoolIds).length} 张`;
}

// 名字池摘要：只统计仍合格者（含不受选择限制的内定者）
export function describeNamePool(
  participants: Participant[],
  winners: Winner[],
  prizeId: string | undefined,
  namePoolIds: string[] | null,
): string {
  if (!prizeId) return '请先选择奖项';
  if (namePoolIds === null) return `自动：全部合格 ${getEligibleParticipants(participants, winners, prizeId).length} 人`;
  return `已选 ${resolveNamePool(participants, winners, prizeId, namePoolIds).length} 人`;
}

// 布局提示 `列×排`；模块数非法时返回空串
export function formatLayoutHint(moduleCount: number, columnsOverride: number): string {
  if (!Number.isInteger(moduleCount) || moduleCount < 1) return '';
  const columns = getGridColumns(moduleCount, columnsOverride);
  return `${columns}×${Math.ceil(moduleCount / columns)}`;
}
