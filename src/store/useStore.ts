import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import type {
  ActionResult, CurrentRound, EffectSettings, ModuleStylePatch, PageLayout, Participant, Prize, PrizeImage, Settings,
  SoundSettings, UploadedFont, Winner,
} from '@/lib/types';
import {
  DEFAULT_EFFECTS, DEFAULT_LOTTERY_LAYOUT, DEFAULT_MODULE_COUNT, DEFAULT_MODULE_STYLE, DEFAULT_PRIZE_LAYOUT,
  DEFAULT_SOUND, DEFAULT_WELCOME_LAYOUT, INITIAL_PRIZES,
} from '@/lib/defaults';
import {
  drawImages, drawNames, getAvailableImages, getDefaultImagePoolIds, getFrozenImageIds, getMustWinCandidates,
  getRemainingSlots, imagePoolShortage, moduleCountError, namePoolShortage, NO_PRIZE_ERROR, resolveImagePool,
  resolveNamePool, validateNameRollStart, validatePrizeRollStart, type RollStartInput,
} from '@/lib/draw-engine';
import { parseNameList } from '@/lib/name-import';
import bondingLogo from '@/assets/bonding-logo.svg';
import hermesLogo from '@/assets/hermes-logo.jpg';
import { DEFAULT_PARTICIPANTS } from '@/assets/default-participants';

type ViewMode = 'welcome' | 'lottery' | 'prize';

// 上一版（v7）的默认奖项：迁移时若未被改动则换成新的 7 档
const PREVIOUS_DEFAULT_PRIZES: Prize[] = [
  { id: '1', name: '特等奖', count: 2 }, { id: '2', name: '一等奖', count: 6 }, { id: '3', name: '二等奖', count: 10 },
  { id: '4', name: '三等奖', count: 20 }, { id: '5', name: '四等奖', count: 30 }, { id: '6', name: '五等奖', count: 40 },
];

const isLegacyDefaultPrizes = (prizes: Prize[]) => (
  prizes.length === 3
  && prizes[0]?.id === '1' && prizes[0]?.name === '三等奖' && prizes[0]?.count === 5
  && prizes[1]?.id === '2' && prizes[1]?.name === '二等奖' && prizes[1]?.count === 3
  && prizes[2]?.id === '3' && prizes[2]?.name === '一等奖' && prizes[2]?.count === 1
);

const isPreviousDefaultPrizes = (prizes: Prize[]) => (
  prizes.length === PREVIOUS_DEFAULT_PRIZES.length
  && prizes.every((prize, index) => {
    const original = PREVIOUS_DEFAULT_PRIZES[index];
    return prize.id === original.id && prize.name === original.name && prize.count === original.count
      && !prize.description && !prize.image;
  })
);

// 内置名单按顺序编号 start+1..start+N（默认 1..N）
const cloneDefaultParticipants = (start = 0): Participant[] => DEFAULT_PARTICIPANTS.map((participant, index) => ({
  ...participant,
  serial: start + index + 1,
  bannedPrizes: [...participant.bannedPrizes],
}));
const DEFAULT_SETTINGS: Settings = {
  title: '2027 年会大屏抽奖',
  password: 'appinn',
  welcomeTitle: '2027 NEW YEAR PARTY',
  welcomeSubtitle: 'BONDING',
  prizePageTitle: '奖项',
  logo: hermesLogo,
  showDept: false,
  backgroundImage: '',
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  moduleStyle: DEFAULT_MODULE_STYLE,
  effects: DEFAULT_EFFECTS,
  sound: DEFAULT_SOUND,
  welcomeLayout: DEFAULT_WELCOME_LAYOUT,
  prizeLayout: DEFAULT_PRIZE_LAYOUT,
  lotteryLayout: DEFAULT_LOTTERY_LAYOUT,
  fonts: [],
};

type AnyRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is AnyRecord => typeof value === 'object' && value !== null && !Array.isArray(value);

// 按默认值的字段逐个取值：缺失或类型不符时用默认值（只处理一层）
function withDefaults<T extends object>(defaults: T, raw: unknown): T {
  const source = isRecord(raw) ? raw : {};
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const value = source[key];
    const fallback = defaults[key];
    if (value !== undefined && value !== null && typeof value === typeof fallback
      && Array.isArray(value) === Array.isArray(fallback)) {
      result[key] = value as T[keyof T & string];
    }
  }
  return result;
}

const isUploadedFont = (value: unknown): value is UploadedFont => (
  isRecord(value) && typeof value.key === 'string' && typeof value.family === 'string' && typeof value.name === 'string'
);

// 页面排版：title / subtitle / decor 各自按字段补默认值
function normalizeLayout(defaults: PageLayout, raw: unknown): PageLayout {
  const layout = withDefaults(defaults, raw);
  return {
    ...layout,
    title: withDefaults(defaults.title, layout.title),
    subtitle: withDefaults(defaults.subtitle, layout.subtitle),
    decor: withDefaults(defaults.decor, layout.decor),
  };
}

// 把任意旧设置补成完整的 Settings（含 moduleStyle / effects / sound / 页面排版及其子字段）
export function normalizeSettings(raw: unknown): Settings {
  const source = isRecord(raw) ? raw : {};
  const moduleStyle = withDefaults(DEFAULT_MODULE_STYLE, source.moduleStyle);
  const effects = withDefaults(DEFAULT_EFFECTS, source.effects);
  return {
    ...withDefaults(DEFAULT_SETTINGS, source),
    moduleStyle: {
      ...moduleStyle,
      nameStyle: withDefaults(DEFAULT_MODULE_STYLE.nameStyle, moduleStyle.nameStyle),
      labelStyle: withDefaults(DEFAULT_MODULE_STYLE.labelStyle, moduleStyle.labelStyle),
    },
    effects: { ...effects, kinds: [...effects.kinds] },
    sound: withDefaults(DEFAULT_SOUND, source.sound),
    welcomeLayout: normalizeLayout(DEFAULT_WELCOME_LAYOUT, source.welcomeLayout),
    prizeLayout: normalizeLayout(DEFAULT_PRIZE_LAYOUT, source.prizeLayout),
    lotteryLayout: normalizeLayout(DEFAULT_LOTTERY_LAYOUT, source.lotteryLayout),
    fonts: Array.isArray(source.fonts) ? source.fonts.filter(isUploadedFont) : [],
  };
}
interface LotteryData {
  participants: Participant[];
  winners: Winner[];                  // 历史所有中奖记录（一条 = 一个模块的结果）
  prizes: Prize[];
  prizeImages: PrizeImage[];          // 图片池元数据（图片本体在 IndexedDB）
  participantSerialCounter: number;   // 最后一次发出的名字编号
  imageSerialCounter: number;         // 最后一次发出的图片编号
  roundCounter: number;               // 已完成轮次数
  currentPrizeId: string | null;
  currentRound: CurrentRound | null;
  viewMode: ViewMode;                 // prize: 奖项展示页
  settings: Settings;
}

interface LotteryState extends LotteryData {
  importParticipants: (text: string, includeControlledFields?: boolean, mode?: 'replace' | 'append') =>
    { success: boolean; count: number; duplicateNames: number; error?: string };
  addPrize: (prize: Omit<Prize, 'id'>) => void;
  updatePrize: (id: string, updates: Partial<Prize>) => void;
  removePrize: (id: string) => ActionResult;
  selectPrize: (id: string | null) => ActionResult;
  setViewMode: (mode: ViewMode) => void;

  // 轮次状态机
  setRoundConfig: (p: { moduleCount?: number; imagePoolIds?: string[] | null; namePoolIds?: string[] | null }) => ActionResult;
  startPrizeRoll: () => ActionResult;
  stopPrizeRoll: () => ActionResult;
  startNameRoll: () => ActionResult;
  stopNameRoll: () => ActionResult;
  advanceRound: () => ActionResult;   // 后台主按钮与空格键
  cancelRound: () => ActionResult;
  nextRound: () => ActionResult;

  resetWinners: () => void;           // 「重置清零」
  fullReset: () => void;              // 「清空数据库」
  restoreDefaultPrizes: () => void;
  setSettings: (settings: Partial<Settings>) => void;
  updateModuleStyle: (p: ModuleStylePatch) => void;
  updateEffects: (p: Partial<EffectSettings>) => void;
  updateSound: (p: Partial<SoundSettings>) => void;

  // 名单
  addParticipant: (p: Omit<Participant, 'id' | 'serial'>) => void;
  updateParticipant: (id: string, updates: Partial<Participant>) => void;
  removeParticipant: (id: string) => void;

  // 图片池
  addPrizeImages: (items: { id: string; label: string; group?: string }[]) => PrizeImage[];
  updatePrizeImage: (id: string, updates: { label?: string; group?: string }) => void;
  removePrizeImages: (ids: string[]) => { removed: string[]; blocked: string[] };
  clearPrizeImages: () => ActionResult;
}
const PHASE_ERROR = '当前阶段不能执行此操作';
const REPLACE_IMPORT_ERROR = '已有抽奖记录，覆盖导入会破坏去重，请先「重置清零」或改用追加导入';
const CLEAR_IMAGES_ERROR = '已有抽奖记录或本轮正在进行，无法清空图片池，请先「重置清零」';
const OK: ActionResult = { ok: true };
const fail = (reason: string): ActionResult => ({ ok: false, reason });

// 可切换 / 删除奖项：尚无轮次、未开始或已完成
const isRoundSettled = (round: CurrentRound | null) => !round || round.phase === 'idle' || round.phase === 'completed';
// 尚未开始抽取：覆盖导入、清空图片池只在此时允许
const isRoundIdle = (round: CurrentRound | null) => !round || round.phase === 'idle';

const findCurrentPrize = (state: LotteryData) => state.prizes.find((p) => p.id === state.currentPrizeId);

// 新建 idle 轮次（selectPrize / nextRound / 自动创建 / resetWinners 共用）
function createRound(state: LotteryData, prize: Prize, preferredCount = DEFAULT_MODULE_COUNT): CurrentRound {
  const remaining = getRemainingSlots(prize, state.winners);
  return {
    id: nanoid(),
    roundNo: state.roundCounter + 1,
    phase: 'idle',
    moduleCount: Math.max(1, Math.min(preferredCount, remaining)),
    imagePoolIds: getDefaultImagePoolIds(getAvailableImages(state.prizeImages, state.winners), prize.name),
    namePoolIds: null,
    resultImageIds: [],
    resultNameIds: [],
    drawMode: 'image-then-name',
  };
}

// 当前轮次；为 null 且有当前奖项时先建一个（由调用方在成功时写入）
function ensureRound(state: LotteryData): CurrentRound | null {
  if (state.currentRound) return state.currentRound;
  const prize = findCurrentPrize(state);
  return prize ? createRound(state, prize) : null;
}

// 本轮图片池仍为「自动」：null，或与（变更前状态的）默认池集合相等
function isAutoImagePool(state: LotteryData, round: CurrentRound, prize: Prize): boolean {
  if (round.imagePoolIds === null) return true;
  const defaults = getDefaultImagePoolIds(getAvailableImages(state.prizeImages, state.winners), prize.name);
  const picked = new Set(round.imagePoolIds);
  return defaults !== null && picked.size === defaults.length && defaults.every((id) => picked.has(id));
}

// 图片池变更后：idle 且仍为自动的本轮图片池按变更后的图片重算；否则返回 null 表示不重算
function refreshAutoImagePool(before: LotteryData, prizeImages: PrizeImage[]): CurrentRound | null {
  const round = before.currentRound;
  const prize = findCurrentPrize(before);
  if (round?.phase !== 'idle' || !prize || !isAutoImagePool(before, round, prize)) return null;
  return { ...round, imagePoolIds: getDefaultImagePoolIds(getAvailableImages(prizeImages, before.winners), prize.name) };
}

const rollInput = (state: LotteryData, round: CurrentRound): RollStartInput => ({
  prize: findCurrentPrize(state),
  winners: state.winners,
  prizeImages: state.prizeImages,
  participants: state.participants,
  round,
});

// 名字结果按下标与本轮图片配对，生成中奖记录（参与者与图片均为快照）
function buildWinners(state: LotteryData, round: CurrentRound, prize: Prize, nameIds: string[]): Winner[] {
  const people = new Map(state.participants.map((p) => [p.id, p]));
  const images = new Map(state.prizeImages.map((img) => [img.id, img]));
  const wonAt = Date.now();
  return nameIds.map((personId, index) => {
    const person = people.get(personId)!;
    const imageId = round.resultImageIds[index];
    const image = images.get(imageId);
    return {
      ...person,
      bannedPrizes: [...person.bannedPrizes],
      prizeId: prize.id,
      roundId: round.id,
      roundNo: round.roundNo,
      wonAt,
      imageId,
      imageSerial: image?.serial,
      imageLabel: image?.label,
    };
  });
}
const isSerial = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;
const toCounter = (value: unknown) => (isSerial(value) ? value : 0);
const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

// 迁移到 v9（v8→v9 只需补全 settings 的新字段，由 normalizeSettings 完成；currentRound 仍重置为 null）：先执行 v7 的默认数据修复，再补编号、轮次与图片池字段
function migratePersistedState(persisted: unknown): Partial<LotteryData> {
  const raw = isRecord(persisted) ? persisted : {};
  const winners = asArray<Winner>(raw.winners);
  let participants = asArray<Participant>(raw.participants);
  let prizes = asArray<Prize>(raw.prizes);

  // v7：旧演示奖项或空奖项恢复为默认奖项，保留已有真实配置
  const settings = isRecord(raw.settings) ? raw.settings : {};
  const persistedLogo = settings.logo;
  const fixedSettings = {
    ...settings,
    welcomeSubtitle: 'BONDING',
    logo: !persistedLogo || persistedLogo === bondingLogo ? hermesLogo : persistedLogo,
  };
  const hasNoDrawData = participants.length === 0 && winners.length === 0;
  const hasBundledParticipants = participants.length === DEFAULT_PARTICIPANTS.length
    && participants.every((participant) => participant.id.startsWith('default-'));
  if (hasNoDrawData && (isLegacyDefaultPrizes(prizes) || prizes.length === 0)) {
    participants = cloneDefaultParticipants();
    prizes = INITIAL_PRIZES;
  } else if (hasNoDrawData && (participants.length === 0 || hasBundledParticipants)) {
    participants = cloneDefaultParticipants();
  }

  // v8：未改动的上一版默认奖项换成新 7 档
  if (isPreviousDefaultPrizes(prizes)) prizes = INITIAL_PRIZES;
  // 缺编号的参与者按当前顺序补号，计数器从已发出的最大编号接续
  let counter = participants.reduce(
    (max, p) => (isSerial(p.serial) ? Math.max(max, p.serial) : max),
    toCounter(raw.participantSerialCounter),
  );
  participants = participants.map((p) => (isSerial(p.serial) ? p : { ...p, serial: ++counter }));
  // 旧中奖记录的编号快照取自名单（人已被删除的保持原样）
  const serialById = new Map(participants.map((p) => [p.id, p.serial]));
  const numberedWinners = winners.map((w) => (
    isSerial(w.serial) || !serialById.has(w.id) ? w : { ...w, serial: serialById.get(w.id)! }
  ));

  const rest: AnyRecord = { ...raw };
  delete rest.isRolling;
  delete rest.roundWinners;
  return {
    ...(rest as Partial<LotteryData>),
    participants,
    winners: numberedWinners,
    prizes,
    prizeImages: asArray<PrizeImage>(raw.prizeImages),
    participantSerialCounter: counter,
    imageSerialCounter: toCounter(raw.imageSerialCounter),
    roundCounter: new Set(winners.map((w) => w.roundId)).size,
    currentRound: null,
    settings: normalizeSettings(fixedSettings),
  };
}
// 兼容 Unicode 的 Base64 编码与解码函数（用于混淆 LocalStorage 敏感数据，防 F12 窥视）
const obfuscateData = (str: string): string => {
  try {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    }));
  } catch {
    return str;
  }
};

const deobfuscateData = (str: string): string => {
  try {
    return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  } catch {
    return str;
  }
};

export const STORAGE_QUOTA_ERROR = '存储空间不足，请减小 Logo 或背景图';

// 写入 localStorage：先写混淆串，失败再退回明文；两次都失败也不能抛出，
// 否则会从 zustand 的 set() 里冒出去，让内存状态与持久化状态不一致
export function writeStorageSafely(name: string, value: string): boolean {
  try {
    localStorage.setItem(name, obfuscateData(value));
    return true;
  } catch {
    try {
      localStorage.setItem(name, value);
      return true;
    } catch (error) {
      console.error('[lucky-draw] 持久化失败：', error);
      toast.error(STORAGE_QUOTA_ERROR, { id: 'storage-quota' });
      return false;
    }
  }
}

export const useLotteryStore = create<LotteryState>()(
  persist(
    (set, get) => ({
      participants: cloneDefaultParticipants(),
      participantSerialCounter: DEFAULT_PARTICIPANTS.length,
      winners: [],
      prizes: INITIAL_PRIZES,
      prizeImages: [],
      imageSerialCounter: 0,
      roundCounter: 0,
      currentPrizeId: '1',
      currentRound: null,
      viewMode: 'welcome',
      settings: normalizeSettings(DEFAULT_SETTINGS),

      importParticipants: (text, includeControlledFields = false, mode = 'replace') => {
        const state = get();
        if (mode === 'replace' && (state.winners.length > 0 || !isRoundIdle(state.currentRound))) {
          return { success: false, count: 0, duplicateNames: 0, error: REPLACE_IMPORT_ERROR };
        }
        const { rows, error } = parseNameList(text, includeControlledFields, state.prizes);
        if (error) return { success: false, count: 0, duplicateNames: 0, error };

        const kept = mode === 'append' ? state.participants : [];
        const seenNames = new Set(kept.map((p) => p.name));
        let duplicateNames = 0;
        for (const row of rows) {
          if (seenNames.has(row.name)) duplicateNames += 1;
          seenNames.add(row.name);
        }
        // 覆盖导入时旧名单已全部移除且无记录引用，编号从 1 重新开始
        const start = mode === 'append' ? state.participantSerialCounter : 0;
        const imported = rows.map((row, index) => ({ ...row, id: nanoid(), serial: start + index + 1 }));
        // 覆盖导入后旧名字 id 已不存在，本轮（此时只可能是 idle）名字池恢复为全部
        const round = mode === 'replace' && state.currentRound ? { ...state.currentRound, namePoolIds: null } : state.currentRound;
        set({ participants: [...kept, ...imported], participantSerialCounter: start + imported.length, currentRound: round });
        return { success: true, count: imported.length, duplicateNames };
      },

      addPrize: (prize) => set(state => ({
        prizes: [...state.prizes, { id: nanoid(), ...prize }]
      })),

      updatePrize: (id, updates) => set(state => ({
        prizes: state.prizes.map(p => p.id === id ? { ...p, ...updates } : p)
      })),

      removePrize: (id) => {
        const state = get();
        if (!isRoundSettled(state.currentRound)) return fail(PHASE_ERROR);
        const isCurrent = state.currentPrizeId === id;
        set({
          prizes: state.prizes.filter((p) => p.id !== id),
          currentPrizeId: isCurrent ? null : state.currentPrizeId,
          currentRound: isCurrent ? null : state.currentRound,
        });
        return OK;
      },
      selectPrize: (id) => {
        const state = get();
        if (!isRoundSettled(state.currentRound)) return fail(PHASE_ERROR);
        if (id === null) {
          set({ currentPrizeId: null, currentRound: null });
          return OK;
        }
        const prize = state.prizes.find((p) => p.id === id);
        if (!prize) return fail(NO_PRIZE_ERROR);
        // 每次选择（包括重选同一奖项）都新建 idle 轮次
        set({ currentPrizeId: id, currentRound: createRound(state, prize) });
        return OK;
      },

      setViewMode: (mode) => set({ viewMode: mode }),

      setRoundConfig: ({ moduleCount, imagePoolIds, namePoolIds }) => {
        const round = ensureRound(get());
        if (!round) return fail(NO_PRIZE_ERROR);
        if ((moduleCount !== undefined || imagePoolIds !== undefined) && round.phase !== 'idle') return fail(PHASE_ERROR);
        if (namePoolIds !== undefined && round.phase !== 'idle' && round.phase !== 'prizesRevealed') return fail(PHASE_ERROR);
        const countError = moduleCount === undefined ? null : moduleCountError(moduleCount);
        if (countError) return fail(countError);
        // 超过剩余名额允许保存，开始时再校验
        const next = { ...round };
        if (moduleCount !== undefined) next.moduleCount = moduleCount;
        if (imagePoolIds !== undefined) next.imagePoolIds = imagePoolIds ? [...imagePoolIds] : null;
        if (namePoolIds !== undefined) next.namePoolIds = namePoolIds ? [...namePoolIds] : null;
        set({ currentRound: next });
        return OK;
      },

      startPrizeRoll: () => {
        const state = get();
        const round = ensureRound(state);
        if (!round) return fail(NO_PRIZE_ERROR);
        if (round.phase !== 'idle') return fail(PHASE_ERROR);
        const reason = validatePrizeRollStart(rollInput(state, round));
        if (reason) return fail(reason);
        set({
          currentRound: { ...round, phase: 'rollingPrizes', resultImageIds: [], resultNameIds: [] },
          viewMode: 'lottery',
        });
        return OK;
      },
      stopPrizeRoll: () => {
        const state = get();
        const round = state.currentRound;
        if (round?.phase !== 'rollingPrizes') return fail(PHASE_ERROR);
        // 滚动期间图片可能被删除：停止时复查，不够则留在滚动阶段
        const shortage = imagePoolShortage(rollInput(state, round));
        if (shortage) return fail(shortage);
        const pool = resolveImagePool(state.prizeImages, state.winners, round.imagePoolIds);
        set({ currentRound: { ...round, phase: 'prizesRevealed', resultImageIds: drawImages(pool, round.moduleCount) } });
        return OK;
      },

      startNameRoll: () => {
        const state = get();
        const round = state.currentRound;
        if (!round) return fail(PHASE_ERROR);
        const reason = validateNameRollStart(rollInput(state, round));
        if (reason) return fail(reason);
        set({ currentRound: { ...round, phase: 'rollingNames', resultNameIds: [] } });
        return OK;
      },

      stopNameRoll: () => {
        const state = get();
        const round = state.currentRound;
        if (round?.phase !== 'rollingNames') return fail(PHASE_ERROR);
        const prize = findCurrentPrize(state);
        if (!prize) return fail(NO_PRIZE_ERROR);
        // 滚动期间名单可能被修改：停止时复查，不够则留在滚动阶段
        const shortage = namePoolShortage(prize, rollInput(state, round));
        if (shortage) return fail(shortage);
        const pool = resolveNamePool(state.participants, state.winners, prize.id, round.namePoolIds);
        const mustWin = getMustWinCandidates(state.participants, state.winners, prize.id);
        const resultNameIds = drawNames(pool, mustWin, round.moduleCount);
        set({
          winners: [...state.winners, ...buildWinners(state, round, prize, resultNameIds)],
          roundCounter: state.roundCounter + 1,
          currentRound: { ...round, phase: 'completed', resultNameIds },
        });
        return OK;
      },

      advanceRound: () => {
        const { currentRound, startPrizeRoll, stopPrizeRoll, startNameRoll, stopNameRoll, nextRound } = get();
        switch (currentRound?.phase ?? 'idle') {
          case 'idle': return startPrizeRoll();
          case 'rollingPrizes': return stopPrizeRoll();
          case 'prizesRevealed': return startNameRoll();
          case 'rollingNames': return stopNameRoll();
          case 'completed': return nextRound();
        }
      },
      cancelRound: () => {
        const round = get().currentRound;
        if (round?.phase === 'rollingPrizes' || round?.phase === 'prizesRevealed') {
          set({ currentRound: { ...round, phase: 'idle', resultImageIds: [], resultNameIds: [] } });
          return OK;
        }
        if (round?.phase === 'rollingNames') {
          set({ currentRound: { ...round, phase: 'prizesRevealed', resultNameIds: [] } });
          return OK;
        }
        return fail(PHASE_ERROR);
      },

      nextRound: () => {
        const state = get();
        const round = state.currentRound;
        if (round?.phase !== 'completed') return fail(PHASE_ERROR);
        const prize = findCurrentPrize(state);
        if (!prize) return fail(NO_PRIZE_ERROR);
        set({ currentRound: createRound(state, prize, round.moduleCount) });
        return OK;
      },

      resetWinners: () => {
        const state = get();
        const prize = findCurrentPrize(state);
        const cleared: LotteryData = { ...state, winners: [], roundCounter: 0 };
        set({ winners: [], roundCounter: 0, currentRound: prize ? createRound(cleared, prize) : null });
      },

      fullReset: () => set({
        participants: cloneDefaultParticipants(),
        participantSerialCounter: DEFAULT_PARTICIPANTS.length,
        winners: [],
        prizes: INITIAL_PRIZES,
        currentPrizeId: '1',
        currentRound: null,
        roundCounter: 0,
      }),

      restoreDefaultPrizes: () => set((state) => {
        // 有中奖记录时编号接续计数器，避免与记录快照撞号（R14：只增不减）
        const start = state.winners.length > 0 ? state.participantSerialCounter : 0;
        return {
          participants: cloneDefaultParticipants(start),
          participantSerialCounter: start + DEFAULT_PARTICIPANTS.length,
          prizes: INITIAL_PRIZES,
          currentPrizeId: '1',
          currentRound: null,
        };
      }),
      setSettings: (newSettings) => set(state => ({
        settings: { ...state.settings, ...newSettings, welcomeSubtitle: 'BONDING' },
      })),

      updateModuleStyle: (patch) => set((state) => {
        const current = state.settings.moduleStyle;
        const moduleStyle = {
          ...current,
          ...patch,
          nameStyle: { ...current.nameStyle, ...patch.nameStyle },
          labelStyle: { ...current.labelStyle, ...patch.labelStyle },
        };
        return { settings: { ...state.settings, moduleStyle } };
      }),

      updateEffects: (patch) => set((state) => ({
        settings: { ...state.settings, effects: { ...state.settings.effects, ...patch } },
      })),

      updateSound: (patch) => set((state) => ({
        settings: { ...state.settings, sound: { ...state.settings.sound, ...patch } },
      })),

      addParticipant: (p) => set((state) => {
        const serial = state.participantSerialCounter + 1;
        return { participants: [...state.participants, { ...p, id: nanoid(), serial }], participantSerialCounter: serial };
      }),

      updateParticipant: (id, updates) => set(state => ({
        participants: state.participants.map(p => p.id === id ? { ...p, ...updates } : p)
      })),

      removeParticipant: (id) => set(state => ({
        participants: state.participants.filter(p => p.id !== id)
      })),

      addPrizeImages: (items) => {
        const state = get();
        const createdAt = Date.now();
        const added: PrizeImage[] = items.map((item, index) => ({
          id: item.id, serial: state.imageSerialCounter + index + 1, label: item.label, group: item.group ?? '', createdAt,
        }));
        const prizeImages = [...state.prizeImages, ...added];
        const currentRound = refreshAutoImagePool(state, prizeImages) ?? state.currentRound;
        set({ prizeImages, imageSerialCounter: state.imageSerialCounter + added.length, currentRound });
        return added;
      },

      updatePrizeImage: (id, { label, group }) => set((state) => {
        const target = state.prizeImages.find((img) => img.id === id);
        if (!target) return {};
        const prizeImages = state.prizeImages.map((img) => (
          img.id === id ? { ...img, label: label ?? img.label, group: group ?? img.group } : img
        ));
        const refreshed = group !== undefined && group !== target.group ? refreshAutoImagePool(state, prizeImages) : null;
        return { prizeImages, currentRound: refreshed ?? state.currentRound };
      }),
      removePrizeImages: (ids) => {
        const state = get();
        const known = new Set(state.prizeImages.map((img) => img.id));
        const available = new Set(getAvailableImages(state.prizeImages, state.winners).map((img) => img.id));
        const frozen = new Set(getFrozenImageIds(state.currentRound));
        const removed: string[] = [];
        const blocked: string[] = [];
        for (const id of new Set(ids)) {
          if (!known.has(id)) continue;
          // 已被记录引用或本轮已定格的图片不可删（R12）
          if (available.has(id) && !frozen.has(id)) removed.push(id);
          else blocked.push(id);
        }
        if (removed.length > 0) {
          const gone = new Set(removed);
          const round = state.currentRound;
          const prizeImages = state.prizeImages.filter((img) => !gone.has(img.id));
          set({
            prizeImages,
            // 自动池重算；手动选择只剔除被删 id
            currentRound: refreshAutoImagePool(state, prizeImages) ?? (round?.imagePoolIds
              ? { ...round, imagePoolIds: round.imagePoolIds.filter((id) => !gone.has(id)) }
              : round),
          });
        }
        return { removed, blocked };
      },

      clearPrizeImages: () => {
        const state = get();
        if (state.winners.length > 0 || !isRoundIdle(state.currentRound)) return fail(CLEAR_IMAGES_ERROR);
        const round = state.currentRound;
        // 图片已全部移除，本轮图片池恢复为自动选择
        set({ prizeImages: [], imageSerialCounter: 0, currentRound: round && { ...round, imagePoolIds: null } });
        return OK;
      },
    }),
    {
      name: 'lucky-draw-storage',
      version: 9,
      migrate: (persistedState) => migratePersistedState(persistedState) as LotteryState,
      // 每次 rehydrate 都会调用：浅合并后把设置补成完整结构，防止旧数据缺字段
      merge: (persistedState, currentState) => {
        const persisted = (isRecord(persistedState) ? persistedState : {}) as Partial<LotteryData>;
        return { ...currentState, ...persisted, settings: normalizeSettings(persisted.settings ?? currentState.settings) };
      },
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const val = localStorage.getItem(name);
          if (!val) return null;
          try {
            // 平滑兼容历史明文 JSON 结构，避免升级丢失用户已有配置
            const trimmed = val.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              return val;
            }
            return deobfuscateData(val);
          } catch {
            return val;
          }
        },
        setItem: (name, value) => { writeStorageSafely(name, value); },
        removeItem: (name) => localStorage.removeItem(name),
      })),
    }
  )
);
