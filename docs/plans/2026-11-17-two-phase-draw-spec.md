# 两阶段奖品抽奖（图片池 + 名字池）设计说明（Spec）

> 本文是 AFK 多 agent 开发的约束性规格，所有任务以此为准。实现计划见同目录 `2026-11-17-two-phase-draw-plan.md`。
> 日期：2026-11-17。分支：`feat/two-phase-prize-draw`。

## 1. 用户需求要点（最高优先级）

奖项与人数：特等奖 2、一等奖 6、二等奖 10、三等奖 20、四等奖 30、五等奖 58、阳光普照奖 54（合计 180）。

大屏呈现：
- 每轮大屏显示若干空白模块，如 1、2、3、6、10（5×2，2 排每排 5 个）、12（4×3，3 排每排 4 个）。
- 第一次「开始」：模块随机滚动不同的奖品图片；「停止」后定格 N 张 = 本轮奖品。
- 第二次「开始」：图片不动，图片下方滚动名字；「停止」后定格 = 各奖品的中奖者。

后台与大屏：
- 模块可呈现图片，图片下方可呈现文字。模块数、图片、文字可自定义；图片下方是否呈现文字可选。
- 文字字体、大小、颜色可自定义；模块大小、颜色、透明度可自定义。图片和文字从后台的图片池、文字池中选择。
- 图片池：支持批量上传，每张图片自动独立编号（编号仅后台识别唯一性，不在大屏显示）。
- 名字池：支持批量导入名单，每个名字自动独立编号（同上，不在大屏显示）。
- 每轮从后台选好的图片池、名字池中自动抓取；每次抽奖可选择哪些图片和名字参与滚动。
- 同一轮抽中的图片、名字不可重复；已抽中的图片和名字在后续轮次不再出现（按唯一性自动判断）。
- 中奖特效可设置（撒花、星光、火箭、emoji）；音效可设置。
- 后台有抽奖记录，有重置清零按钮。

## 2. 规划裁定（需求未写明处的决定）

| # | 裁定 | 理由 / 若错的代价 |
|---|---|---|
| R1 | 「文字池」=「名字池」= 现有人员名单 `participants`。模块下方文字有两类：中奖人名字（阶段二出现，可开关）和图片说明 `label`（默认取文件名，可开关，默认关）。 | 需求中文字池/名字池混用；奖品名称显示在图片下也是常见诉求。默认关闭，不影响主流程。 |
| R2 | 唯一性按自动编号/内部 id 判断；同名不同人允许并存，导入时提示重名数量。 | 年会常见重名。 |
| R3 | "出现过的" = 定格抽中的结果；滚动中闪过的不算。 | 否则第一轮滚动后所有人都会被排除。 |
| R4 | 新两阶段流程替换旧"抽奖页"单阶段名单滚动；欢迎页、奖项页保留；旧的"多中奖者展示模式（平铺/滚动/翻页）"设置移除。 | 两套流程并存会让大屏与后台逻辑翻倍。旧代码可从 git 历史找回。 |
| R5 | 图片与自定义音频以 Blob 存 IndexedDB；元数据（编号、说明、分组）存 localStorage（zustand persist）。 | localStorage 约 5MB，放不下上百张图片。少数浏览器在 file:// 下 IndexedDB 不可用 → 后台显示警告，建议 Chrome/Edge 或 `pnpm preview`。 |
| R6 | 受控字段（必中/禁中/权重）继续作用于阶段二抽名字；抽出的名字顺序打乱后再与图片一一配对。 | 项目本身是受控抽奖系统；打乱避免必中者总落在第 1 个模块。 |
| R7 | 每轮必须选定奖项档位；本轮模块数 ≤ 该档剩余名额（人数 − 已抽）。选档位时模块数默认 = min(12, 剩余)。 | 记录需归属奖项、防超发。操作者可改档位人数。 |
| R8 | 模块样式/特效/音效设置即时生效（不需点保存），大屏 ≤0.5s 同步。 | 现场调样式需即时看到。 |
| R9 | 音效只在大屏窗口播放；大屏需点击一次解锁音频（浏览器自动播放策略），未解锁时显示提示。 | 后台与大屏同时出声会重叠。 |
| R10 | 不新增运行时依赖。不直接导入 .xlsx；支持 .csv/.txt 文件与从 Excel 复制粘贴（制表符分隔）。 | 离线单文件打包；npm 上 `xlsx` 包有已知漏洞。用户需另存 CSV 或复制粘贴。 |
| R11 | 每轮模块数上限 60；布局 1–12 用预设表，>12 自动计算。 | 用户例子：10=5×2、12=4×3。 |
| R12 | 已被记录引用或本轮已定格的图片不可删除；重置清零后可删。 | 保证记录可追溯。 |
| R13 | 「重置清零」= 清空抽奖记录与当前轮次（所有图片/名字恢复可抽），保留图片池、名字池、奖项与设置。原「清空数据库」保留。 | 需求"重置清零"针对抽奖结果。 |
| R14 | 编号格式：图片 `IMG-0001`，名字 `N-0001`；计数器只增不减，删除后编号不复用。 | 保证唯一。 |

## 3. 数据模型（`src/lib/types.ts` 最终形态）

```ts
export interface Participant {
  id: string;
  serial: number;               // 新增：后台唯一编号（N-0001），不在大屏显示
  name: string;
  dept: string;
  mustWinPrizeId: string | null;
  bannedPrizes: string[];
  weight: number;
}

export interface Winner extends Participant {   // 一条 = 一个模块的结果（名字 + 图片）
  prizeId: string;
  roundId: string;
  wonAt: number;
  roundNo?: number;             // 新增：第几轮
  imageId?: string;             // 新增：抽中的奖品图片 id
  imageSerial?: number;         // 新增：图片编号快照
  imageLabel?: string;          // 新增：图片说明快照
}

export interface PrizeImage {
  id: string;                   // nanoid，同时是 IndexedDB key
  serial: number;               // IMG-0001
  label: string;                // 图片说明，默认 = 文件名去扩展名
  group: string;                // 分组（如 "一等奖"），'' = 未分组
  createdAt: number;
}

export type RoundPhase = 'idle' | 'rollingPrizes' | 'prizesRevealed' | 'rollingNames' | 'completed';

export interface CurrentRound {
  id: string;                   // nanoid，写入 Winner.roundId
  roundNo: number;              // 从 1 开始
  moduleCount: number;          // 1..60
  phase: RoundPhase;
  imagePoolIds: string[] | null; // null = 自动选择（见 §5）
  namePoolIds: string[] | null;  // null = 自动选择
  resultImageIds: string[];     // 阶段一结果，长度 = moduleCount
  resultNameIds: string[];      // 阶段二结果，与 resultImageIds 下标一一对应
}

export interface TextStyle { fontFamily: string; fontSize: number; color: string; } // fontFamily '' = 跟随大屏字体
export interface ModuleStyle {
  showImageLabel: boolean;      // 图片下方显示图片说明
  showName: boolean;            // 图片下方显示名字
  nameStyle: TextStyle;
  labelStyle: TextStyle;
  moduleScale: number;          // 40..100，自动适配尺寸的百分比
  columns: number;              // 0 = 自动；>0 固定每排数量
  backgroundColor: string;      // '#rrggbb'
  backgroundOpacity: number;    // 0..100
}
export type EffectKind = 'confetti' | 'stars' | 'rockets' | 'emoji';
export interface EffectSettings { kinds: EffectKind[]; emojis: string; durationSec: number; onPrizeReveal: boolean; }
export type RollSoundKind = 'none' | 'tick' | 'countdown' | 'custom';
export type WinSoundKind = 'none' | 'win' | 'custom';
export interface SoundSettings {
  roll: RollSoundKind; win: WinSoundKind; volume: number;   // volume 0..100
  customRollKey: string; customRollName: string;            // IndexedDB key（带随机后缀）与原文件名
  customWinKey: string; customWinName: string;
}
// Settings 追加三个必填字段：moduleStyle: ModuleStyle; effects: EffectSettings; sound: SoundSettings;
```

默认值（导出为常量，放在 `src/lib/defaults.ts`）：

```ts
export const DEFAULT_MODULE_STYLE: ModuleStyle = {
  showImageLabel: false, showName: true,
  nameStyle:  { fontFamily: '', fontSize: 40, color: '#b94d24' },
  labelStyle: { fontFamily: '', fontSize: 22, color: '#a66b52' },
  moduleScale: 100, columns: 0, backgroundColor: '#ffffff', backgroundOpacity: 90,
};
export const DEFAULT_EFFECTS: EffectSettings = { kinds: ['confetti'], emojis: '🎉🧧✨', durationSec: 4, onPrizeReveal: false };
export const DEFAULT_SOUND: SoundSettings = { roll: 'tick', win: 'win', volume: 80, customRollKey: '', customRollName: '', customWinKey: '', customWinName: '' };
export const INITIAL_PRIZES: Prize[] = [
  { id: '1', name: '特等奖', count: 2 },  { id: '2', name: '一等奖', count: 6 },
  { id: '3', name: '二等奖', count: 10 }, { id: '4', name: '三等奖', count: 20 },
  { id: '5', name: '四等奖', count: 30 }, { id: '6', name: '五等奖', count: 58 },
  { id: '7', name: '阳光普照奖', count: 54 },
];
export const DEFAULT_MODULE_COUNT = 12;
export const MAX_MODULE_COUNT = 60;
```

## 4. 轮次状态机

```
            startPrizeRoll            stopPrizeRoll              startNameRoll            stopNameRoll
  idle ───────────────▶ rollingPrizes ───────────▶ prizesRevealed ───────────▶ rollingNames ───────────▶ completed
   ▲  ◀── cancelRound ──┘                ◀── cancelRound ──┘   ▲── cancelRound ──┘                       │
   └──────────────────────────────────── nextRound ─────────────────────────────────────────────────────┘
```

- `currentRound === null`：尚未为当前奖项准备轮次。`startPrizeRoll` / `advanceRound` 遇到 null 且 `currentPrizeId` 有效时先自动创建 idle 轮次再继续。
- 创建轮次（`selectPrize`、`nextRound`、自动创建、`resetWinners` 共用一个内部函数）：
  `{ id: nanoid(), roundNo: roundCounter + 1, phase: 'idle', moduleCount, imagePoolIds: getDefaultImagePoolIds(...), namePoolIds: null, resultImageIds: [], resultNameIds: [] }`。
  `moduleCount`：`nextRound` 且奖项不变时 = `min(上一轮 moduleCount, 剩余名额)`；其它情况 = `min(DEFAULT_MODULE_COUNT, 剩余名额)`；结果再 `Math.max(1, …)`。
- `roundCounter` 只在 `stopNameRoll` 成功时 +1（轮次号对已完成轮次连续）。
- `stopPrizeRoll`：从 `resolveImagePool` 中不重复抽 `moduleCount` 张 → `resultImageIds`，phase = prizesRevealed。
- `stopNameRoll`：`drawNames` 抽 `moduleCount` 人（受控逻辑见 R6）→ `resultNameIds`；为每个模块 i 追加一条 `Winner`（参与者快照 + `prizeId` + `roundId` + `roundNo` + `wonAt`(同一时间戳) + `imageId/imageSerial/imageLabel` 取自 `resultImageIds[i]`）；`roundCounter += 1`；phase = completed。
- `cancelRound`：rollingPrizes / prizesRevealed → idle（清空结果）；rollingNames → prizesRevealed；idle / completed / null → 失败。
- `advanceRound`（后台主按钮与空格键）：null/idle → startPrizeRoll；rollingPrizes → stopPrizeRoll；prizesRevealed → startNameRoll；rollingNames → stopNameRoll；completed → nextRound。
- `selectPrize(id)`：仅在 round 为 null / idle / completed 时生效（否则返回失败、不改状态）；`id` 为 null → `currentRound = null`。
- `setRoundConfig({ moduleCount?, imagePoolIds?, namePoolIds? })`：`moduleCount`、`imagePoolIds` 仅 idle 可改；`namePoolIds` 在 idle 与 prizesRevealed 可改；round 为 null 时先自动创建。`moduleCount` 非整数或不在 1..MAX_MODULE_COUNT → 失败。超过剩余名额允许保存（开始时校验报错）。
- `startPrizeRoll` 成功时同时 `viewMode = 'lottery'`。

所有返回结果的动作统一返回 `type ActionResult = { ok: true } | { ok: false; reason: string }`（定义在 `types.ts`）。

### 校验文案（必须逐字一致，测试按此断言）

`validatePrizeRollStart` 按以下顺序返回第一个命中的原因，全部通过返回 `null`：
1. 无当前奖项：`请先选择奖项`
2. 剩余名额为 0：`「${prize.name}」名额已抽完`
3. moduleCount 不在 1..60：`模块数需在 1–${MAX_MODULE_COUNT} 之间`
4. moduleCount > 剩余：`本轮模块数（${n}）超过「${prize.name}」剩余名额（${remaining}）`
5. 图片池不足：`可用奖品图片不足：需要 ${n} 张，当前可选 ${pool.length} 张`
6. 名字池不足：`可参与名字不足：需要 ${n} 人，当前可选 ${pool.length} 人`

`validateNameRollStart`：phase 必须为 prizesRevealed（否则 `请先抽取本轮奖品`），然后同第 6 条。
其它非法状态转换的 reason：`当前阶段不能执行此操作`。

## 5. 池与去重规则（`src/lib/draw-engine.ts`，纯函数，可注入 `rng: () => number = Math.random`）

- **已用图片** = `winners` 中所有 `imageId`。另外 phase 为 prizesRevealed / rollingNames 时，`currentRound.resultImageIds` 视为"本轮已定格"（不可删除）。
- **可用图片** `getAvailableImages(images, winners)` = 未在已用图片中的图片（保持 images 原顺序）。
- **默认图片池** `getDefaultImagePoolIds(available, prizeName)`：若存在 `group === prizeName` 的可用图片 → 返回这些 id；否则 `null`（= 全部可用）。
- **本轮图片池** `resolveImagePool(images, winners, imagePoolIds)` = 可用图片 ∩ 选择（null = 全部可用）。
- **合格名字** `getEligibleParticipants(participants, winners, prizeId)` = 未中过奖（按 id）且 `bannedPrizes` 不含 prizeId 且 (`mustWinPrizeId` 为 null 或 === prizeId)。
- **本轮名字池** `resolveNamePool(participants, winners, prizeId, namePoolIds)` = 合格名字 ∩ 选择（null = 全部合格）∪ 合格名字中 `mustWinPrizeId === prizeId` 的人（必中者不受选择限制）。
- **剩余名额** `getRemainingSlots(prize, winners)` = `max(0, prize.count − winners 中 prizeId 相同的条数)`。
- `drawImages(pool, count, rng)`：不重复随机抽 count 个 id。
- `drawNames(pool, mustWin, count, rng)`：调用现有 `drawWinners(pool, count, mustWin)`（必中优先 + 权重），再整体打乱顺序，返回 id 数组。
- `sampleDistinct(items, count, rng)`：不重复随机取 min(count, items.length) 个，供大屏滚动帧使用；`items.length < count` 时用有放回补足到 count（滚动画面不能出现空格）；items 为空返回 `[]`。
- `shuffle(items, rng)`：Fisher–Yates，返回新数组。

## 6. Store（`src/store/useStore.ts`）最终接口

移除：`isRolling`、`roundWinners`、`startRolling`、`stopRolling`、`Settings.scrollMode`、`Settings.winnersPerPage`。
新增/变更（其余现有字段与动作保持不变）：

```ts
interface LotteryState {
  participants: Participant[]; winners: Winner[]; prizes: Prize[];
  prizeImages: PrizeImage[];
  participantSerialCounter: number;  // 最后一次发出的名字编号
  imageSerialCounter: number;        // 最后一次发出的图片编号
  roundCounter: number;              // 已完成轮次数
  currentPrizeId: string | null;
  currentRound: CurrentRound | null;
  viewMode: 'welcome' | 'lottery' | 'prize';
  settings: Settings;

  importParticipants(text: string, includeControlledFields?: boolean, mode?: 'replace' | 'append'):
    { success: boolean; count: number; duplicateNames: number; error?: string };
  addParticipant(p: Omit<Participant, 'id' | 'serial'>): void;   // 自动发编号
  addPrizeImages(items: { id: string; label: string; group?: string }[]): PrizeImage[]; // 发编号 + createdAt
  updatePrizeImage(id: string, updates: { label?: string; group?: string }): void;
  removePrizeImages(ids: string[]): { removed: string[]; blocked: string[] }; // 已用/本轮已定格 → blocked；同时从 currentRound.imagePoolIds 中移除
  clearPrizeImages(): ActionResult;   // 仅 winners 为空且 round 为 null/idle 时；清空并 imageSerialCounter = 0
  updateModuleStyle(p: Partial<ModuleStyle>): void;  // 嵌套 TextStyle 也是浅合并：nameStyle/labelStyle 传 Partial<TextStyle>
  updateEffects(p: Partial<EffectSettings>): void;
  updateSound(p: Partial<SoundSettings>): void;
  selectPrize(id: string | null): ActionResult;
  setRoundConfig(p: { moduleCount?: number; imagePoolIds?: string[] | null; namePoolIds?: string[] | null }): ActionResult;
  startPrizeRoll(): ActionResult; stopPrizeRoll(): ActionResult;
  startNameRoll(): ActionResult;  stopNameRoll(): ActionResult;
  advanceRound(): ActionResult;   cancelRound(): ActionResult;  nextRound(): ActionResult;
  resetWinners(): void;   // 「重置清零」：winners=[]，roundCounter=0，currentRound=当前奖项的新 idle 轮（无奖项则 null）
}
```

- 编号：`addParticipant` / 导入 / `addPrizeImages` 均从计数器 +1 发号。`formatSerial(prefix, n)` → `IMG-0001` / `N-0001`（≥10000 时自然变长），放在 `src/lib/serial.ts`。
- 导入：`mode` 默认 `'replace'`。`replace` 在 winners 非空或 round 不在 null/idle 时失败，error = `已有抽奖记录，覆盖导入会破坏去重，请先「重置清零」或改用追加导入`；`replace` 成功时编号从 1 重新开始（旧名单已全部移除且无记录引用）。`append` 接在现有名单后继续发号。`duplicateNames` = 导入行中姓名与（追加时的现有名单 + 本批更早行）重名的行数。解析见 §8.4。
- `fullReset`（清空数据库）：在现有行为基础上同时 `currentRound = null`、`roundCounter = 0`，名单恢复为内置默认名单并重新编号 1..N；**不**清空图片池。
- 持久化：`version: 8`。`migrate` 在保留现有 v7 逻辑后：给缺 `serial` 的参与者按当前顺序补号并设置计数器；若奖项恰为上一版默认（ids '1'..'6'，特等奖2/一等奖6/二等奖10/三等奖20/四等奖30/五等奖40）则替换为新 `INITIAL_PRIZES`；补 `prizeImages: []`、`imageSerialCounter: 0`、`currentRound: null`、`roundCounter` = winners 中不同 roundId 的个数；删除 `isRolling`、`roundWinners`。另外提供 `merge`，每次 rehydrate 都用 `normalizeSettings()` 把缺失的 `moduleStyle/effects/sound` 及其子字段补成默认值（防止旧数据浅合并丢字段）。
- `cloneDefaultParticipants()` 为内置名单按顺序补 `serial`。`src/assets/default-participants.ts`（未纳入 git 的人员名单）只允许改一处类型标注为 `Omit<Participant, 'serial'>[]`，数据不动。

## 7. 大屏（Display）

- 欢迎页、奖项页保持现状。"抽奖页"（`viewMode === 'lottery'`）替换为新的 `DrawStage`。
- 布局：顶部标题区（`settings.title` 小字 + 当前奖项名大字 + 副标题 `第 ${roundNo} 轮 · 本轮 ${moduleCount} 份` + 阶段提示），其余空间为模块网格；最后一排居中。
- 阶段提示文案：idle `准备抽取奖品`；rollingPrizes `奖品抽取中…`；prizesRevealed `本轮奖品已揭晓`；rollingNames `幸运儿抽取中…`；completed `恭喜以下获奖者`；奖项名额已抽完时 `该奖项已全部抽完`。
- 列数 `getGridColumns(n, override)`：override > 0 时用 override（不超过 n）；否则 n ≤ 12 查表 `[1,2,3,4,5,3,4,4,5,5,4,4]`（下标 n−1；即 6=3×2、10=5×2、12=4×3），n > 12 用 `ceil(sqrt(n × 1.6))`。
- 模块尺寸 `computeModuleLayout`（`src/lib/grid-layout.ts`，纯函数）。每个格子里放一张"卡片"：方形图片区 + 下方文字区。算法（每一步的结果先 `Math.floor` 再用于下一步）：
  1. `columns = getGridColumns(count, columnsOverride)`，`rows = ceil(count / columns)`。
  2. `cellWidth = (W − gap×(columns−1)) / columns`，`cellHeight = (H − gap×(rows−1)) / rows`。
  3. `nameFontSize = showName ? min(请求字号, cellHeight×0.2, cellWidth×0.16) : 0`；`labelFontSize = showLabel ? min(请求字号, cellHeight×0.14, cellWidth×0.12) : 0`。
  4. `textHeight = nameFontSize×1.5 + labelFontSize×1.5`（未显示的项为 0）。
  5. `padding = clamp(min(cellWidth, cellHeight)×0.05, 4, 16)`。
  6. `moduleSize = min(cellWidth − 2×padding, cellHeight − 2×padding − textHeight) × scale`，再 `max(40, …)`。
  7. `cardWidth = min(cellWidth, max(moduleSize + 2×padding, moduleSize×1.4))`；`cardHeight = moduleSize + 2×padding + textHeight`。
  字号不随 scale 缩小（用户设的字号优先，只受格子上限约束）。
- 文字显示：名字和图片说明都单行、不换行、不省略；超出卡片内宽时由 `PrizeModule` 测量后按比例缩小字号以完整显示，最小 10px。
- 模块外观：背景 = `backgroundColor` + `backgroundOpacity` 合成 rgba；圆角；细边框（主题橙色低透明度）；图片 `object-contain`。空白模块显示淡色 "?"（或礼物图标）。名字区在阶段二开始前留空（占位不塌陷）。文字顺序：图片 → 图片说明 → 名字。
- 动画：沿用现有加速（1s，2→12 次/秒）/减速（1.5s）节奏，抽成 `useRollingTicker(active, onTick)` hook，返回 `animating`（减速期间仍为 true）。rollingPrizes 每帧每个模块显示 `sampleDistinct(图片池, n)` 的不同图片；rollingNames 图片固定为 `resultImageIds`，名字区每帧显示 `sampleDistinct(名字池, n)`。停止后减速结束才定格显示结果，定格时模块有一次缩放弹跳动画。
- 定格结果来源：图片 = `resultImageIds`；名字 = 本轮 `winners`（按 roundId 过滤，保持顺序）的 `name` 快照。
- 特效与音效只在"亲眼看到状态转换"时触发（大屏打开时已处于 prizesRevealed / completed 则直接显示结果，不放特效）：名字定格 → 特效 + 中奖音效；奖品定格 → 仅当 `effects.onPrizeReveal` 为 true 时特效 + 中奖音效。滚动阶段播放滚动音效（tick 模式每帧一声）。
- 音频解锁：音效未全为 none 且未解锁时，左下角显示 `🔈 点击任意位置启用音效`，点击页面任意处解锁后消失。
- 重渲染安全：大屏每 500ms rehydrate 一次，所有 effect 依赖必须是原始值（round.id、phase、`ids.join(',')`），不能依赖数组/对象引用，否则动画会被重置。
- **样式陷阱**：`src/index.css` 用 `!important` 覆盖了 `.hermes-display-board` 下的 `text-white`、`text-yellow-*`、`bg-white/5`、`bg-black/60`、`bg-zinc-950/65`、`border-white/10` 等类。新大屏组件的可配置颜色一律用 inline style，且不得使用这些被覆盖的类名。

## 8. 后台（Admin）

新组件放 `src/components/admin/`，`AdminPage.tsx` 只负责组装。Tabs 最终为：`人员名单管理`、`批量导入`、`图片池`、`大屏样式与特效`、`中奖记录`、`系统设置`。

### 8.1 现场控制（`LiveControlPanel.tsx`）
- 保留"大屏场景"三按钮。
- 奖项按钮显示 `名称 已抽/总数`（如 `一等奖 2/6`），抽完的加"已抽完"标记；非 idle/completed/null 阶段禁用切换。保留双击编辑、悬停 × 删除、+ 添加。
- 本轮配置（仅 idle 可改）：模块数输入框 + 快捷按钮 `1 2 3 6 10 12` + `剩余全部`（= min(剩余, 60)），旁边显示布局 `4×3`（用 `getGridColumns`，考虑 moduleStyle.columns）。
- 图片池摘要：`自动：全部可用 N 张` / `自动：分组「一等奖」N 张` / `已选 X 张`，按钮打开 `ImagePoolPicker`（idle 可用）。名字池摘要同理，按钮打开 `NamePoolPicker`（idle、prizesRevealed 可用）。
- 主按钮文案随阶段：idle `开始抽奖品`；rollingPrizes `停止 · 定格奖品`；prizesRevealed `开始抽名字`；rollingNames `停止 · 定格名字`；completed `下一轮`。点击 = `advanceRound()`，失败 `toast.error(reason)`。空格键同效（焦点在 input/textarea 时不触发）。旁边 `取消本轮`（按 §4 可用时显示）。
- 开始前把 `validatePrizeRollStart` 的原因显示在按钮下方（红色小字），主按钮不禁用（点击会 toast 同一原因）。
- 右侧卡片"本轮结果"：按模块序号列出图片缩略图 + `IMG-编号` + 说明，名字定格后加名字 + `N-编号`。受控模式下必中者标"内定"。
- 头部 Badge：显示当前阶段文案。

### 8.2 选择器对话框
- `ImagePoolPicker`：只列可用图片（缩略图、编号、说明、分组），可按分组筛选、按说明/编号搜索；`全选（当前筛选）`、`清空选择`、`恢复自动`；底部显示已选数；确定 → `setRoundConfig({ imagePoolIds })`（全不选视同 `[]`，开始时会报图片不足）。
- `NamePoolPicker`：只列合格名字（姓名、编号、部门），按部门筛选、按姓名/编号搜索；按钮与行为同上 → `namePoolIds`。名单可能上千，列表用简单分页或限制渲染（每页 200）。

### 8.3 图片池（`ImagePoolTab.tsx`）
- 批量上传：`<input type="file" multiple accept="image/*">` + 拖拽区域；可先填"上传到分组"（带 datalist：奖项名 + 已有分组）。逐张处理：>20MB 跳过并计数；`prepareImageBlob` 压缩；`putMedia(id, blob)`；全部完成后一次 `addPrizeImages`。完成 toast `已导入 N 张图片`（有跳过/失败时附带数量）。
- 网格卡片：缩略图、`IMG-编号`、说明（可编辑，失焦保存）、分组（可编辑）、状态 Badge：`可用` / `已抽中 · 奖项名 · 第N轮` / `本轮已定格`；删除按钮（已用/已定格禁用）。
- 顶部统计：总数 / 可用 / 已抽中；按分组、状态筛选；多选后可"批量设分组"、"批量删除"（被阻止的提示数量）。`清空图片池`按钮（按 `clearPrizeImages` 规则，需 confirm）。删除成功后调用 `deleteMedia(removed)`。
- IndexedDB 不可用时整页顶部显示警告：`当前浏览器环境无法使用本地图片库（IndexedDB）。请使用 Chrome / Edge 打开，或通过 pnpm preview 以 http 方式访问。`

### 8.4 名单（现有两个 Tab 的增量）
- 人员表加 `编号` 列（`N-0001`）与 `状态` 列（`已中奖 · 奖项名` / `可抽`）；搜索同时匹配编号。
- 批量导入：增加"选择文件"（`.csv,.txt,.tsv`），读成文本填入文本框（用户可再编辑），`decodeTextFile`：去 BOM，先按 UTF-8（fatal）解码，失败再按 GBK。增加导入方式单选 `覆盖现有名单` / `追加到现有名单`（有记录时自动选追加且覆盖不可选）。说明文字：`支持：每行一个姓名；或 姓名,部门；或带表头的 CSV；也可直接从 Excel 复制粘贴（.xlsx 请先另存为 CSV）`。成功 toast：`成功导入 N 人`，有重名追加 `（其中 M 个重名，已按不同人处理）`。
- 解析 `parseNameList(text, includeControlled, prizes)`（`src/lib/name-import.ts`，纯函数）：Papa 自动识别分隔符（逗号/制表符等），`header: false`；首行任一单元格（trim、小写）属于 `姓名 / name / 名字` → 表头模式，沿用现有列名别名（姓名/name/名字、部门/dept、必中奖项(奖项名称)/必中奖项/mustWinPrize、禁止奖项/bannedPrizes、权重(1-10)/weight，受控字段仅在 includeControlled 时读取）；否则无表头：第 1 列姓名、第 2 列部门。姓名 trim 后为空的行跳过。返回 `{ rows, error? }`，rows 为 `Omit<Participant, 'id' | 'serial'>[]`；0 行时 error = `未识别到任何姓名`。

### 8.5 大屏样式与特效（`DisplayStyleTab.tsx`，修改即时生效，无保存按钮）
- 显示：`图片下方显示名字`、`图片下方显示图片说明` 两个开关。
- 名字文字 / 说明文字：字体（`跟随大屏字体` + 现有 4 个字体预设，预设抽成 `FONT_PRESETS` 常量供系统设置复用）、字号滑块 12–120px、颜色 `<input type="color">`。
- 模块：大小 40–100%、每排数量（自动 / 1–12）、背景颜色、背景透明度 0–100%。
- 右侧静态预览：用与大屏同一个 `PrizeModule` 组件渲染一个示例模块。
- 特效：四个可多选的切换按钮 `撒花 / 星光 / 火箭 / Emoji`（可全不选 = 无特效）、Emoji 文本框（Emoji 选中时显示）、时长 1–10 秒、`定格奖品时也播放特效与音效` 开关、`预览特效` 按钮（在后台窗口播放）。
- 音效：滚动音效 `无 / 滴答声 / 倒计时音乐 / 自定义`；中奖音效 `无 / 欢呼 / 自定义`；音量 0–100；选"自定义"时显示上传（`audio/*`，≤10MB，存 IndexedDB，key 带随机后缀以便大屏感知更换）与当前文件名；每项旁 `试听`。

### 8.6 中奖记录与重置
- 表格列：`轮次`、`奖项`、`奖品图片`（缩略图 + `IMG-编号` + 说明；旧记录无图片显示 `-`）、`姓名`、`编号`、`部门`、`时间`。按轮次倒序，同轮保持模块顺序。顶部显示各奖项进度（`一等奖 6/6` 等）。
- 按钮：`导出图片`（保留现有）、`重置清零`（confirm 文案：`将清空全部 ${n} 条抽奖记录和当前轮次，所有图片和名字恢复为可抽状态。图片池、名单、奖项与设置会保留。此操作不可撤销，确定继续？`）。
- 系统设置 Tab 删除"大屏多中奖者展示模式"与"每页最多显示人数"两块。

## 9. 媒体、特效、音效模块接口

### 9.1 `src/lib/media-store.ts`（IndexedDB，库名 `lucky-draw-media`，对象仓库 `blobs`，version 1）
```ts
export function isMediaStoreAvailable(): Promise<boolean>;
export function putMedia(key: string, blob: Blob): Promise<void>;
export function getMedia(key: string): Promise<Blob | undefined>;
export function deleteMedia(keys: string[]): Promise<void>;     // 同时 revoke 已缓存的 object URL
export function getMediaUrl(key: string): Promise<string | null>; // 模块级 Map 缓存 object URL；缺失返回 null
```
数据库连接惰性打开并复用；所有失败以 rejected Promise 或 null 体现，不抛同步异常。

### 9.2 `src/hooks/useMediaUrls.ts`
`useMediaUrls(keys: string[]): Record<string, string>` —— 依赖 `keys.join('|')`，并发加载缺失 URL，组件卸载后不再 setState。`preloadImages(urls: string[]): Promise<void>`（`new Image()` + `decode()`，失败忽略）放在同文件导出。

### 9.3 `src/lib/image-processing.ts`
- `fitWithin(width, height, maxSide)` → `{ width, height }`（等比，已在范围内则原样，结果取整且 ≥1）。
- `labelFromFileName(name)`：去扩展名、trim。
- `prepareImageBlob(file, maxSide = 1024)`：SVG、GIF 原样返回；其余 `createImageBitmap` → canvas 缩放 → `toBlob('image/webp', 0.88)`；结果比原文件大或失败时返回原文件。
- `MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024`。

### 9.4 `src/lib/effects.ts`
`playCelebration(effects: EffectSettings): () => void`，返回停止函数。全部基于已安装的 `canvas-confetti`（`disableForReducedMotion: true`），持续 `durationSec`：
- `confetti`：左右两侧礼炮（同现有实现）。
- `stars`：`shapes: ['star']`，金色系，从屏幕上半部随机点爆开。
- `emoji`：`confetti.shapeFromText` 生成形状，从顶部飘落；`splitEmojis(text)` 用 `Intl.Segmenter` 按字素拆分、去空白、最多 8 个（纯函数，需测试）；为空时回退 `🎉`。
- `rockets`：每 ~400ms 在底部随机 x 创建一个 🚀 DOM 元素（`position:fixed`，`pointer-events:none`，z-index 高于大屏内容），CSS transform 向上飞到屏幕 15%–45% 高度（约 900ms），到达后移除并在该点 `confetti` 360° 爆开；`prefers-reduced-motion` 时跳过火箭。
停止函数清掉所有定时器与残留 DOM，并调用 `confetti.reset()`。

### 9.5 `src/lib/sound.ts`
单例 `soundEngine`：
- `unlock(): Promise<void>`（创建/resume AudioContext）、`isUnlocked(): boolean`。
- `startRoll(sound: SoundSettings)`：countdown → 循环播放 `src/assets/countdown.mp3`；custom → 循环播放 `getMediaUrl(customRollKey)`；tick/none → 不循环。
- `tick(sound)`：roll === 'tick' 时用 WebAudio 合成一声约 30ms 的短促"嗒"（方波/正弦 + 指数衰减），音量随 volume。
- `stopRoll()`；`playWin(sound)`：win → `src/assets/win.mp3`；custom → `customWinKey`；none 不响。`stopAll()`。
- 音量 `volume / 100`。播放失败（未解锁、文件缺失）静默忽略，不抛错。

## 10. 全局约束（每个任务都必须满足）

- 技术栈不变：React 19 + TS + Tailwind 4 + Zustand + Vite 单文件打包；import 用 `@/` 别名；业务逻辑放 `src/lib`，hooks 放 `src/hooks`，类型放 `src/lib/types.ts`，UI 组件从 `@/components/ui` 引入。
- 不新增任何 npm 依赖（运行时或开发时）。
- 界面文案为简体中文；代码注释中文、简洁。
- 编号（`IMG-xxxx` / `N-xxxx`）只在后台出现，大屏任何位置都不得渲染编号。
- 每个任务结束时：`pnpm test` 全绿、`npx tsc -b` 无错误、`pnpm build` 成功；新增文件 `npx eslint <文件>` 零错误；不得给已有文件引入新的 lint 错误类别（已有 36 个历史错误不要求修）。
- 纯逻辑（draw-engine、grid-layout、serial、name-import、image-processing 的纯函数、effects 的 splitEmojis、store 动作）用 Vitest 写单元测试，先写测试（TDD）。测试运行在 node 环境，`src/test/setup.ts` 提供内存版 localStorage/sessionStorage。
- 不修改 `src/components/ui/` 下的 shadcn 组件。
- 提交信息用中文 Conventional Commits，末尾附 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。绝不 `git add` `src/assets/default-participants.ts` 与 `~$*.xlsx`（已在 .git/info/exclude 中排除；提交时按文件名 `git add <路径>`，禁止 `git add -f`）。

---

## 附记（2026-11-17）：排版 / 字体 / 抽奖模式解耦

本规格实现后的后续迭代见 `docs/superpowers/specs/2026-11-17-layout-fonts-decouple-design.md`：每页排版（标题/副标题样式、纵向位置、装饰图）、自定义字体、每轮抽奖模式（先奖品后名字 / 只抽奖品 / 只抽名字）、模块外形与说明位置，以及 B1–B5 缺陷修复。

该迭代对本规格的影响：`currentRound` 新增 `drawMode`，`advanceRound` 按模式分支（只抽奖品：`rollingPrizes → completed`；只抽名字：`idle → rollingNames → completed`）；持久化版本 8 → 9。本文档上文其余内容仍然有效，不在此改写。
