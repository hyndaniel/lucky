import { describe, expect, it } from 'vitest';
import type { CurrentRound, Participant, Prize, PrizeImage, Winner } from '@/lib/types';
import {
  drawImages,
  drawNames,
  getAvailableImages,
  getDefaultImagePoolIds,
  getEligibleParticipants,
  getFrozenImageIds,
  getMustWinCandidates,
  getRemainingSlots,
  imagePoolShortage,
  moduleCountError,
  namePoolShortage,
  NO_PRIZE_ERROR,
  resolveImagePool,
  resolveNamePool,
  sampleDistinct,
  shuffle,
  validateNameRollStart,
  validatePrizeRollStart,
} from '@/lib/draw-engine';

// 可复现的伪随机数（mulberry32）
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const img = (id: string, group = ''): PrizeImage => ({ id, serial: 1, label: `说明${id}`, group, createdAt: 0 });

// 预先带上 serial，兼容 Participant 增加该字段后的类型
const person = (id: string, extra: Partial<Participant> = {}): Participant =>
  ({ id, serial: 1, name: `名${id}`, dept: '', mustWinPrizeId: null, bannedPrizes: [], weight: 1, ...extra }) as Participant;

const win = (p: Participant, prizeId: string, imageId?: string): Winner =>
  ({ ...p, prizeId, roundId: 'r0', wonAt: 0, imageId }) as Winner;

const ids = (items: { id: string }[]) => items.map((i) => i.id);

const prize: Prize = { id: 'p1', name: '一等奖', count: 6 };

const round = (extra: Partial<CurrentRound> = {}): CurrentRound => ({
  id: 'r1', roundNo: 1, moduleCount: 3, phase: 'idle',
  imagePoolIds: null, namePoolIds: null, resultImageIds: [], resultNameIds: [], drawMode: 'image-then-name',
  ...extra,
});

const images = (n: number) => Array.from({ length: n }, (_, i) => img(`i${i + 1}`));
const people = (n: number) => Array.from({ length: n }, (_, i) => person(`u${i + 1}`));
describe('图片池', () => {
  const pool = [img('a', '一等奖'), img('b'), img('c', '一等奖'), img('d', '二等奖')];
  const u = person('u1');

  it('getAvailableImages 排除已被记录引用的图片，保持原顺序', () => {
    const winners = [win(u, 'p1', 'c'), win(person('u2'), 'p1')]; // 旧记录无 imageId
    expect(ids(getAvailableImages(pool, winners))).toEqual(['a', 'b', 'd']);
  });

  it('getDefaultImagePoolIds 命中同名分组时返回这些 id', () => {
    expect(getDefaultImagePoolIds(pool, '一等奖')).toEqual(['a', 'c']);
  });

  it('getDefaultImagePoolIds 无同名分组时返回 null', () => {
    expect(getDefaultImagePoolIds(pool, '特等奖')).toBeNull();
  });

  it('getDefaultImagePoolIds 只看传入的可用图片', () => {
    const available = getAvailableImages(pool, [win(u, 'p1', 'a'), win(person('u2'), 'p1', 'c')]);
    expect(getDefaultImagePoolIds(available, '一等奖')).toBeNull();
  });

  it('resolveImagePool 为 null 时取全部可用图片', () => {
    expect(ids(resolveImagePool(pool, [win(u, 'p1', 'b')], null))).toEqual(['a', 'c', 'd']);
  });

  it('resolveImagePool 取可用图片与选择的交集', () => {
    const winners = [win(u, 'p1', 'b')];
    expect(ids(resolveImagePool(pool, winners, ['d', 'b', 'x', 'a']))).toEqual(['a', 'd']);
    expect(resolveImagePool(pool, winners, [])).toEqual([]);
  });
});
describe('名字池', () => {
  const normal = person('n1');
  const won = person('w1');
  const banned = person('b1', { bannedPrizes: ['p1'] });
  const bannedOther = person('b2', { bannedPrizes: ['p2'] });
  const mustHere = person('m1', { mustWinPrizeId: 'p1' });
  const mustOther = person('m2', { mustWinPrizeId: 'p2' });
  const mustWon = person('m3', { mustWinPrizeId: 'p1' });
  const mustBanned = person('m4', { mustWinPrizeId: 'p1', bannedPrizes: ['p1'] });
  const all = [normal, won, banned, bannedOther, mustHere, mustOther, mustWon, mustBanned];
  const winners = [win(won, 'p2'), win(mustWon, 'p3')];

  it('getEligibleParticipants 排除已中奖、禁中本奖项、内定其他奖项的人', () => {
    expect(ids(getEligibleParticipants(all, winners, 'p1'))).toEqual(['n1', 'b2', 'm1']);
  });

  it('getMustWinCandidates 只返回合格且内定本奖项的人', () => {
    expect(ids(getMustWinCandidates(all, winners, 'p1'))).toEqual(['m1']);
    expect(ids(getMustWinCandidates(all, winners, 'p2'))).toEqual(['m2']);
  });

  it('resolveNamePool 为 null 时取全部合格名字', () => {
    expect(ids(resolveNamePool(all, winners, 'p1', null))).toEqual(['n1', 'b2', 'm1']);
  });

  it('resolveNamePool 取交集，且必中者不受选择限制', () => {
    expect(ids(resolveNamePool(all, winners, 'p1', ['b2', 'w1', 'b1']))).toEqual(['b2', 'm1']);
    expect(ids(resolveNamePool(all, winners, 'p1', []))).toEqual(['m1']);
  });

  it('resolveNamePool 选中必中者时不重复', () => {
    expect(ids(resolveNamePool(all, winners, 'p1', ['m1', 'n1']))).toEqual(['n1', 'm1']);
  });
});

describe('getRemainingSlots', () => {
  const u = people(8);

  it('= 名额 − 本奖项已有记录数，其它奖项记录不计', () => {
    const winners = [win(u[0], 'p1'), win(u[1], 'p1'), win(u[2], 'p2')];
    expect(getRemainingSlots(prize, winners)).toBe(4);
    expect(getRemainingSlots(prize, [])).toBe(6);
  });

  it('超发时为 0', () => {
    const winners = u.map((p) => win(p, 'p1'));
    expect(getRemainingSlots(prize, winners)).toBe(0);
  });
});
describe('drawImages', () => {
  it('不重复、只来自池、数量 = count', () => {
    const pool = images(10);
    const poolIds = new Set(ids(pool));
    const rng = seeded(1);
    for (let k = 0; k < 50; k++) {
      const result = drawImages(pool, 6, rng);
      expect(result).toHaveLength(6);
      expect(new Set(result).size).toBe(6);
      result.forEach((id) => expect(poolIds.has(id)).toBe(true));
    }
  });

  it('同一种子结果可复现', () => {
    expect(drawImages(images(10), 4, seeded(7))).toEqual(drawImages(images(10), 4, seeded(7)));
  });
});

describe('drawNames', () => {
  const pool = people(10);
  const mustWin = [person('m1', { mustWinPrizeId: 'p1' }), person('m2', { mustWinPrizeId: 'p1' })];
  const fullPool = [...pool, ...mustWin];
  const allowed = new Set(ids(fullPool));

  it('必中者必在结果中，结果无重复，长度 = count', () => {
    const rng = seeded(2);
    for (let k = 0; k < 50; k++) {
      const result = drawNames(fullPool, mustWin, 5, rng);
      expect(result).toHaveLength(5);
      expect(new Set(result).size).toBe(5);
      expect(result).toEqual(expect.arrayContaining(['m1', 'm2']));
      result.forEach((id) => expect(allowed.has(id)).toBe(true));
    }
  });

  it('必中者多于 count 时只取 count 个必中者', () => {
    const result = drawNames(fullPool, mustWin, 1, seeded(3));
    expect(result).toHaveLength(1);
    expect(['m1', 'm2']).toContain(result[0]);
  });

  it('结果顺序打乱，必中者不总在第 1 个', () => {
    const rng = seeded(4);
    const positions = new Set<number>();
    for (let k = 0; k < 60; k++) {
      positions.add(drawNames(fullPool, [mustWin[0]], 4, rng).indexOf('m1'));
    }
    expect(positions.size).toBeGreaterThan(1);
  });
});
describe('sampleDistinct', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('池足够时不重复取 count 个', () => {
    const rng = seeded(5);
    for (let k = 0; k < 30; k++) {
      const result = sampleDistinct(items, 4, rng);
      expect(result).toHaveLength(4);
      expect(new Set(result).size).toBe(4);
      result.forEach((x) => expect(items).toContain(x));
    }
  });

  it('池不足时先取全部不重复，再有放回补足到 count', () => {
    const result = sampleDistinct(['a', 'b', 'c'], 8, seeded(6));
    expect(result).toHaveLength(8);
    expect(new Set(result.slice(0, 3))).toEqual(new Set(['a', 'b', 'c']));
    result.forEach((x) => expect(['a', 'b', 'c']).toContain(x));
  });

  it('空池返回 []', () => {
    expect(sampleDistinct([], 5, seeded(1))).toEqual([]);
  });
});

describe('shuffle', () => {
  it('返回新数组，元素不变，不改原数组', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...input];
    const result = shuffle(input, seeded(9));
    expect(result).not.toBe(input);
    expect(input).toEqual(copy);
    expect([...result].sort((a, b) => a - b)).toEqual(copy);
  });

  it('同一种子结果可复现，且确实打乱了顺序', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(input, seeded(10))).toEqual(shuffle(input, seeded(10)));
    expect(shuffle(input, seeded(10))).not.toEqual(input);
  });
});
describe('validatePrizeRollStart', () => {
  const base = () => ({
    prize, winners: [] as Winner[], prizeImages: images(5), participants: people(5), round: round({ moduleCount: 3 }),
  });
  const outsiders = (n: number) => Array.from({ length: n }, (_, i) => win(person(`x${i}`), 'p1'));

  it('全部满足时返回 null', () => {
    expect(validatePrizeRollStart(base())).toBeNull();
  });

  it('1. 无当前奖项', () => {
    expect(validatePrizeRollStart({ ...base(), prize: undefined })).toBe('请先选择奖项');
  });

  it('2. 名额已抽完（优先于模块数、图片、名字不足）', () => {
    const input = { ...base(), prize: { ...prize, count: 2 }, winners: outsiders(2), prizeImages: [], participants: [] };
    expect(validatePrizeRollStart(input)).toBe('「一等奖」名额已抽完');
    expect(validatePrizeRollStart({ ...input, round: round({ moduleCount: 0 }) })).toBe('「一等奖」名额已抽完');
  });

  it('3. 模块数不在 1–60', () => {
    for (const moduleCount of [0, -1, 61, 2.5]) {
      expect(validatePrizeRollStart({ ...base(), round: round({ moduleCount }) })).toBe('模块数需在 1–60 之间');
    }
  });

  it('4. 模块数超过剩余名额（优先于图片不足）', () => {
    const input = { ...base(), winners: outsiders(3), prizeImages: images(2), round: round({ moduleCount: 5 }) };
    expect(validatePrizeRollStart(input)).toBe('本轮模块数（5）超过「一等奖」剩余名额（3）');
  });

  it('5. 图片不足（优先于名字不足）', () => {
    const input = { ...base(), prizeImages: images(2), participants: people(1) };
    expect(validatePrizeRollStart(input)).toBe('可用奖品图片不足：需要 3 张，当前可选 2 张');
  });

  it('5. 图片数按本轮图片池计算（选择与已用都会减少）', () => {
    const picked = { ...base(), round: round({ moduleCount: 3, imagePoolIds: ['i1', 'i2'] }) };
    expect(validatePrizeRollStart(picked)).toBe('可用奖品图片不足：需要 3 张，当前可选 2 张');
    const used = { ...base(), winners: [win(person('x'), 'p2', 'i1'), win(person('y'), 'p2', 'i2'), win(person('z'), 'p2', 'i3')] };
    expect(validatePrizeRollStart(used)).toBe('可用奖品图片不足：需要 3 张，当前可选 2 张');
  });

  it('6. 名字不足', () => {
    expect(validatePrizeRollStart({ ...base(), participants: people(2) })).toBe('可参与名字不足：需要 3 人，当前可选 2 人');
    const picked = { ...base(), round: round({ moduleCount: 3, namePoolIds: ['u1'] }) };
    expect(validatePrizeRollStart(picked)).toBe('可参与名字不足：需要 3 人，当前可选 1 人');
  });
});
describe('validateNameRollStart', () => {
  const base = () => ({
    prize, winners: [] as Winner[], prizeImages: [] as PrizeImage[], participants: people(5),
    round: round({ moduleCount: 3, phase: 'prizesRevealed', resultImageIds: ['i1', 'i2', 'i3'] }),
  });

  it('奖品已揭晓且名字足够时返回 null（不再检查图片池）', () => {
    expect(validateNameRollStart(base())).toBeNull();
  });

  it('阶段不是 prizesRevealed 时提示先抽奖品', () => {
    for (const phase of ['idle', 'rollingPrizes', 'rollingNames', 'completed'] as const) {
      expect(validateNameRollStart({ ...base(), round: round({ phase }) })).toBe('请先抽取本轮奖品');
    }
  });

  it('阶段检查优先于名字不足', () => {
    expect(validateNameRollStart({ ...base(), participants: [], round: round({ phase: 'idle' }) })).toBe('请先抽取本轮奖品');
  });

  it('名字不足', () => {
    expect(validateNameRollStart({ ...base(), participants: people(2) })).toBe('可参与名字不足：需要 3 人，当前可选 2 人');
  });

  it('奖项缺失时提示先选择奖项', () => {
    expect(validateNameRollStart({ ...base(), prize: undefined })).toBe('请先选择奖项');
  });
});
describe('getEligibleParticipants 与 image-only 记录', () => {
  it('id 为空的中奖记录不会排除 id 为空的名单项', () => {
    const blank = { ...win(person(''), 'p1', 'i1'), id: '', name: '' };
    expect(ids(getEligibleParticipants([person(''), person('u1')], [blank], 'p1'))).toEqual(['', 'u1']);
  });
});

describe('按抽奖模式的开始校验', () => {
  const mode = (drawMode: CurrentRound['drawMode'], extra: Partial<CurrentRound> = {}) => round({ moduleCount: 3, drawMode, ...extra });
  const base = (drawMode: CurrentRound['drawMode']) => ({
    prize, winners: [] as Winner[], prizeImages: images(5), participants: people(5), round: mode(drawMode),
  });

  it('image-only：只校验图片池，名字不足不影响', () => {
    expect(validatePrizeRollStart({ ...base('image-only'), participants: [] })).toBeNull();
    expect(validatePrizeRollStart({ ...base('image-only'), prizeImages: images(2) }))
      .toBe('可用奖品图片不足：需要 3 张，当前可选 2 张');
  });

  it('name-only：只校验名字池，没有图片也可以开始', () => {
    expect(validatePrizeRollStart({ ...base('name-only'), prizeImages: [] })).toBeNull();
    expect(validatePrizeRollStart({ ...base('name-only'), participants: people(2) }))
      .toBe('可参与名字不足：需要 3 人，当前可选 2 人');
  });

  it('各模式仍先做奖项 / 名额 / 模块数的公共校验', () => {
    for (const m of ['image-only', 'name-only'] as const) {
      expect(validatePrizeRollStart({ ...base(m), prize: undefined })).toBe(NO_PRIZE_ERROR);
      expect(validatePrizeRollStart({ ...base(m), round: mode(m, { moduleCount: 0 }) })).toBe('模块数需在 1–60 之间');
      expect(validatePrizeRollStart({ ...base(m), round: mode(m, { moduleCount: 7 }) }))
        .toBe('本轮模块数（7）超过「一等奖」剩余名额（6）');
    }
  });

  it('image-then-name 仍同时校验两个池', () => {
    expect(validatePrizeRollStart({ ...base('image-then-name'), participants: people(2) }))
      .toBe('可参与名字不足：需要 3 人，当前可选 2 人');
    expect(validatePrizeRollStart({ ...base('image-then-name'), prizeImages: images(2) }))
      .toBe('可用奖品图片不足：需要 3 张，当前可选 2 张');
  });

  it('validateNameRollStart：name-only 在 idle 即可开始，其它阶段拒绝；image-only 不抽名字', () => {
    expect(validateNameRollStart({ ...base('name-only'), prizeImages: [] })).toBeNull();
    expect(validateNameRollStart({ ...base('name-only'), round: mode('name-only', { phase: 'rollingNames' }) }))
      .toBe('当前阶段不能开始抽名字');
    expect(validateNameRollStart({ ...base('name-only'), participants: people(2) }))
      .toBe('可参与名字不足：需要 3 人，当前可选 2 人');
    expect(validateNameRollStart({ ...base('image-only'), round: mode('image-only', { phase: 'prizesRevealed' }) }))
      .toBe('当前模式不抽名字');
  });
});

describe('停止时的池检查（imagePoolShortage / namePoolShortage）', () => {
  const base = () => ({
    prize, winners: [] as Winner[], prizeImages: images(5), participants: people(5), round: round({ moduleCount: 3 }),
  });

  it('池足够时返回 null，不检查阶段与名额', () => {
    const input = { ...base(), round: round({ moduleCount: 3, phase: 'rollingNames' }), winners: [win(person('x'), 'p1')] };
    expect(imagePoolShortage(input)).toBeNull();
    expect(namePoolShortage(prize, input)).toBeNull();
  });

  it('不足时返回与开始校验相同的文案', () => {
    expect(imagePoolShortage({ ...base(), prizeImages: images(2) })).toBe('可用奖品图片不足：需要 3 张，当前可选 2 张');
    expect(namePoolShortage(prize, { ...base(), participants: people(1) })).toBe('可参与名字不足：需要 3 人，当前可选 1 人');
  });
});

describe('moduleCountError / NO_PRIZE_ERROR', () => {
  it('模块数为 1–60 的整数时返回 null，否则返回与开始校验相同的文案；无奖项文案共用', () => {
    for (const n of [1, 6, 60]) expect(moduleCountError(n)).toBeNull();
    for (const n of [0, -1, 61, 1.5, Number.NaN]) expect(moduleCountError(n)).toBe('模块数需在 1–60 之间');
    expect(NO_PRIZE_ERROR).toBe('请先选择奖项');
  });
});

describe('getFrozenImageIds', () => {
  it('仅 prizesRevealed / rollingNames 时返回本轮已定格的图片', () => {
    const resultImageIds = ['i1', 'i2'];
    expect(getFrozenImageIds(null)).toEqual([]);
    for (const phase of ['idle', 'rollingPrizes', 'completed'] as const) {
      expect(getFrozenImageIds(round({ phase, resultImageIds }))).toEqual([]);
    }
    for (const phase of ['prizesRevealed', 'rollingNames'] as const) {
      expect(getFrozenImageIds(round({ phase, resultImageIds }))).toEqual(resultImageIds);
    }
  });
});
