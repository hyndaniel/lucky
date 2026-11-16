# 两阶段奖品抽奖 — 实现计划

Spec：`docs/plans/2026-11-17-two-phase-draw-spec.md`（约束性；本计划与 spec 冲突时以 spec 为准）。
分支：`feat/two-phase-prize-draw`。每个任务都要先读 spec 中列出的章节。

## Global Constraints

见 spec §10（逐条适用于每个任务）。要点重复如下：
- 不新增 npm 依赖；`@/` 别名；逻辑在 `src/lib`、hooks 在 `src/hooks`、类型在 `src/lib/types.ts`；不改 `src/components/ui/`。
- 每个任务结束：`pnpm test` 全绿、`npx tsc -b` 无错、`pnpm build` 成功；新文件 eslint 零错误。
- 编号（`IMG-xxxx`/`N-xxxx`）绝不出现在大屏。
- 文案与校验 reason 逐字使用 spec 中给出的中文。
- 提交：中文 Conventional Commits + `Co-Authored-By: Claude Code <noreply@anthropic.com>`；按路径 `git add`，绝不提交 `src/assets/default-participants.ts` 与 `~$*.xlsx`。

---

## Task 1: 类型、默认值、纯逻辑模块与测试基建

读 spec：§2、§3、§4（校验文案）、§5、§7（列数与尺寸算法）、§8.4（parseNameList / decodeTextFile）、§10。

**文件**
- 修改 `package.json`：scripts 加 `"test": "vitest run"`。
- 新建 `vitest.config.ts`：`mergeConfig(viteConfig, defineConfig({ test: { environment: 'node', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.ts'] } }))`（`vitest/config`）。确认 `pnpm build` 不受影响。
- 新建 `src/test/setup.ts`：当 `globalThis.localStorage` / `sessionStorage` 不可用时，挂上基于 Map 的内存实现（getItem/setItem/removeItem/clear/key/length）。
- 修改 `src/lib/types.ts`：新增 spec §3 中的 `PrizeImage`、`RoundPhase`、`CurrentRound`、`TextStyle`、`ModuleStyle`、`EffectKind`、`EffectSettings`、`RollSoundKind`、`WinSoundKind`、`SoundSettings`、`ActionResult`；`Winner` 增加 4 个可选字段。**本任务不改** `Participant`（serial）与 `Settings`（新增字段），留给 Task 2，以保持编译通过。
- 新建 `src/lib/defaults.ts`：spec §3 的全部常量 + `FONT_PRESETS`（从 `AdminPage.tsx` 现有 4 个字体 SelectItem 抄出 `{ label, value }[]`；本任务不改 AdminPage）。
- 新建 `src/lib/serial.ts`：`formatSerial(prefix: 'IMG' | 'N', n: number): string`，4 位补零。
- 新建 `src/lib/draw-engine.ts`：spec §5 全部函数 + `validatePrizeRollStart(input)`、`validateNameRollStart(input)`（入参为普通对象：`{ prize: Prize | undefined; winners; prizeImages; participants; round: CurrentRound }`，返回 `string | null`，文案见 spec §4）。复用 `src/lib/lottery-logic.ts` 的 `drawWinners`，不改它。
- 新建 `src/lib/grid-layout.ts`：`getGridColumns(count, override = 0)`、`computeModuleLayout(input)`（接口见下）。
- 新建 `src/lib/name-import.ts`：`parseNameList`、`decodeTextFile(buf: ArrayBuffer): string`。

```ts
export interface ModuleLayoutInput {
  containerWidth: number; containerHeight: number; count: number;
  columns: number;          // 每排数量覆盖值，0 = 自动（内部调用 getGridColumns）
  gap: number;
  scale: number;            // 0.4..1（= moduleScale / 100）
  nameFontSize: number; labelFontSize: number; showName: boolean; showLabel: boolean;
}
export interface ModuleLayout {
  columns: number; rows: number; cellWidth: number; cellHeight: number;
  moduleSize: number;       // 方形图片区边长
  cardWidth: number; cardHeight: number; padding: number;
  nameFontSize: number; labelFontSize: number; textHeight: number;
}
```
算法逐步照抄 spec §7「模块尺寸」。

**测试（先写，确认失败，再实现）** — 至少覆盖：
- `serial.test.ts`：`formatSerial('IMG', 1) === 'IMG-0001'`，`formatSerial('N', 12345) === 'N-12345'`。
- `draw-engine.test.ts`：已用图片排除；默认图片池分组命中/不命中返回 null；`resolveImagePool` 交集；合格名字排除已中奖/禁中/内定其他奖项；必中者不受 namePoolIds 限制；剩余名额（含超发时为 0）；`drawImages` 无重复且只来自池；`drawNames` 必中者必在结果中、结果无重复、长度 = count；`sampleDistinct` 不足时补足到 count、空池返回 `[]`；两个 validate 函数每条 reason 至少一个用例（逐字断言），按顺序优先级（例如名额已抽完优先于图片不足）。
- `grid-layout.test.ts`：`getGridColumns` 对 1..12 返回表 `[1,2,3,4,5,3,4,4,5,5,4,4]`；13→5、20→6、58→10、60→10；override=3 时 count 12→3、override 大于 count 时取 count；`computeModuleLayout` 在 1920×800、12 个、gap 16、scale 1、只显示名字 40px 时精确等于 `{ columns: 4, rows: 3, cellWidth: 468, cellHeight: 256, nameFontSize: 40, labelFontSize: 0, textHeight: 60, padding: 12, moduleSize: 172, cardWidth: 240, cardHeight: 256 }`；同条件 scale 0.5 → moduleSize 86；名字字号请求 120 → nameFontSize 51；58 个（10 列 6 行）在 1920×1000 下 nameFontSize ≥ 18；任意输入（scale=1）满足 cardWidth ≤ cellWidth 且 cardHeight ≤ cellHeight（极小容器触发 moduleSize 下限 40 的情况除外）。
- `name-import.test.ts`：每行一个姓名；`姓名,部门` 无表头；带表头 CSV（`姓名,部门`）；制表符分隔；空行与空姓名跳过；受控字段只在 includeControlled 时读取（必中奖项名映射为 prize id）；0 行返回 error `未识别到任何姓名`；`decodeTextFile` 对 UTF-8 BOM 与 GBK 编码的 `张三,技术部` 都能解出原文（GBK 字节可在测试里写死：`张三` = `D5 C5 C8 FD`，`技术部` = `BC BC CA F5 B2 BF`，逗号 `2C`）。

**验收**：`pnpm test`、`npx tsc -b`、`pnpm build` 通过；新文件 eslint 零错误。提交：`feat(lib): 新增两阶段抽奖纯逻辑模块与测试基建`。

---

## Task 2: Store 改造（轮次状态机、编号、图片元数据、迁移）+ 最小调用点适配

读 spec：§2（R2、R3、R6、R7、R12、R13、R14）、§3、§4、§5、§6、§10。依赖 Task 1 的 `draw-engine`、`defaults`、`serial`、`name-import`。

**文件**
- 修改 `src/lib/types.ts`：`Participant` 加 `serial: number`；`Settings` 加必填 `moduleStyle`、`effects`、`sound`。`scrollMode`、`winnersPerPage` 本任务**保留**（Task 5 / Task 8 清理）。
- 修改 `src/assets/default-participants.ts`：只改类型标注为 `Omit<Participant, 'serial'>[]`（文件未纳入 git，不要 add）。
- 修改 `src/store/useStore.ts`：按 spec §6 实现全部状态与动作；`INITIAL_PRIZES` 改为从 `defaults.ts` 引入（新 7 档）；业务判断全部调用 `draw-engine` 纯函数，store 内不重复实现池/校验逻辑；新增 `normalizeSettings(raw): Settings`（导出，供 migrate/merge/测试用）；`migrate` v8 + `merge`。
- 删除 store 中 `isRolling`、`roundWinners`、`startRolling`、`stopRolling`。
- **最小调用点适配**（只为编译与基本可用，UI 重做在后续任务）：
  - `AdminPage.tsx`：`const phase = currentRound?.phase ?? 'idle'`，`const isRolling = phase === 'rollingPrizes' || phase === 'rollingNames'` 替代原 `isRolling`；主按钮与空格键改调 `advanceRound()`，失败 `toast.error(result.reason)`；按钮文案按 spec §8.1 五种阶段；"本轮结果预览"改为显示 `winners.filter(w => w.roundId === currentRound?.id)`；`selectPrize` 返回值可忽略；去掉不再存在的 `canStart/startDisabled` 逻辑（按钮不禁用）。
  - `DisplayPage.tsx`：同样从 `currentRound` 推导 `isRolling` 与本轮 winners 传给现有 `RollingBoard`（旧抽奖页暂时继续工作，Task 5 替换）。
- 新建 `src/store/useStore.test.ts`。

**测试（先写）** — 每个用例前用 `useLotteryStore.setState(...)` 设好初始状态（可写一个 `resetStore()` 帮助函数：participants 用小规模测试名单，prizeImages 用若干元数据，winners 空）。至少覆盖：
- 编号：`addParticipant` 连续发号；`addPrizeImages` 发 `serial` 与 `createdAt`；删除后再加不复用编号；`importParticipants` replace 从 1 重新编号、append 接续；replace 在有 winners 时返回 spec 中的 error 逐字；`duplicateNames` 计数。
- 状态机完整一轮：selectPrize → setRoundConfig({moduleCount: 3}) → startPrizeRoll（viewMode 变 lottery）→ stopPrizeRoll（3 张不重复图片）→ startNameRoll → stopNameRoll（3 条 winner，字段 imageId/imageSerial/imageLabel/roundNo/roundId 正确，roundCounter=1）→ nextRound（新 round id、roundNo=2、moduleCount=min(3, 剩余)）。
- 跨轮去重：第二轮的图片池与名字池不含第一轮结果。
- `advanceRound` 五个分支；`cancelRound` 三种回退与失败情况；rolling 中 `selectPrize`、`setRoundConfig({moduleCount})` 返回失败且状态不变；prizesRevealed 允许改 `namePoolIds` 但不允许改 `imagePoolIds`。
- 校验失败时 `startPrizeRoll` 返回 spec 的 reason 且 phase 不变（图片不足、名额已抽完至少各一例）。
- `removePrizeImages`：已用与本轮已定格的进 blocked；被删 id 从 `currentRound.imagePoolIds` 移除。`clearPrizeImages` 有 winners 时失败。
- `resetWinners`：winners 清空、roundCounter=0、currentRound 为当前奖项新 idle 轮；图片池/名单/奖项/设置不变。
- `updateModuleStyle({ nameStyle: { color: '#000000' } })` 只改 color，其它子字段保留。
- `normalizeSettings` 对缺 `moduleStyle` / 缺 `moduleStyle.nameStyle.fontSize` 的旧设置补默认值。
- 迁移：取 store 的 `persist.getOptions().migrate`，喂一个 v7 形态的对象（上一版 6 档默认奖项、无 serial 的参与者、带 isRolling/roundWinners、无 moduleStyle），断言 7 档新奖项、serial 1..N、计数器、无 isRolling/roundWinners、settings 已补全。另测：非默认奖项（用户改过的）保持不变。

**验收**：同 Global Constraints；手动确认 `pnpm dev` 打开后台不报错（可选）。提交：`feat(store): 两阶段轮次状态机、自动编号与图片池元数据`。

---

## Task 3: 媒体存储（IndexedDB）与图片处理

读 spec：§2（R5）、§9.1、§9.2、§9.3、§10。

**文件**
- 新建 `src/lib/media-store.ts`（spec §9.1）。用原生 `indexedDB`，不引入依赖，不加测试专用导出。node 环境下没有 indexedDB：`isMediaStoreAvailable()` 应 resolve 为 false，而不是抛错。
- 新建 `src/hooks/useMediaUrls.ts`（spec §9.2）。
- 新建 `src/lib/image-processing.ts`（spec §9.3）。
- 测试：`image-processing.test.ts`（`fitWithin`：横图/竖图/已在范围内/极端比例结果 ≥1；`labelFromFileName`：`一等奖-iPhone.png`→`一等奖-iPhone`、`a.b.c.jpg`→`a.b.c`、无扩展名、两侧空格）；`media-store.test.ts`：在 node 下 `isMediaStoreAvailable()` resolve 为 false，`getMediaUrl('x')` resolve 为 null（不抛错）。
- IndexedDB 的真实读写无法在 node 测试；在报告里写明如何在浏览器手测（Task 6 会用到）。

**验收**：同 Global Constraints。提交：`feat(media): IndexedDB 媒体库与图片压缩工具`。

---

## Task 4: 中奖特效与音效引擎

读 spec：§2（R9）、§3（EffectSettings / SoundSettings）、§9.4、§9.5、§10。依赖 Task 3 的 `getMediaUrl`。

**文件**
- 新建 `src/lib/effects.ts`（spec §9.4），导出 `playCelebration`、`splitEmojis`。
- 新建 `src/lib/sound.ts`（spec §9.5），导出单例 `soundEngine`。mp3 资源用 `import countdownUrl from '@/assets/countdown.mp3'`（Vite 会内联）；确认 TS 能识别 `.mp3` 导入（`vite/client` 类型已包含，若不行在 `src/vite-env.d.ts` 补声明）。
- 测试：`effects.test.ts` 只测 `splitEmojis`：`'🎉🧧✨'` → 3 个；含空格/换行被去掉；`'👨‍👩‍👧'`（ZWJ 组合）算 1 个；超过 8 个截断为 8；空串 → `[]`。`sound.ts` 与 `playCelebration` 依赖浏览器 API，不写单测，但必须保证在 node 中 `import` 不报错（模块顶层不得访问 `window`/`document`/`AudioContext`）——写一个 `sound.test.ts` 仅断言 `import` 成功且 `soundEngine.isUnlocked() === false`。

**验收**：同 Global Constraints。提交：`feat(fx): 撒花/星光/火箭/emoji 特效与音效引擎`。

---

## Task 5: 大屏两阶段抽奖舞台

读 spec：§1（大屏呈现方式）、§2（R3、R9、R11）、§7 全部、§10。依赖 Task 1（grid-layout、draw-engine）、Task 2（store）、Task 3（useMediaUrls）、Task 4（effects、sound）。

**文件**
- 新建 `src/hooks/useRollingTicker.ts`：`useRollingTicker(active: boolean, onTick: () => void): { animating: boolean }`。把 `RollingBoard.tsx` 现有加速/减速 rAF 逻辑搬过来（MIN 2/s、MAX 12/s、加速 1000ms、减速 1500ms）；onTick 通过 ref 读最新值；卸载时 cancelAnimationFrame。
- 新建 `src/components/display/PrizeModule.tsx`：纯展示组件，props：`{ layout: ModuleLayout; imageUrl?: string | null; label?: string | null; name?: string | null; style: ModuleStyle; state: 'blank' | 'rolling' | 'revealed'; fontFamily?: string }`（是否显示名字/说明读 `style.showName/showImageLabel`，尺寸与字号读 `layout`）。卡片尺寸 = `layout.cardWidth × layout.cardHeight`，图片区 `layout.moduleSize` 见方；名字/说明单行完整显示、超宽自动缩小字号（spec §7「文字显示」，用 ref 测量 `scrollWidth`，名字每帧变化时也要重新适配）。名字区在名字为空时保留高度。blank 显示淡色 "?"；rolling 时图片/文字轻微模糊或透明度变化；revealed 用 framer-motion 做一次缩放弹跳。所有颜色走 inline style（spec §7 样式陷阱）。Task 9 的后台预览会复用它。
- 新建 `src/components/display/DrawStage.tsx`：抽奖页主体。自己从 store 读取 `currentRound`、`currentPrizeId`、`prizes`、`prizeImages`、`participants`、`winners`、`settings`；用 `resolveImagePool` / `resolveNamePool` / `sampleDistinct` 生成滚动帧；ResizeObserver 量网格容器 → `computeModuleLayout`；标题区与阶段提示文案按 spec §7；用 `useMediaUrls` 加载本轮图片池与结果图片的 URL，rollingPrizes 开始时 `preloadImages`。
  - 阶段处理：rollingPrizes → 图片滚动；prizesRevealed 且减速中 → 继续滚动，减速结束 → 定格 `resultImageIds`；rollingNames → 图片固定、名字滚动；completed 且减速结束 → 定格名字（取本轮 winners 的 name）。
  - 特效/音效触发规则严格按 spec §7（只在观察到 live 转换时触发；用 ref 记录上一次的 `${round.id}:${phase}`；首次挂载只记录不触发）。滚动开始 `soundEngine.startRoll`，每帧 `soundEngine.tick`，定格 `stopRoll` + `playWin`（按规则）+ `playCelebration`。卸载/轮次变化时调用 stop 函数清理。
  - `currentRound` 为 null 时：显示奖项名与 `准备抽取奖品`，网格按 `min(12, 剩余名额)` 个空白模块（无奖项时显示 `请在后台选择奖项`）。
- 新建 `src/components/display/AudioUnlockHint.tsx`：spec §7 音频解锁提示；在 DisplayPage 中渲染（所有视图都显示）。window 级 `pointerdown` 一次性监听 → `soundEngine.unlock()`。
- 修改 `src/components/RollingBoard.tsx`：删除旧抽奖页（名单滚动、中奖者网格、翻页、自动滚动、旧撒花 effect、相关 state/ref/props），`viewMode === 'lottery'` 时渲染 `<DrawStage />`；props 变为空（或删除 props 接口）。保留欢迎页、奖项页、背景、全屏与后台入口按钮。删除对 `settings.scrollMode` / `winnersPerPage` 的引用。
- 修改 `src/pages/DisplayPage.tsx`：去掉候选人计算与 props 传递；保留 500ms rehydrate、`setViewMode('welcome')`、document.title；渲染 `<AudioUnlockHint />`。

**测试**：`useRollingTicker` 抽出一个纯函数 `getRollSpeed(phase, elapsedMs, decelStartSpeed)`（放同文件导出）并测试加速/减速曲线端点；其余为 UI，靠构建与手测。

**手测（必须做并写入报告）**：用本机 Chrome 无头模式截图验证布局（`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --remote-debugging-port=<端口> --user-data-dir=<临时目录>`（必须用临时 profile，不碰用户自己的 Chrome 数据），用 Node 内置 `WebSocket` 走 CDP：`Runtime.evaluate` 写入状态、`Page.captureScreenshot` 截图；不要安装 puppeteer 等依赖）。构造状态的方法：`localStorage['lucky-draw-storage']` 可直接写**明文** JSON（store 的 getItem 兼容明文，格式 `{"state":{...},"version":8}`），图片可在页面里用 canvas 画色块 → `toBlob` → 写入 IndexedDB `lucky-draw-media/blobs`。至少验证：模块数 1/2/3/6/10/12/20 的布局分别为 1、2、3、3×2、5×2、4×3、6 列；idle 空白模块、prizesRevealed 定格图片、completed 图片+名字三种画面；页面无编号文本。截图放在 `/tmp/lucky-shots/`，不要提交。

**验收**：同 Global Constraints；大屏任何位置不渲染编号。提交：`feat(display): 两阶段抽奖大屏（奖品滚动 → 名字滚动）`。

---

## Task 6: 后台「图片池」Tab

读 spec：§1（图片池需求）、§2（R5、R12、R14）、§8.3、§9.1–9.3、§10。依赖 Task 2（`addPrizeImages`/`updatePrizeImage`/`removePrizeImages`/`clearPrizeImages`）、Task 3。

**文件**
- 新建 `src/components/admin/ImagePoolTab.tsx`：按 spec §8.3 全部实现。图片状态（可用 / 已抽中 · 奖项 · 第N轮 / 本轮已定格）用 draw-engine 的函数与 winners 推导，不在组件里复写规则。缩略图用 `useMediaUrls`。网格要能承受 200+ 张（缩略图 `loading="lazy"`、固定尺寸）。
- 新建 `src/components/admin/MediaUnavailableAlert.tsx`：IndexedDB 不可用警告（文案见 spec §8.3），`ImagePoolTab` 与 Task 9 的自定义音效上传处复用。
- 修改 `src/pages/AdminPage.tsx`：新增 Tab `图片池`（放在 `批量导入` 之后），渲染 `<ImagePoolTab />`。只做这一处接线。

**测试**：组件逻辑若有可抽出的纯函数（如"按分组/状态/关键字过滤图片"），抽到 `src/lib/image-pool-filter.ts` 并写测试；否则在报告中说明为何没有单测。

**手测（写入报告）**：Chrome 无头 + CDP（方法见 Task 5，使用临时 profile），通过 `DOM.setFileInputFiles` 给上传 input 喂 3–5 张本地生成的 PNG/SVG（放 `/tmp`），验证：编号连续 `IMG-0001…`；说明默认为文件名；分组编辑；删除；刷新后图片仍在（IndexedDB）；页面能打开大屏且不报错。

**验收**：同 Global Constraints。提交：`feat(admin): 图片池批量上传、自动编号与管理`。

---

## Task 7: 后台「现场控制」重做与池选择器

读 spec：§1（抽奖过程）、§2（R7、R11）、§4、§5、§8.1、§8.2、§10。依赖 Task 2、Task 3、Task 6。

**文件**
- 新建 `src/components/admin/LiveControlPanel.tsx`：spec §8.1 全部（场景切换、奖项按钮含进度、模块数配置与布局提示、池摘要、主按钮、取消本轮、校验提示、本轮结果卡片）。奖项的编辑/删除/添加对话框仍在 AdminPage 中，通过 props 回调（`onEditPrize(prize)`、`onDeletePrize(id)`、`onAddPrize()`）调用，不要搬动对话框代码。
- 新建 `src/components/admin/ImagePoolPicker.tsx`、`src/components/admin/NamePoolPicker.tsx`：spec §8.2。
- 修改 `src/pages/AdminPage.tsx`：用 `<LiveControlPanel … />` 替换原"现场控制"卡片与"本轮结果预览"卡片；空格键处理移到 LiveControlPanel（或保留在 AdminPage，二选一，不要两处都监听）；头部 Badge 显示阶段文案（idle `等待开始`、rollingPrizes `奖品抽取中`、prizesRevealed `奖品已定格`、rollingNames `名字抽取中`、completed `本轮完成`）。删除 Task 2 留下的临时适配代码。
- 若出现可复用的纯逻辑（例如"池摘要文案"`describeImagePool(...)`），放 `src/lib/` 并写测试。

**手测（写入报告）**：Chrome 无头 + CDP 完整走一轮：上传 ≥12 张图 → 选一等奖 → 模块数 6 → 主按钮四次 + 下一轮；同时打开大屏页截图四个阶段。验证选择器限制池后，滚动与结果只来自所选；空格键可推进；取消本轮可回退；第二轮池中不含第一轮结果。

**验收**：同 Global Constraints。提交：`feat(admin): 两阶段现场控制面板与图片/名字池选择`。

---

## Task 8: 名单导入增强、中奖记录与重置清零

读 spec：§1（名单、记录、重置）、§2（R2、R10、R13、R14）、§6（导入规则）、§8.4、§8.6、§10。依赖 Task 1（`parseNameList`、`decodeTextFile`）、Task 2。

**文件**
- 新建 `src/components/admin/WinnersTab.tsx`：spec §8.6（表格列、倒序、进度、导出图片按钮、重置清零 confirm）。把 AdminPage 中现有 `handleExportWinnersImage` 搬到这里（导出内容可额外加一列"奖品"显示图片说明/编号）。
- 修改 `src/pages/AdminPage.tsx`：
  - 人员表加 `编号`、`状态` 列，搜索匹配编号（spec §8.4）。
  - 批量导入 Tab：选择文件（`decodeTextFile`）、导入方式单选、说明文字、toast 文案（spec §8.4）。
  - `中奖记录` Tab 改为渲染 `<WinnersTab />`。
  - 系统设置 Tab 删除"大屏多中奖者展示模式"与"每页最多显示人数"两块；字体下拉改用 `FONT_PRESETS`。
- 修改 `src/lib/types.ts` 与 `src/store/useStore.ts`：删除 `Settings.scrollMode`、`Settings.winnersPerPage` 及默认值（`normalizeSettings` 丢弃这两个旧字段）；全仓库 grep 确认无残留引用。
- 测试：store 测试补充"`normalizeSettings` 丢弃 scrollMode/winnersPerPage"；若抽出纯函数（如记录排序/分组 `sortWinnersForDisplay`）写测试。

**验收**：同 Global Constraints。提交：`feat(admin): 名单文件导入、中奖记录明细与重置清零`。

---

## Task 9: 后台「大屏样式与特效」Tab + 文档

读 spec：§1（样式/特效/音效需求）、§2（R8、R9）、§3（默认值）、§8.5、§9.4、§9.5、§10。依赖 Task 2（`updateModuleStyle/updateEffects/updateSound`）、Task 3（media-store）、Task 4（effects、sound）、Task 5（`PrizeModule`）、Task 6（`MediaUnavailableAlert`）。

**文件**
- 新建 `src/components/admin/DisplayStyleTab.tsx`：spec §8.5 全部。滑块用 `@/components/ui/slider`，颜色用原生 `<input type="color">`。自定义音频：`putMedia('audio-roll-' + nanoid(), file)` 成功后 `updateSound({ roll: 'custom', customRollKey, customRollName })`，并 `deleteMedia([旧 key])`；中奖音频同理（前缀 `audio-win-`）。试听在后台窗口调用 `soundEngine`（先 `unlock()`）。预览特效调用 `playCelebration(settings.effects)`。
- 修改 `src/pages/AdminPage.tsx`：新增 Tab `大屏样式与特效`（放在 `图片池` 之后）。
- 修改 `README.md`：新增一节「两阶段奖品抽奖（2026-11）」：操作流程（上传图片 → 导入名单 → 选奖项 → 设模块数 → 四次按键）、去重规则、图片存储在 IndexedDB（file:// 兼容性提示）、Excel 导入方式、重置清零与清空数据库的区别。
- 修改 `CLAUDE.md`：Architecture 中补充新模块（draw-engine、grid-layout、media-store、effects、sound、DrawStage、admin 组件目录）与"轮次状态机在 store、规则在 draw-engine"的说明；Persistence 补充 IndexedDB。

**手测（写入报告）**：Chrome 无头 + CDP：改名字颜色/字号/模块透明度/每排数量后，大屏截图在 1s 内体现；四种特效各触发一次无报错（看 console）。

**验收**：同 Global Constraints。提交：`feat(admin): 大屏模块样式、中奖特效与音效设置`。
