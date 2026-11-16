import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult, Participant, PrizeImage, Winner } from '@/lib/types';
import { DEFAULT_EFFECTS, DEFAULT_MODULE_STYLE, DEFAULT_SOUND, INITIAL_PRIZES } from '@/lib/defaults';
import { resolveImagePool, resolveNamePool } from '@/lib/draw-engine';
import { DEFAULT_PARTICIPANTS } from '@/assets/default-participants';
import hermesLogo from '@/assets/hermes-logo.jpg';
import { normalizeSettings, useLotteryStore } from '@/store/useStore';

type StoreState = ReturnType<typeof useLotteryStore.getState>;

const PHASE_ERROR = '当前阶段不能执行此操作';
const REPLACE_ERROR = '已有抽奖记录，覆盖导入会破坏去重，请先「重置清零」或改用追加导入';
const CLEAR_IMAGES_ERROR = '已有抽奖记录或本轮正在进行，无法清空图片池，请先「重置清零」';

const PRIZES = [
  { id: 'p1', name: '一等奖', count: 6 },
  { id: 'p2', name: '二等奖', count: 10 },
];

const person = (n: number, extra: Partial<Participant> = {}): Participant => ({
  id: `u${n}`, serial: n, name: `人员${n}`, dept: '技术部', mustWinPrizeId: null, bannedPrizes: [], weight: 1, ...extra,
});
const image = (n: number, group = ''): PrizeImage => ({ id: `img${n}`, serial: n, label: `图片${n}`, group, createdAt: 0 });
const winnerOf = (p: Participant, prizeId: string, extra: Partial<Winner> = {}): Winner => ({
  ...p, prizeId, roundId: 'r0', wonAt: 0, ...extra,
});
const range = <T>(n: number, make: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => make(i + 1));
const newPerson = (name: string) => ({ name, dept: '', mustWinPrizeId: null, bannedPrizes: [], weight: 1 });

const initialSettings = useLotteryStore.getInitialState().settings;
const s = () => useLotteryStore.getState();
const OK: ActionResult = { ok: true };
const fail = (reason: string): ActionResult => ({ ok: false, reason });

// 小规模测试名单：20 人、20 张图片、两个奖项（一等奖 6 人、二等奖 10 人）
function resetStore(extra: Partial<StoreState> = {}) {
  useLotteryStore.setState({
    participants: range(20, (i) => person(i)),
    participantSerialCounter: 20,
    winners: [],
    prizes: PRIZES,
    prizeImages: range(20, (i) => image(i)),
    imageSerialCounter: 20,
    roundCounter: 0,
    currentPrizeId: 'p1',
    currentRound: null,
    viewMode: 'welcome',
    settings: initialSettings,
    ...extra,
  });
}
// 在 null / idle 轮次上走完一整轮，返回定格后的轮次
function playRound(moduleCount: number) {
  expect(s().setRoundConfig({ moduleCount })).toEqual(OK);
  expect(s().startPrizeRoll()).toEqual(OK);
  expect(s().stopPrizeRoll()).toEqual(OK);
  expect(s().startNameRoll()).toEqual(OK);
  expect(s().stopNameRoll()).toEqual(OK);
  return s().currentRound!;
}

beforeEach(() => resetStore());
afterEach(() => vi.restoreAllMocks());

describe('编号', () => {
  it('addParticipant 从计数器连续发号', () => {
    s().addParticipant(newPerson('新人甲'));
    s().addParticipant(newPerson('新人乙'));
    const added = s().participants.slice(-2);
    expect(added.map((p) => [p.name, p.serial])).toEqual([['新人甲', 21], ['新人乙', 22]]);
    expect(new Set(s().participants.map((p) => p.id)).size).toBe(22);
    expect(s().participantSerialCounter).toBe(22);
  });

  it('addPrizeImages 发 serial 与 createdAt，未填分组为空串', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const added = s().addPrizeImages([{ id: 'n1', label: '耳机', group: '一等奖' }, { id: 'n2', label: '音箱' }]);
    expect(added).toEqual([
      { id: 'n1', serial: 21, label: '耳机', group: '一等奖', createdAt: 1_700_000_000_000 },
      { id: 'n2', serial: 22, label: '音箱', group: '', createdAt: 1_700_000_000_000 },
    ]);
    expect(s().prizeImages.slice(-2)).toEqual(added);
    expect(s().imageSerialCounter).toBe(22);
  });

  it('删除后再添加不复用编号', () => {
    s().removeParticipant('u20');
    s().addParticipant(newPerson('补录'));
    expect(s().participants.at(-1)!.serial).toBe(21);
    expect(s().removePrizeImages(['img20']).removed).toEqual(['img20']);
    expect(s().addPrizeImages([{ id: 'n1', label: '新图' }])[0].serial).toBe(21);
  });

  it('updatePrizeImage 只改说明与分组', () => {
    s().updatePrizeImage('img1', { label: '新说明' });
    s().updatePrizeImage('img1', { group: '一等奖' });
    expect(s().prizeImages[0]).toEqual({ ...image(1), label: '新说明', group: '一等奖' });
  });
});
describe('importParticipants', () => {
  it('覆盖导入（默认）从 1 重新编号', () => {
    expect(s().importParticipants('张三\n李四\n王五')).toEqual({ success: true, count: 3, duplicateNames: 0 });
    expect(s().participants.map((p) => [p.name, p.serial])).toEqual([['张三', 1], ['李四', 2], ['王五', 3]]);
    expect(s().participantSerialCounter).toBe(3);
  });

  it('追加导入接续编号', () => {
    expect(s().importParticipants('张三\n李四', false, 'append')).toEqual({ success: true, count: 2, duplicateNames: 0 });
    expect(s().participants).toHaveLength(22);
    expect(s().participants.slice(-2).map((p) => p.serial)).toEqual([21, 22]);
    expect(s().participantSerialCounter).toBe(22);
  });

  it('有中奖记录时覆盖导入失败且名单不变，追加仍可用', () => {
    resetStore({ winners: [winnerOf(person(1), 'p1')] });
    const before = s().participants;
    expect(s().importParticipants('张三')).toEqual({ success: false, count: 0, duplicateNames: 0, error: REPLACE_ERROR });
    expect(s().participants).toBe(before);
    expect(s().participantSerialCounter).toBe(20);
    expect(s().importParticipants('张三', false, 'append').success).toBe(true);
  });

  it('本轮已开始时覆盖导入失败', () => {
    expect(s().startPrizeRoll()).toEqual(OK);
    expect(s().importParticipants('张三').error).toBe(REPLACE_ERROR);
    expect(s().participants).toHaveLength(20);
  });

  it('覆盖导入成功后本轮名字池恢复为 null（旧 id 已不存在）；追加导入保留', () => {
    expect(s().setRoundConfig({ moduleCount: 2, namePoolIds: ['u1', 'u2'] })).toEqual(OK);
    expect(s().importParticipants('张三', false, 'append').success).toBe(true);
    expect(s().currentRound!.namePoolIds).toEqual(['u1', 'u2']);
    expect(s().importParticipants('张三\n李四').success).toBe(true);
    expect(s().currentRound).toMatchObject({ phase: 'idle', moduleCount: 2, namePoolIds: null });
    resetStore();
    expect(s().importParticipants('张三').success).toBe(true);
    expect(s().currentRound).toBeNull();
  });

  it('duplicateNames = 与（追加时的现有名单 + 本批更早行）重名的行数，重名仍按不同人导入', () => {
    const appended = s().importParticipants('人员1\n张三\n张三\n李四', false, 'append');
    expect(appended).toEqual({ success: true, count: 4, duplicateNames: 2 });
    expect(s().participants).toHaveLength(24);
    resetStore();
    expect(s().importParticipants('人员1\n张三\n张三\n李四').duplicateNames).toBe(1);
  });

  it('解析失败时返回解析器的错误，名单不变', () => {
    const before = s().participants;
    expect(s().importParticipants('  \n ')).toEqual({ success: false, count: 0, duplicateNames: 0, error: '未识别到任何姓名' });
    expect(s().participants).toBe(before);
  });

  it('受控字段按当前奖项名称解析', () => {
    s().importParticipants('姓名,必中奖项\n张三,一等奖', true);
    expect(s().participants[0]).toMatchObject({ name: '张三', mustWinPrizeId: 'p1', serial: 1 });
  });
});
describe('轮次状态机', () => {
  it('完整一轮：选奖项 → 抽奖品 → 抽名字 → 下一轮', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    expect(s().selectPrize('p1')).toEqual(OK);
    const created = s().currentRound!;
    expect(created).toMatchObject({
      roundNo: 1, phase: 'idle', moduleCount: 6, imagePoolIds: null, namePoolIds: null, resultImageIds: [], resultNameIds: [],
    });

    expect(s().setRoundConfig({ moduleCount: 3 })).toEqual(OK);
    expect(s().startPrizeRoll()).toEqual(OK);
    expect(s().currentRound!.phase).toBe('rollingPrizes');
    expect(s().viewMode).toBe('lottery');

    expect(s().stopPrizeRoll()).toEqual(OK);
    const revealed = s().currentRound!;
    expect(revealed.phase).toBe('prizesRevealed');
    expect(revealed.resultImageIds).toHaveLength(3);
    expect(new Set(revealed.resultImageIds).size).toBe(3);
    const allImageIds = s().prizeImages.map((i) => i.id);
    expect(revealed.resultImageIds.every((id) => allImageIds.includes(id))).toBe(true);
    expect(s().winners).toEqual([]);

    expect(s().startNameRoll()).toEqual(OK);
    expect(s().currentRound!.phase).toBe('rollingNames');
    expect(s().stopNameRoll()).toEqual(OK);

    const done = s().currentRound!;
    expect(done.phase).toBe('completed');
    expect(done.id).toBe(created.id);
    expect(done.resultImageIds).toEqual(revealed.resultImageIds);
    expect(done.resultNameIds).toHaveLength(3);
    expect(new Set(done.resultNameIds).size).toBe(3);
    expect(s().roundCounter).toBe(1);
    expect(s().winners).toEqual(done.resultNameIds.map((pid, i) => {
      const p = s().participants.find((x) => x.id === pid)!;
      const img = s().prizeImages.find((x) => x.id === done.resultImageIds[i])!;
      return {
        ...p, prizeId: 'p1', roundId: created.id, roundNo: 1, wonAt: 1_700_000_000_000,
        imageId: img.id, imageSerial: img.serial, imageLabel: img.label,
      };
    }));

    expect(s().nextRound()).toEqual(OK);
    const next = s().currentRound!;
    expect(next.id).not.toBe(created.id);
    expect(next).toMatchObject({ roundNo: 2, phase: 'idle', moduleCount: 3, resultImageIds: [], resultNameIds: [] });
  });
  it('nextRound 模块数 = min(上一轮模块数, 剩余名额)，名额抽完后为 1 且开始时报错', () => {
    s().selectPrize('p2');
    playRound(3);
    expect(s().nextRound()).toEqual(OK);
    expect(s().currentRound!.moduleCount).toBe(3); // 剩余 7，沿用上一轮的 3

    s().selectPrize('p1');
    playRound(4);
    expect(s().nextRound()).toEqual(OK);
    expect(s().currentRound!.moduleCount).toBe(2); // 剩余 2 < 上一轮 4
    playRound(2);
    expect(s().nextRound()).toEqual(OK);
    expect(s().currentRound).toMatchObject({ roundNo: 4, moduleCount: 1, phase: 'idle' });
    expect(s().startPrizeRoll()).toEqual(fail('「一等奖」名额已抽完'));
  });

  it('nextRound 只能在 completed 时调用', () => {
    expect(s().nextRound()).toEqual(fail(PHASE_ERROR));
    s().selectPrize('p1');
    expect(s().nextRound()).toEqual(fail(PHASE_ERROR));
  });

  it('selectPrize 默认模块数 = min(12, 剩余)，有同名分组的可用图片时默认只用该分组', () => {
    resetStore({ prizeImages: [image(1, '一等奖'), image(2), image(3, '一等奖')] });
    s().selectPrize('p1');
    expect(s().currentRound).toMatchObject({ moduleCount: 6, imagePoolIds: ['img1', 'img3'] });
    s().selectPrize('p2');
    expect(s().currentRound).toMatchObject({ moduleCount: 10, imagePoolIds: null });
  });

  it('selectPrize 重选同一奖项也新建 idle 轮次；传 null 清空奖项与轮次', () => {
    s().selectPrize('p1');
    s().setRoundConfig({ moduleCount: 2 });
    const first = s().currentRound!;
    expect(s().selectPrize('p1')).toEqual(OK);
    expect(s().currentRound!.id).not.toBe(first.id);
    expect(s().currentRound!.moduleCount).toBe(6);
    expect(s().selectPrize(null)).toEqual(OK);
    expect(s().currentPrizeId).toBeNull();
    expect(s().currentRound).toBeNull();
  });

  it('completed 后可切换奖项，新轮次号接续', () => {
    s().selectPrize('p1');
    playRound(2);
    expect(s().selectPrize('p2')).toEqual(OK);
    expect(s().currentPrizeId).toBe('p2');
    expect(s().currentRound).toMatchObject({ roundNo: 2, phase: 'idle', moduleCount: 10 });
  });

  it('currentRound 为 null 时 startPrizeRoll 自动创建轮次；无奖项时失败', () => {
    expect(s().startPrizeRoll()).toEqual(OK);
    expect(s().currentRound).toMatchObject({ roundNo: 1, moduleCount: 6, phase: 'rollingPrizes' });
    resetStore({ currentPrizeId: null });
    expect(s().startPrizeRoll()).toEqual(fail('请先选择奖项'));
    expect(s().currentRound).toBeNull();
  });
  it('advanceRound 按阶段走五个分支，失败时返回原因', () => {
    const phases: string[] = [];
    for (let i = 0; i < 5; i++) {
      expect(s().advanceRound()).toEqual(OK);
      phases.push(s().currentRound!.phase);
    }
    // null → startPrizeRoll → stopPrizeRoll → startNameRoll → stopNameRoll → nextRound
    expect(phases).toEqual(['rollingPrizes', 'prizesRevealed', 'rollingNames', 'completed', 'idle']);
    expect(s().winners).toHaveLength(6);
    expect(s().currentRound!.roundNo).toBe(2);
    // 一等奖已抽完：idle → startPrizeRoll 失败
    expect(s().advanceRound()).toEqual(fail('「一等奖」名额已抽完'));
    expect(s().currentRound!.phase).toBe('idle');
    // idle → startPrizeRoll 成功
    s().selectPrize('p2');
    expect(s().advanceRound()).toEqual(OK);
    expect(s().currentRound!.phase).toBe('rollingPrizes');
  });

  it('受控：必中者一定出现在本轮结果中（即使不在所选名字池）', () => {
    resetStore({ participants: [...range(19, (i) => person(i)), person(20, { mustWinPrizeId: 'p1' })] });
    s().setRoundConfig({ namePoolIds: ['u1', 'u2', 'u3'] });
    playRound(2);
    expect(s().winners.map((w) => w.id)).toContain('u20');
  });
});

describe('cancelRound', () => {
  beforeEach(() => {
    s().selectPrize('p1');
    s().setRoundConfig({ moduleCount: 3 });
  });

  it('rollingPrizes → idle', () => {
    s().startPrizeRoll();
    expect(s().cancelRound()).toEqual(OK);
    expect(s().currentRound).toMatchObject({ phase: 'idle', moduleCount: 3, resultImageIds: [], resultNameIds: [] });
  });

  it('prizesRevealed → idle，清空奖品结果', () => {
    s().startPrizeRoll();
    s().stopPrizeRoll();
    expect(s().cancelRound()).toEqual(OK);
    expect(s().currentRound).toMatchObject({ phase: 'idle', resultImageIds: [], resultNameIds: [] });
  });

  it('rollingNames → prizesRevealed，保留奖品结果', () => {
    s().startPrizeRoll();
    s().stopPrizeRoll();
    const images = s().currentRound!.resultImageIds;
    s().startNameRoll();
    expect(s().cancelRound()).toEqual(OK);
    expect(s().currentRound).toMatchObject({ phase: 'prizesRevealed', resultImageIds: images, resultNameIds: [] });
    expect(s().winners).toEqual([]);
  });
  it('idle / completed / null 时失败且状态不变', () => {
    expect(s().cancelRound()).toEqual(fail(PHASE_ERROR));
    expect(s().currentRound!.phase).toBe('idle');
    const done = playRound(3);
    expect(s().cancelRound()).toEqual(fail(PHASE_ERROR));
    expect(s().currentRound).toBe(done);
    expect(s().winners).toHaveLength(3);
    s().selectPrize(null);
    expect(s().cancelRound()).toEqual(fail(PHASE_ERROR));
  });
});

describe('进行中的轮次锁定配置', () => {
  beforeEach(() => {
    s().selectPrize('p1');
    s().setRoundConfig({ moduleCount: 3 });
  });

  it('rollingPrizes / prizesRevealed / rollingNames 中 selectPrize 失败且状态不变', () => {
    for (const step of [() => s().startPrizeRoll(), () => s().stopPrizeRoll(), () => s().startNameRoll()]) {
      expect(step()).toEqual(OK);
      const round = s().currentRound;
      expect(s().selectPrize('p2')).toEqual(fail(PHASE_ERROR));
      expect(s().selectPrize(null)).toEqual(fail(PHASE_ERROR));
      expect(s().currentPrizeId).toBe('p1');
      expect(s().currentRound).toBe(round);
    }
  });

  it('rolling 中 setRoundConfig({ moduleCount }) 失败且状态不变', () => {
    s().startPrizeRoll();
    const rollingPrizes = s().currentRound;
    expect(s().setRoundConfig({ moduleCount: 2 })).toEqual(fail(PHASE_ERROR));
    expect(s().currentRound).toBe(rollingPrizes);
    s().stopPrizeRoll();
    s().startNameRoll();
    const rollingNames = s().currentRound;
    expect(s().setRoundConfig({ moduleCount: 2 })).toEqual(fail(PHASE_ERROR));
    expect(s().setRoundConfig({ namePoolIds: ['u1'] })).toEqual(fail(PHASE_ERROR));
    expect(s().currentRound).toBe(rollingNames);
  });

  it('prizesRevealed 可改 namePoolIds，不可改 imagePoolIds / moduleCount', () => {
    s().startPrizeRoll();
    s().stopPrizeRoll();
    const revealed = s().currentRound!;
    expect(s().setRoundConfig({ imagePoolIds: ['img1'] })).toEqual(fail(PHASE_ERROR));
    expect(s().setRoundConfig({ moduleCount: 2 })).toEqual(fail(PHASE_ERROR));
    expect(s().currentRound).toBe(revealed);
    expect(s().setRoundConfig({ namePoolIds: ['u1', 'u2', 'u3'] })).toEqual(OK);
    expect(s().currentRound).toEqual({ ...revealed, namePoolIds: ['u1', 'u2', 'u3'] });
    s().startNameRoll();
    s().stopNameRoll();
    expect(s().winners.map((w) => w.id).sort()).toEqual(['u1', 'u2', 'u3']);
  });
});
describe('setRoundConfig', () => {
  it('round 为 null 时自动创建；idle 可改模块数与图片池', () => {
    expect(s().setRoundConfig({ moduleCount: 2, imagePoolIds: ['img1', 'img2'] })).toEqual(OK);
    expect(s().currentRound).toMatchObject({
      roundNo: 1, phase: 'idle', moduleCount: 2, imagePoolIds: ['img1', 'img2'], namePoolIds: null,
    });
    expect(s().setRoundConfig({ imagePoolIds: null })).toEqual(OK);
    expect(s().currentRound!.imagePoolIds).toBeNull();
  });

  it('模块数非整数或超出 1–60 时失败且不改状态；超过剩余名额可保存但开始时报错', () => {
    for (const moduleCount of [0, 61, 2.5, Number.NaN]) {
      expect(s().setRoundConfig({ moduleCount })).toEqual(fail('模块数需在 1–60 之间'));
    }
    expect(s().currentRound).toBeNull();
    expect(s().setRoundConfig({ moduleCount: 8 })).toEqual(OK);
    expect(s().startPrizeRoll()).toEqual(fail('本轮模块数（8）超过「一等奖」剩余名额（6）'));
    expect(s().currentRound!.phase).toBe('idle');
  });

  it('无奖项时失败', () => {
    resetStore({ currentPrizeId: null });
    expect(s().setRoundConfig({ moduleCount: 2 })).toEqual(fail('请先选择奖项'));
    expect(s().currentRound).toBeNull();
  });
});

describe('开始校验', () => {
  it('图片不足时 startPrizeRoll 返回原因，阶段与视图不变', () => {
    resetStore({ prizeImages: [image(1), image(2)] });
    s().setRoundConfig({ moduleCount: 3 });
    expect(s().startPrizeRoll()).toEqual(fail('可用奖品图片不足：需要 3 张，当前可选 2 张'));
    expect(s().currentRound!.phase).toBe('idle');
    expect(s().viewMode).toBe('welcome');
  });

  it('名额已抽完时 startPrizeRoll 返回原因', () => {
    resetStore({ winners: range(6, (i) => winnerOf(person(i), 'p1')) });
    s().selectPrize('p1');
    expect(s().currentRound!.moduleCount).toBe(1);
    expect(s().startPrizeRoll()).toEqual(fail('「一等奖」名额已抽完'));
    expect(s().currentRound!.phase).toBe('idle');
  });

  it('名字不足时 startPrizeRoll 返回原因', () => {
    resetStore({ participants: [person(1), person(2)] });
    s().setRoundConfig({ moduleCount: 3 });
    expect(s().startPrizeRoll()).toEqual(fail('可参与名字不足：需要 3 人，当前可选 2 人'));
    expect(s().currentRound!.phase).toBe('idle');
  });

  it('奖品未定格时 startNameRoll 返回原因', () => {
    s().setRoundConfig({ moduleCount: 3 });
    expect(s().startNameRoll()).toEqual(fail('请先抽取本轮奖品'));
    expect(s().currentRound!.phase).toBe('idle');
  });
});
describe('停止时重新检查池（裁定 1）', () => {
  it('滚动中图片被删到不足时 stopPrizeRoll 失败并停在 rollingPrizes', () => {
    resetStore({ prizeImages: range(4, (i) => image(i)) });
    s().setRoundConfig({ moduleCount: 3 });
    s().startPrizeRoll();
    expect(s().removePrizeImages(['img1', 'img2'])).toEqual({ removed: ['img1', 'img2'], blocked: [] });
    expect(s().stopPrizeRoll()).toEqual(fail('可用奖品图片不足：需要 3 张，当前可选 2 张'));
    expect(s().currentRound).toMatchObject({ phase: 'rollingPrizes', resultImageIds: [] });
    expect(s().cancelRound()).toEqual(OK);
  });

  it('滚动中名字被删到不足时 stopNameRoll 失败并停在 rollingNames', () => {
    resetStore({ participants: range(3, (i) => person(i)) });
    s().setRoundConfig({ moduleCount: 3 });
    s().startPrizeRoll();
    s().stopPrizeRoll();
    s().startNameRoll();
    s().removeParticipant('u1');
    expect(s().stopNameRoll()).toEqual(fail('可参与名字不足：需要 3 人，当前可选 2 人'));
    expect(s().currentRound).toMatchObject({ phase: 'rollingNames', resultNameIds: [] });
    expect(s().winners).toEqual([]);
    expect(s().roundCounter).toBe(0);
  });

  it('不在对应滚动阶段时 stop 动作失败', () => {
    expect(s().stopPrizeRoll()).toEqual(fail(PHASE_ERROR));
    expect(s().stopNameRoll()).toEqual(fail(PHASE_ERROR));
    s().startPrizeRoll();
    expect(s().stopNameRoll()).toEqual(fail(PHASE_ERROR));
  });
});

describe('跨轮去重', () => {
  it('第二轮的图片池与名字池不含第一轮结果', () => {
    resetStore({ prizeImages: range(6, (i) => image(i)), participants: range(6, (i) => person(i)) });
    // 固定随机数：若未去重，第二轮会抽出与第一轮相同的结果
    vi.spyOn(Math, 'random').mockReturnValue(0);
    s().selectPrize('p2');
    const first = playRound(3);
    expect(s().nextRound()).toEqual(OK);

    const round = s().currentRound!;
    const imagePool = resolveImagePool(s().prizeImages, s().winners, round.imagePoolIds).map((i) => i.id);
    const namePool = resolveNamePool(s().participants, s().winners, 'p2', round.namePoolIds).map((p) => p.id);
    expect(imagePool.filter((id) => first.resultImageIds.includes(id))).toEqual([]);
    expect(namePool.filter((id) => first.resultNameIds.includes(id))).toEqual([]);

    const second = playRound(3);
    expect([...first.resultImageIds, ...second.resultImageIds].sort()).toEqual(range(6, (i) => `img${i}`));
    expect([...first.resultNameIds, ...second.resultNameIds].sort()).toEqual(range(6, (i) => `u${i}`));
    expect(s().roundCounter).toBe(2);
  });
});
describe('removePrizeImages / clearPrizeImages', () => {
  const POOL = ['img2', 'img3', 'img4', 'img5'];

  it('已被记录引用与本轮已定格的图片进 blocked；被删 id 从 imagePoolIds 移除', () => {
    resetStore({ winners: [winnerOf(person(1), 'p2', { imageId: 'img1' })] });
    s().setRoundConfig({ moduleCount: 2, imagePoolIds: POOL });
    s().startPrizeRoll();
    s().stopPrizeRoll();
    const frozen = s().currentRound!.resultImageIds;
    const free = POOL.filter((id) => !frozen.includes(id));

    const result = s().removePrizeImages(['img1', ...frozen, free[0], 'img9', 'missing']);
    expect(result).toEqual({ removed: [free[0], 'img9'], blocked: ['img1', ...frozen] });
    expect(s().prizeImages.map((i) => i.id)).not.toContain(free[0]);
    expect(s().prizeImages).toHaveLength(18);
    expect(s().currentRound!.imagePoolIds).toEqual(POOL.filter((id) => id !== free[0]));
    expect(s().currentRound!.phase).toBe('prizesRevealed');

    s().startNameRoll();
    expect(s().removePrizeImages(frozen)).toEqual({ removed: [], blocked: frozen });
  });

  it('clearPrizeImages：有记录时失败', () => {
    resetStore({ winners: [winnerOf(person(1), 'p1')] });
    expect(s().clearPrizeImages()).toEqual(fail(CLEAR_IMAGES_ERROR));
    expect(s().prizeImages).toHaveLength(20);
    expect(s().imageSerialCounter).toBe(20);
  });

  it('clearPrizeImages：本轮进行中失败；idle 时清空、计数器归零、本轮图片池恢复自动', () => {
    s().setRoundConfig({ moduleCount: 2, imagePoolIds: ['img1', 'img2'] });
    s().startPrizeRoll();
    expect(s().clearPrizeImages()).toEqual(fail(CLEAR_IMAGES_ERROR));
    expect(s().prizeImages).toHaveLength(20);
    s().cancelRound();
    expect(s().clearPrizeImages()).toEqual(OK);
    expect(s().prizeImages).toEqual([]);
    expect(s().imageSerialCounter).toBe(0);
    expect(s().currentRound!.imagePoolIds).toBeNull();
    expect(s().addPrizeImages([{ id: 'n1', label: '新' }])[0].serial).toBe(1);
  });
});

describe('自动图片池随图片变更重算', () => {
  // 一等奖分组 2 张 + 未分组 1 张
  const grouped = () => resetStore({ prizeImages: [image(1, '一等奖'), image(2, '一等奖'), image(3)], imageSerialCounter: 3 });
  const pool = () => s().currentRound!.imagePoolIds;

  it('无同名分组（null）时上传同名分组图片 → 切到这些图片', () => {
    expect(s().selectPrize('p1')).toEqual(OK);
    expect(pool()).toBeNull();
    s().addPrizeImages([{ id: 'g1', label: 'A', group: '一等奖' }, { id: 'n1', label: 'B' }]);
    expect(pool()).toEqual(['g1']);
  });

  it('分组默认池（顺序不同但集合相等也算）再上传同组图片 → 池扩展', () => {
    grouped();
    s().selectPrize('p1');
    expect(pool()).toEqual(['img1', 'img2']);
    s().addPrizeImages([{ id: 'g3', label: 'C', group: '一等奖' }]);
    expect(pool()).toEqual(['img1', 'img2', 'g3']);
    expect(s().setRoundConfig({ imagePoolIds: ['g3', 'img2', 'img1'] })).toEqual(OK);
    s().addPrizeImages([{ id: 'g4', label: 'D', group: '一等奖' }]);
    expect(pool()).toEqual(['img1', 'img2', 'g3', 'g4']);
  });

  it('手动选择（非默认子集）时上传、改分组都不动', () => {
    grouped();
    s().selectPrize('p1');
    s().setRoundConfig({ imagePoolIds: ['img1'] });
    s().addPrizeImages([{ id: 'g3', label: 'C', group: '一等奖' }]);
    s().updatePrizeImage('img3', { group: '一等奖' });
    expect(pool()).toEqual(['img1']);

    resetStore();
    s().setRoundConfig({ imagePoolIds: ['img1', 'img2'] });
    s().addPrizeImages([{ id: 'g1', label: 'A', group: '一等奖' }]);
    expect(pool()).toEqual(['img1', 'img2']);
  });

  it('删光自动分组池里的图片 → 回落为 null', () => {
    grouped();
    s().selectPrize('p1');
    expect(s().removePrizeImages(['img1']).removed).toEqual(['img1']);
    expect(pool()).toEqual(['img2']);
    s().removePrizeImages(['img2']);
    expect(pool()).toBeNull();
  });

  it('updatePrizeImage 改分组时自动池随之重算', () => {
    s().selectPrize('p1');
    s().updatePrizeImage('img5', { group: '一等奖' });
    expect(pool()).toEqual(['img5']);
    s().updatePrizeImage('img5', { group: '' });
    expect(pool()).toBeNull();
  });

  it('非 idle 轮次不重算', () => {
    grouped();
    s().selectPrize('p1');
    s().setRoundConfig({ moduleCount: 1 });
    expect(s().startPrizeRoll()).toEqual(OK);
    s().addPrizeImages([{ id: 'g3', label: 'C', group: '一等奖' }]);
    s().updatePrizeImage('img3', { group: '一等奖' });
    expect(pool()).toEqual(['img1', 'img2']);
  });
});

describe('resetWinners（重置清零）', () => {
  it('清空记录与轮次计数，为当前奖项新建 idle 轮；图片池/名单/奖项/设置不变', () => {
    s().selectPrize('p1');
    const done = playRound(3);
    const { participants, prizeImages, prizes, settings, imageSerialCounter, participantSerialCounter } = s();
    s().resetWinners();
    expect(s().winners).toEqual([]);
    expect(s().roundCounter).toBe(0);
    expect(s().currentRound!.id).not.toBe(done.id);
    expect(s().currentRound).toMatchObject({ roundNo: 1, phase: 'idle', moduleCount: 6, resultImageIds: [], resultNameIds: [] });
    expect(s().currentPrizeId).toBe('p1');
    expect(s().participants).toBe(participants);
    expect(s().prizeImages).toBe(prizeImages);
    expect(s().prizes).toBe(prizes);
    expect(s().settings).toBe(settings);
    expect(s().imageSerialCounter).toBe(imageSerialCounter);
    expect(s().participantSerialCounter).toBe(participantSerialCounter);
    // R12：重置后图片可删
    expect(s().removePrizeImages(done.resultImageIds).removed).toEqual(done.resultImageIds);
  });

  it('无当前奖项时 currentRound 为 null', () => {
    resetStore({ currentPrizeId: null, winners: [winnerOf(person(1), 'p1')], roundCounter: 3 });
    s().resetWinners();
    expect(s().currentRound).toBeNull();
    expect(s().roundCounter).toBe(0);
  });
});
describe('removePrize（裁定 2）', () => {
  it('轮次进行中拒绝删除任何奖项', () => {
    s().selectPrize('p1');
    s().setRoundConfig({ moduleCount: 3 });
    for (const step of [() => s().startPrizeRoll(), () => s().stopPrizeRoll(), () => s().startNameRoll()]) {
      expect(step()).toEqual(OK);
      expect(s().removePrize('p2')).toEqual(fail(PHASE_ERROR));
      expect(s().removePrize('p1')).toEqual(fail(PHASE_ERROR));
      expect(s().prizes).toHaveLength(2);
    }
  });

  it('删其它奖项保留轮次；删当前奖项时清空 currentPrizeId 与 currentRound', () => {
    s().selectPrize('p1');
    const round = s().currentRound;
    expect(s().removePrize('p2')).toEqual(OK);
    expect(s().currentRound).toBe(round);
    expect(s().removePrize('p1')).toEqual(OK);
    expect(s().prizes).toEqual([]);
    expect(s().currentPrizeId).toBeNull();
    expect(s().currentRound).toBeNull();
  });

  it('completed 阶段允许删除', () => {
    s().selectPrize('p1');
    playRound(2);
    expect(s().removePrize('p1')).toEqual(OK);
    expect(s().currentRound).toBeNull();
  });
});

describe('fullReset / restoreDefaultPrizes', () => {
  const bundledSerials = DEFAULT_PARTICIPANTS.map((_, i) => i + 1);

  it('fullReset 恢复内置名单（重新编号）与默认奖项，清空记录与轮次，保留图片池', () => {
    s().selectPrize('p1');
    playRound(2);
    const { prizeImages, imageSerialCounter } = s();
    s().fullReset();
    expect(s().participants.map((p) => p.id)).toEqual(DEFAULT_PARTICIPANTS.map((p) => p.id));
    expect(s().participants.map((p) => p.serial)).toEqual(bundledSerials);
    expect(s().participantSerialCounter).toBe(DEFAULT_PARTICIPANTS.length);
    expect(s().winners).toEqual([]);
    expect(s().prizes).toEqual(INITIAL_PRIZES);
    expect(s().currentPrizeId).toBe('1');
    expect(s().currentRound).toBeNull();
    expect(s().roundCounter).toBe(0);
    expect(s().prizeImages).toBe(prizeImages);
    expect(s().imageSerialCounter).toBe(imageSerialCounter);
  });

  it('restoreDefaultPrizes 同时清空轮次、重新编号内置名单，roundCounter 不变', () => {
    s().selectPrize('p1');
    playRound(2);
    s().restoreDefaultPrizes();
    expect(s().prizes).toEqual(INITIAL_PRIZES);
    expect(s().currentPrizeId).toBe('1');
    expect(s().currentRound).toBeNull();
    expect(s().roundCounter).toBe(1);
    expect(s().participants.map((p) => p.serial)).toEqual(bundledSerials);
    expect(s().participantSerialCounter).toBe(DEFAULT_PARTICIPANTS.length);
  });

  it('初始状态的内置名单已编号', () => {
    const initial = useLotteryStore.getInitialState();
    expect(initial.participants.map((p) => p.serial)).toEqual(bundledSerials);
    expect(initial.participantSerialCounter).toBe(DEFAULT_PARTICIPANTS.length);
    expect(initial).toMatchObject({ prizeImages: [], imageSerialCounter: 0, roundCounter: 0, currentRound: null });
    expect(initial.prizes).toEqual(INITIAL_PRIZES);
  });
});
describe('样式、特效、音效设置', () => {
  it('初始设置包含默认的模块样式、特效与音效', () => {
    expect(initialSettings.moduleStyle).toEqual(DEFAULT_MODULE_STYLE);
    expect(initialSettings.effects).toEqual(DEFAULT_EFFECTS);
    expect(initialSettings.sound).toEqual(DEFAULT_SOUND);
  });

  it('updateModuleStyle 对嵌套 TextStyle 也是浅合并', () => {
    s().updateModuleStyle({ nameStyle: { color: '#000000' } });
    const nameStyle = { ...DEFAULT_MODULE_STYLE.nameStyle, color: '#000000' };
    expect(s().settings.moduleStyle).toEqual({ ...DEFAULT_MODULE_STYLE, nameStyle });
    s().updateModuleStyle({ moduleScale: 60, labelStyle: { fontSize: 30 } });
    expect(s().settings.moduleStyle).toEqual({
      ...DEFAULT_MODULE_STYLE, moduleScale: 60, nameStyle, labelStyle: { ...DEFAULT_MODULE_STYLE.labelStyle, fontSize: 30 },
    });
    expect(s().settings.title).toBe(initialSettings.title);
  });

  it('updateEffects / updateSound 浅合并', () => {
    s().updateEffects({ kinds: ['stars', 'emoji'] });
    expect(s().settings.effects).toEqual({ ...DEFAULT_EFFECTS, kinds: ['stars', 'emoji'] });
    s().updateSound({ volume: 30 });
    expect(s().settings.sound).toEqual({ ...DEFAULT_SOUND, volume: 30 });
  });

  it('setSettings 仍强制 welcomeSubtitle 为 BONDING', () => {
    s().setSettings({ title: '新标题', welcomeSubtitle: 'OTHER' });
    expect(s().settings).toMatchObject({ title: '新标题', welcomeSubtitle: 'BONDING', moduleStyle: DEFAULT_MODULE_STYLE });
  });
});

describe('normalizeSettings', () => {
  const legacy = { title: '旧标题', password: 'pw', welcomeTitle: 'W', welcomeSubtitle: 'BONDING', prizePageTitle: '奖项' };

  it('缺 moduleStyle / effects / sound 时补默认值，保留其它字段', () => {
    const out = normalizeSettings(legacy);
    expect(out).toMatchObject(legacy);
    expect(out.moduleStyle).toEqual(DEFAULT_MODULE_STYLE);
    expect(out.effects).toEqual(DEFAULT_EFFECTS);
    expect(out.sound).toEqual(DEFAULT_SOUND);
  });

  it('缺 moduleStyle.nameStyle.fontSize 等子字段时只补缺失项', () => {
    const out = normalizeSettings({
      ...legacy,
      moduleStyle: { showName: false, nameStyle: { color: '#123456' } },
      effects: { kinds: [] },
      sound: { volume: 10 },
    });
    expect(out.moduleStyle).toEqual({
      ...DEFAULT_MODULE_STYLE, showName: false, nameStyle: { ...DEFAULT_MODULE_STYLE.nameStyle, color: '#123456' },
    });
    expect(out.effects).toEqual({ ...DEFAULT_EFFECTS, kinds: [] });
    expect(out.sound).toEqual({ ...DEFAULT_SOUND, volume: 10 });
  });

  it('字段类型不符时用默认值', () => {
    const out = normalizeSettings({ ...legacy, moduleStyle: { nameStyle: { fontSize: '40' }, columns: null }, effects: { kinds: 'confetti' } });
    expect(out.moduleStyle).toEqual(DEFAULT_MODULE_STYLE);
    expect(out.effects).toEqual(DEFAULT_EFFECTS);
  });

  it('输入为空或非对象时返回完整默认设置，不抛错', () => {
    for (const raw of [undefined, null, 'x', 42]) {
      const out = normalizeSettings(raw);
      expect(out).toEqual(initialSettings);
    }
  });
});
describe('persist merge', () => {
  const merge = useLotteryStore.persist.getOptions().merge!;

  it('持久化数据为空时保留当前状态，设置补全', () => {
    const current = s();
    const out = merge(undefined, current);
    expect(out.participants).toBe(current.participants);
    expect(out.settings).toEqual(current.settings);
    expect(typeof out.advanceRound).toBe('function');
  });

  it('持久化数据残缺时浅合并，并把设置补成完整结构', () => {
    const current = s();
    const out = merge({ winners: [], settings: { title: '新标题', moduleStyle: { showName: false } } }, current);
    expect(out.participants).toBe(current.participants);
    expect(out.settings.title).toBe('新标题');
    expect(out.settings.moduleStyle).toEqual({ ...DEFAULT_MODULE_STYLE, showName: false });
    expect(out.settings.sound).toEqual(DEFAULT_SOUND);
    expect(merge({ winners: [] }, current).settings).toEqual(current.settings);
  });
});

describe('persist migrate（v7 → v8）', () => {
  const migrate = useLotteryStore.persist.getOptions().migrate!;
  const PREVIOUS_DEFAULT_PRIZES = [
    { id: '1', name: '特等奖', count: 2 }, { id: '2', name: '一等奖', count: 6 }, { id: '3', name: '二等奖', count: 10 },
    { id: '4', name: '三等奖', count: 20 }, { id: '5', name: '四等奖', count: 30 }, { id: '6', name: '五等奖', count: 40 },
  ];
  const legacyPerson = (id: string, name: string) => ({ id, name, dept: '市场部', mustWinPrizeId: null, bannedPrizes: [], weight: 1 });
  const v7State = () => ({
    participants: [legacyPerson('a', '甲'), legacyPerson('b', '乙'), legacyPerson('c', '丙')],
    winners: [
      { ...legacyPerson('a', '甲'), prizeId: '1', roundId: 'r1', wonAt: 1 },
      { ...legacyPerson('b', '乙'), prizeId: '1', roundId: 'r1', wonAt: 1 },
      { ...legacyPerson('c', '丙'), prizeId: '2', roundId: 'r2', wonAt: 2 },
    ],
    prizes: PREVIOUS_DEFAULT_PRIZES.map((p) => ({ ...p })),
    currentPrizeId: '2',
    isRolling: true,
    roundWinners: [legacyPerson('c', '丙')],
    viewMode: 'lottery',
    settings: {
      title: '年会', password: 'pw', welcomeTitle: 'W', welcomeSubtitle: 'OLD', prizePageTitle: '奖项', logo: '',
      showDept: true, scrollMode: 'page', winnersPerPage: 12, backgroundImage: '', fontFamily: 'KaiTi, STKaiti, serif',
    },
  });
  it('上一版默认奖项换成新 7 档；补编号、计数器与新字段；删除旧滚动状态；设置补全', () => {
    const out = migrate(v7State(), 7) as StoreState;
    expect(out.prizes).toEqual(INITIAL_PRIZES);
    expect(out.participants.map((p) => [p.id, p.serial])).toEqual([['a', 1], ['b', 2], ['c', 3]]);
    expect(out.participantSerialCounter).toBe(3);
    expect(out.winners.map((w) => w.serial)).toEqual([1, 2, 3]);
    expect(out.prizeImages).toEqual([]);
    expect(out.imageSerialCounter).toBe(0);
    expect(out.currentRound).toBeNull();
    expect(out.roundCounter).toBe(2);
    expect(out).not.toHaveProperty('isRolling');
    expect(out).not.toHaveProperty('roundWinners');
    expect(out).toMatchObject({ currentPrizeId: '2', viewMode: 'lottery' });
    expect(out.settings).toMatchObject({
      title: '年会', password: 'pw', welcomeSubtitle: 'BONDING', logo: hermesLogo, showDept: true, fontFamily: 'KaiTi, STKaiti, serif',
    });
    expect(out.settings.moduleStyle).toEqual(DEFAULT_MODULE_STYLE);
    expect(out.settings.effects).toEqual(DEFAULT_EFFECTS);
    expect(out.settings.sound).toEqual(DEFAULT_SOUND);
  });

  it('用户改过的奖项保持不变', () => {
    const modified = [
      PREVIOUS_DEFAULT_PRIZES.map((p) => (p.id === '6' ? { ...p, count: 50 } : p)),
      PREVIOUS_DEFAULT_PRIZES.map((p) => (p.id === '1' ? { ...p, name: '超级大奖' } : p)),
      PREVIOUS_DEFAULT_PRIZES.map((p) => (p.id === '1' ? { ...p, description: 'iPhone' } : p)),
      [...PREVIOUS_DEFAULT_PRIZES, { id: 'x', name: '加码奖', count: 1 }],
      PREVIOUS_DEFAULT_PRIZES.slice(0, 5),
    ];
    for (const prizes of modified) {
      const out = migrate({ ...v7State(), prizes }, 7) as StoreState;
      expect(out.prizes).toEqual(prizes);
    }
  });

  it('已有部分编号时只给缺编号的人补号，计数器取最大值', () => {
    const state = v7State();
    const participants = [{ ...state.participants[0], serial: 5 }, state.participants[1], state.participants[2]];
    const out = migrate({ ...state, participants, participantSerialCounter: 7 }, 7) as StoreState;
    expect(out.participants.map((p) => p.serial)).toEqual([5, 8, 9]);
    expect(out.participantSerialCounter).toBe(9);
  });

  it('保留 v7 逻辑：无抽奖数据且为最早演示奖项时恢复内置名单（编号 1..N）与新默认奖项', () => {
    const legacy = {
      ...v7State(), participants: [], winners: [],
      prizes: [{ id: '1', name: '三等奖', count: 5 }, { id: '2', name: '二等奖', count: 3 }, { id: '3', name: '一等奖', count: 1 }],
    };
    const out = migrate(legacy, 6) as StoreState;
    expect(out.prizes).toEqual(INITIAL_PRIZES);
    expect(out.participants.map((p) => p.id)).toEqual(DEFAULT_PARTICIPANTS.map((p) => p.id));
    expect(out.participants.map((p) => p.serial)).toEqual(DEFAULT_PARTICIPANTS.map((_, i) => i + 1));
    expect(out.participantSerialCounter).toBe(DEFAULT_PARTICIPANTS.length);
    expect(out.roundCounter).toBe(0);
  });

  it('残缺的旧数据不抛错', () => {
    const out = migrate({ settings: { title: 'T' } }, 7) as StoreState;
    expect(out.winners).toEqual([]);
    expect(out.participants.map((p) => p.serial)).toEqual(DEFAULT_PARTICIPANTS.map((_, i) => i + 1));
    expect(out.settings.moduleStyle).toEqual(DEFAULT_MODULE_STYLE);
  });

  it('rehydrate 读取 v7 明文存储后得到完整 v8 状态', async () => {
    localStorage.setItem('lucky-draw-storage', JSON.stringify({ state: v7State(), version: 7 }));
    await useLotteryStore.persist.rehydrate();
    expect(s().prizes).toEqual(INITIAL_PRIZES);
    expect(s().participants.map((p) => p.serial)).toEqual([1, 2, 3]);
    expect(s().roundCounter).toBe(2);
    expect(s().currentRound).toBeNull();
    expect(s()).not.toHaveProperty('isRolling');
    expect(s().settings.moduleStyle).toEqual(DEFAULT_MODULE_STYLE);
    expect(typeof s().advanceRound).toBe('function');
  });
});
