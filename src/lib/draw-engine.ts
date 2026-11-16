import type { CurrentRound, Participant, Prize, PrizeImage, Winner } from '@/lib/types';
import { drawWinners } from '@/lib/lottery-logic';
import { MAX_MODULE_COUNT } from '@/lib/defaults';

export type Rng = () => number;

// Fisher–Yates 洗牌，返回新数组
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 可用图片 = 未被任何中奖记录引用的图片（保持原顺序）
export function getAvailableImages(images: PrizeImage[], winners: Winner[]): PrizeImage[] {
  const used = new Set(winners.map((w) => w.imageId).filter(Boolean));
  return images.filter((img) => !used.has(img.id));
}

// 默认图片池：有与奖项同名分组的可用图片时只用这些，否则 null（= 全部可用）
export function getDefaultImagePoolIds(available: PrizeImage[], prizeName: string): string[] | null {
  const ids = available.filter((img) => img.group === prizeName).map((img) => img.id);
  return ids.length > 0 ? ids : null;
}

// 本轮图片池 = 可用图片 ∩ 选择（null = 全部可用）
export function resolveImagePool(images: PrizeImage[], winners: Winner[], imagePoolIds: string[] | null): PrizeImage[] {
  const available = getAvailableImages(images, winners);
  if (imagePoolIds === null) return available;
  const picked = new Set(imagePoolIds);
  return available.filter((img) => picked.has(img.id));
}

// 合格名字：未中过奖、未被禁中本奖项、未内定其他奖项
export function getEligibleParticipants(participants: Participant[], winners: Winner[], prizeId: string): Participant[] {
  const wonIds = new Set(winners.map((w) => w.id));
  return participants.filter((p) =>
    !wonIds.has(p.id)
    && !p.bannedPrizes.includes(prizeId)
    && (!p.mustWinPrizeId || p.mustWinPrizeId === prizeId),
  );
}

// 内定本奖项且仍合格的人
export function getMustWinCandidates(participants: Participant[], winners: Winner[], prizeId: string): Participant[] {
  return getEligibleParticipants(participants, winners, prizeId).filter((p) => p.mustWinPrizeId === prizeId);
}

// 本轮名字池 = 合格名字 ∩ 选择（null = 全部合格）∪ 内定本奖项的人
export function resolveNamePool(
  participants: Participant[],
  winners: Winner[],
  prizeId: string,
  namePoolIds: string[] | null,
): Participant[] {
  const eligible = getEligibleParticipants(participants, winners, prizeId);
  if (namePoolIds === null) return eligible;
  const picked = new Set(namePoolIds);
  return eligible.filter((p) => picked.has(p.id) || p.mustWinPrizeId === prizeId);
}

export function getRemainingSlots(prize: Prize, winners: Winner[]): number {
  const drawn = winners.filter((w) => w.prizeId === prize.id).length;
  return Math.max(0, prize.count - drawn);
}

// 不重复随机抽 count 个 id
export function drawImages(pool: { id: string }[], count: number, rng: Rng = Math.random): string[] {
  return shuffle(pool, rng).slice(0, Math.max(0, count)).map((item) => item.id);
}

// 必中优先 + 权重抽取，再整体打乱，避免必中者总在前面的模块
export function drawNames(pool: Participant[], mustWin: Participant[], count: number, rng: Rng = Math.random): string[] {
  return shuffle(drawWinners(pool, count, mustWin), rng).map((p) => p.id);
}

// 滚动帧取样：先不重复取，池不足时有放回补足到 count（画面不能出现空格）
export function sampleDistinct<T>(items: readonly T[], count: number, rng: Rng = Math.random): T[] {
  if (items.length === 0 || count <= 0) return [];
  const result = shuffle(items, rng).slice(0, count);
  while (result.length < count) {
    result.push(items[Math.floor(rng() * items.length)]);
  }
  return result;
}
// 本轮已定格（不可删除）的图片：仅奖品已揭晓、名字尚未定格时
export function getFrozenImageIds(round: CurrentRound | null): string[] {
  return round && (round.phase === 'prizesRevealed' || round.phase === 'rollingNames') ? round.resultImageIds : [];
}

export interface RollStartInput {
  prize: Prize | undefined;
  winners: Winner[];
  prizeImages: PrizeImage[];
  participants: Participant[];
  round: CurrentRound;
}

// 图片池凑不够 moduleCount 时返回原因（开始校验与停止时复查共用）
export function imagePoolShortage(input: RollStartInput): string | null {
  const n = input.round.moduleCount;
  const pool = resolveImagePool(input.prizeImages, input.winners, input.round.imagePoolIds);
  return pool.length < n ? `可用奖品图片不足：需要 ${n} 张，当前可选 ${pool.length} 张` : null;
}

// 名字池凑不够 moduleCount 时返回原因（开始校验与停止时复查共用）
export function namePoolShortage(prize: Prize, input: RollStartInput): string | null {
  const n = input.round.moduleCount;
  const pool = resolveNamePool(input.participants, input.winners, prize.id, input.round.namePoolIds);
  return pool.length < n ? `可参与名字不足：需要 ${n} 人，当前可选 ${pool.length} 人` : null;
}

// 开始抽奖品前的校验：按顺序返回第一个不满足的原因，全部通过返回 null
export function validatePrizeRollStart(input: RollStartInput): string | null {
  const { prize, winners, round } = input;
  if (!prize) return '请先选择奖项';
  const remaining = getRemainingSlots(prize, winners);
  if (remaining === 0) return `「${prize.name}」名额已抽完`;
  const n = round.moduleCount;
  if (!Number.isInteger(n) || n < 1 || n > MAX_MODULE_COUNT) return `模块数需在 1–${MAX_MODULE_COUNT} 之间`;
  if (n > remaining) return `本轮模块数（${n}）超过「${prize.name}」剩余名额（${remaining}）`;
  return imagePoolShortage(input) ?? namePoolShortage(prize, input);
}

// 开始抽名字前的校验
export function validateNameRollStart(input: RollStartInput): string | null {
  if (input.round.phase !== 'prizesRevealed') return '请先抽取本轮奖品';
  if (!input.prize) return '请先选择奖项';
  return namePoolShortage(input.prize, input);
}
