# Layout / Fonts / Pool-Decouple + Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the operator per-page layout control (text styles, placement, one decoration image, module shape, label position), ~40 built-in font names + font upload, per-round draw-mode decouple (image-then-name / image-only / name-only), higher-fidelity image compression, and fix five bugs (B1–B5).

**Architecture:** Extend the existing Zustand settings model and `media-store`. New per-page `PageLayout` objects and uploaded-font metadata live in `settings`; decoration-image and font binaries live in IndexedDB. Pure layout/draw logic stays in `src/lib/*`; display reads only. Persist version 8 → 9 with a field-filling migration.

**Tech Stack:** React 19, TypeScript, Tailwind 4, Vite single-file, Zustand persist, shadcn/ui, framer-motion, IndexedDB.

**Spec:** `docs/superpowers/specs/2026-11-17-layout-fonts-decouple-design.md` (extends `docs/plans/2026-11-17-two-phase-draw-spec.md`)

## Global Constraints

- Keep the single-file build; do NOT bundle font binaries. Fonts = CSS family-stack names + user uploads in IndexedDB.
- Persist key `lucky-draw-storage`; bump version 8 → 9; migration fills every new field on old/partial state and never throws.
- Display windows never write the store except the existing `setViewMode('welcome')` on mount.
- Binary media (decoration images, fonts) in IndexedDB via `media-store`; settings hold only metadata; degrade (not throw) when IndexedDB is unavailable (`useMediaStoreAvailable`, `MediaUnavailableAlert`).
- Display colours/styles via inline styles (`.hermes-display-board !important` trap).
- New `.ts/.tsx` files must be eslint-clean under the strict react-hooks rules.
- Do not break cross-round dedup, serial isolation, or `defaults.ts` / `normalizeSettings` tolerance of partial state.
- Commit style: Conventional Commits, Chinese subject, end every commit body with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- Never commit `src/assets/default-participants.ts` or `~$*.xlsx`; `git add` by explicit path only.
- Run after every task: `pnpm test`, `pnpm exec tsc -p tsconfig.app.json --noEmit`, `pnpm lint` (new files zero errors), `pnpm build`.

## Review Focus

1. **Image-only / name-only winners break dedup or winner export.** A round drawn image-only must consume no participant and must not reappear its images next round; name-only must consume no image. Test in Task 6.
2. **B2 shared font size regresses with mixed name lengths + a decoration image present.** One long name must not shrink below its siblings. Test in Task 4.
3. **Persist v8 state missing all new fields loads without throwing and renders defaults.** Test in Task 1 migration.
4. **Uploaded font missing from a machine / IndexedDB unavailable.** Font dropdown still works, display falls back to the stack, no crash. Test in Task 7 (unit) + manual.
5. **Decoration image key points at a deleted/absent blob.** Page renders without the image, no broken-image flash or throw. Test in Task 5.

---

### Task 1: Data model + persist migration (v8 → v9)

**Files:**
- Modify: `src/lib/types.ts` (add the new types/fields from the design doc)
- Modify: `src/lib/defaults.ts` (default `PageLayout` for each page, `labelPosition`/`shape` on `DEFAULT_MODULE_STYLE`, `moduleScale` max note, `fonts: []`, expand `FONT_PRESETS`)
- Modify: `src/store/useStore.ts` (`DEFAULT_SETTINGS` new fields; `normalizeSettings` fills `welcomeLayout/prizeLayout/lotteryLayout/fonts` and `moduleStyle.shape/labelPosition`; bump `version: 9`; migration maps v8→v9; `createRound` sets `drawMode: 'image-then-name'`)
- Test: `src/store/useStore.test.ts`, `src/lib/defaults.test.ts` (if present; else add store tests)

**Interfaces:**
- Produces: `PageLayout`, `TextBlockStyle`, `PageDecor`, `ModuleShape`, `LabelPosition`, `DrawMode`, `DecorPosition`, `UploadedFont`, `HAlign`, `VAlign` exported from `types.ts`; `DEFAULT_WELCOME_LAYOUT`/`DEFAULT_PRIZE_LAYOUT`/`DEFAULT_LOTTERY_LAYOUT` from `defaults.ts`; `ModuleStyle.shape`, `ModuleStyle.labelPosition`; `CurrentRound.drawMode`.

- [ ] **Step 1: Failing test** — add to `useStore.test.ts`: `normalizeSettings({})` returns settings whose `welcomeLayout`, `prizeLayout`, `lotteryLayout` equal the defaults and whose `fonts` is `[]` and `moduleStyle.shape === 'rounded'`, `moduleStyle.labelPosition === 'below'`; and a migration test: a v8-shaped persisted object (no layout/fonts/shape keys, `currentRound` without `drawMode`) migrates to a state where those fields are present and defaulted, without throwing.
- [ ] **Step 2: Run** `pnpm exec vitest run src/store/useStore.test.ts` → FAIL.
- [ ] **Step 3: Implement** the type additions, defaults, `normalizeSettings` nesting (mirror the existing `moduleStyle` nested-withDefaults pattern), `version: 9`, and migration (v8→v9 just fills fields; keep the existing v7 repair chain). `createRound` adds `drawMode: 'image-then-name'`. Choose default placements: welcome center, prize top, lottery top; default `TextBlockStyle` colours from current display values.
- [ ] **Step 4: Run** the test → PASS; then `pnpm test` all green.
- [ ] **Step 5: Commit** `feat(types): 新增页面排版/字体/抽奖模式数据模型与持久化迁移 v9`.

---

### Task 2: Font presets expansion + custom-font loader

**Files:**
- Modify: `src/lib/defaults.ts` (`FONT_PRESETS` → ~20 CN + ~20 EN family stacks, grouped label prefix e.g. `中文 /` `English /`)
- Create: `src/hooks/useCustomFonts.ts`
- Create: `src/hooks/useCustomFonts.test.ts`

**Interfaces:**
- Consumes: `UploadedFont[]` from settings; `getMediaUrl` from `media-store`.
- Produces: `useCustomFonts(fonts: UploadedFont[]): void` — registers each font's `FontFace` on `document.fonts` once per `family`, revokes/cleans on change; no-op when `document.fonts` or IndexedDB is unavailable.

- [ ] **Step 1: Failing test** — `useCustomFonts.test.ts`: rendering the hook with one `UploadedFont` calls `getMediaUrl` for its key and adds a `FontFace` with its `family` to a `document.fonts` stub; unmount/removal cleans it; absent `document.fonts` is a silent no-op. (Mock `media-store` + a `document.fonts` double.)
- [ ] **Step 2: Run** `pnpm exec vitest run src/hooks/useCustomFonts.test.ts` → FAIL.
- [ ] **Step 3: Implement** the hook and expand `FONT_PRESETS`. Keep each preset a safe CSS stack ending in a generic family.
- [ ] **Step 4: Run** → PASS; `pnpm test`.
- [ ] **Step 5: Commit** `feat(fonts): 内置中英文字体名清单与自定义字体加载 hook`.

---

### Task 3: Store actions for layout + fonts + draw-mode

**Files:**
- Modify: `src/store/useStore.ts`
- Test: `src/store/useStore.test.ts`

**Interfaces:**
- Produces:
  - `updatePageLayout(page: 'welcome'|'prize'|'lottery', patch: DeepPartial<PageLayout>): void`
  - `addFont(font: UploadedFont): void` / `removeFont(key: string): void`
  - `setRoundConfig` accepts `drawMode?: DrawMode` (idle only).
  - `updateModuleStyle` accepts `shape`/`labelPosition` (already a patch — extend type).

- [ ] **Step 1: Failing test** — store tests: `updatePageLayout('prize', { title: { fontSize: 72 } })` merges only that nested field; `addFont`/`removeFont` mutate `settings.fonts`; `setRoundConfig({ drawMode: 'image-only' })` succeeds in `idle` and fails (`PHASE_ERROR`) in `rollingPrizes`.
- [ ] **Step 2: Run** store tests → FAIL.
- [ ] **Step 3: Implement** the actions (mirror `updateModuleStyle`'s nested shallow-merge for `TextBlockStyle`/`PageDecor`). `removeFont` also `void deleteMedia([key])` is done by the caller UI, not the store (store stays pure of IndexedDB except where existing code already is).
- [ ] **Step 4: Run** → PASS; `pnpm test`.
- [ ] **Step 5: Commit** `feat(store): 排版/字体/每轮抽奖模式的 store actions`.

---

### Task 4: B1 dept line + B2 uniform module font size + B3 larger scale + module shape + label position

**Files:**
- Modify: `src/lib/grid-layout.ts` (compute one shared `nameFontSize`/`labelFontSize` already; raise scale handling; expose shape radius input)
- Modify: `src/components/display/PrizeModule.tsx` (fixed font size — stop per-element shrink by default; shape; label above/below; dept line)
- Modify: `src/components/display/DrawStage.tsx` (remove `Math.min(1, …)` scale clamp; pass `dept`, `labelPosition`, `shape`; compute shared fit)
- Create: `src/lib/fit-text.ts` (deterministic shared-size measurement) + `src/lib/fit-text.test.ts`

**Interfaces:**
- Produces: `fitFontSize(texts: string[], maxWidth: number, baseFontSize: number, measure: (t:string,size:number)=>number): number` — the largest size ≤ base at which every text fits `maxWidth`, floored at a min; pure, injectable measurer for tests.
- `grid-layout` `computeModuleLayout` unchanged signature; `scale` now may exceed 1 (caller passes `moduleScale/100` up to 2). `MIN_MODULE_SIZE` unchanged; cell bound still applies.

- [ ] **Step 1: Failing tests** —
  - `fit-text.test.ts`: with a measurer where width ∝ `len*size`, `fitFontSize(['a','abcdefgh'], W, 40, m)` returns one size at which the longest string fits, and it is ≤ 40 and the same for all.
  - `grid-layout` test: `computeModuleLayout({ ...scale:1.8 })` yields a larger `moduleSize` than `scale:1` for the same container (clamped by cell).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - B3: `defaults` `moduleScale` max is a UI concern (Task 8); here remove `Math.min(1, Math.max(0.4, …))` ceiling in `DrawStage` (keep floor 0.4), and let `grid-layout` accept scale up to 2.
  - B2: `DrawStage` gathers the visible names (and labels) for the current frame, calls `fitFontSize` once each using a canvas `measureText` helper, and passes the resulting fixed sizes to every `PrizeModule`; `PrizeModule`/`FitLine` render at the given size without its own shrink loop (keep a hard overflow guard only as last resort). Uniform across modules.
  - B1: `PrizeModule` gains optional `dept?: string|null`; when `showDept` and phase completed, render dept under name at a smaller fixed size; `DrawStage` passes `winner.dept`; thread `showDept` from settings.
  - Shape: `PrizeModule` applies `borderRadius`/`border-radius:50%` per `style.shape` (square=small, rounded=current, circle=round image area).
  - Label position: render label block above or below the image per `style.labelPosition`.
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Commit** `fix(display): 部门显示、模块字号统一、放大范围、形状与说明位置 (B1/B2/B3)`.

---

### Task 5: Per-page layout rendering on the display

**Files:**
- Modify: `src/components/RollingBoard.tsx` (apply `welcomeLayout`/`prizeLayout` text styles, vertical placement, decoration image)
- Modify: `src/components/display/DrawStage.tsx` (apply `lotteryLayout` to header + decoration image)
- Modify: `src/App.tsx` or `RollingBoard` to call `useCustomFonts(settings.fonts)` so the display sees uploaded fonts
- Create: `src/components/display/PageDecorImage.tsx` (reads the decor blob URL via `useMediaUrls`, renders at position/size, renders nothing when missing) + test
- Test: `src/components/display/PageDecorImage.test.ts`

**Interfaces:**
- Consumes: `PageLayout`, `useMediaUrls`.
- Produces: `PageDecorImage({ decor: PageDecor })`.

- [ ] **Step 1: Failing test** — `PageDecorImage.test.ts`: given a decor with a key whose URL is undefined (absent blob), renders null (no `<img>`); given a resolved URL, renders an `<img>` positioned per `position` and width `widthPct`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `PageDecorImage`, wire the three pages to their layouts (inline styles for colours/placement), register custom fonts on the display. Title/subtitle text uses `TextBlockStyle` (fontFamily may be a preset, an uploaded family, or '' = follow global).
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Commit** `feat(display): 三页排版与装饰图渲染、大屏加载自定义字体`.

---

### Task 6: Draw-mode decouple in the state machine

**Files:**
- Modify: `src/store/useStore.ts` (`advanceRound`, `startPrizeRoll`/`stopPrizeRoll`/`startNameRoll`/`stopNameRoll`, `cancelRound`, validation gating by `drawMode`; `buildWinners` tolerates no-person / no-image)
- Modify: `src/lib/draw-engine.ts` if needed for mode-aware validation helpers
- Modify: `src/components/display/DrawStage.tsx` (name-only hides the image area; image-only shows no name)
- Modify: `src/lib/phase-labels.ts` (labels may depend on mode — or compute in panel)
- Test: `src/store/useStore.test.ts`, `src/lib/draw-engine.test.ts`

**Interfaces:**
- Consumes: `CurrentRound.drawMode` (Task 1), `setRoundConfig({drawMode})` (Task 3).
- Produces: mode-aware `advanceRound` transitions per the design doc.

- [ ] **Step 1: Failing tests** —
  - image-only: from `idle`, `advanceRound` → `rollingPrizes`; again → `completed`; winners length = moduleCount, each has `imageId`, no participant consumed (a later name-mode round can still draw every participant); images do not reappear next round.
  - name-only: `idle → rollingNames → completed`; winners have names, no `imageId`; no image consumed.
  - image-then-name unchanged (existing tests still pass).
  - cancel from each mode's rolling phase returns to a safe prior phase with no winners written.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the branching. `stopPrizeRoll` in image-only writes winners (image-only `buildWinners`) and sets `completed`, bumping `roundCounter`. `startNameRoll`/`stopNameRoll` in name-only run without images. Gate shortage validation by mode. `buildWinners` handles missing person (synthesize nothing; store a winner record with empty name/dept and the imageId) and missing image (name-only).
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Commit** `feat(draw): 图片/名字池解耦，支持只抽图片/只抽名字/两阶段`.

---

### Task 7: Admin UI — layout editor, font upload, draw-mode picker, image fidelity, B4/B5

**Files:**
- Modify: `src/components/admin/DisplayStyleTab.tsx` (per-page layout sections; module shape + label-position controls; `moduleScale` slider max 200; font `<Select>` lists presets + uploaded; font-upload field)
- Create: `src/components/admin/PageLayoutEditor.tsx` (one reusable block per page) + test
- Modify: `src/components/admin/LiveControlPanel.tsx` (draw-mode selector while idle)
- Modify: `src/components/admin/ImagePoolTab.tsx` (B4 toast on single edit; B5 fix) + `ImagePoolCard.tsx` if needed
- Modify: `src/lib/image-processing.ts` (B: maxSide 1920, quality 0.92)
- Test: `src/lib/image-processing.test.ts` (fidelity params), `src/components/admin/*` where testable; a store/integration test for B5

**Interfaces:**
- Consumes: `updatePageLayout`, `addFont`/`removeFont`, `setRoundConfig({drawMode})`, `useCustomFonts`.

- [ ] **Step 1: Failing tests** —
  - B5: a test (unit on the batch handler logic, or store-level) asserting batch-setting group `"一等奖"` on N selected images leaves all N with `group === '一等奖'` (reproduce the clear-instead-of-set first and watch it fail).
  - B4: a test asserting a single-card label edit calls `updatePrizeImage` with the new label and that `DrawStage`/display reads the updated label (store-level: update label, assert `prizeImages` reflects it and the label the display would show changes).
  - image-processing: `fitWithin` and the exported `maxSide`/quality default produce the larger bound (assert the new default `maxSide` constant value).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - **B5 root-cause:** reproduce via systematic-debugging; fix so batch set applies the typed group. (Likely the trimmed-equality / refresh path or a stale closure — confirm before fixing.)
  - **B4:** `handleEdit` fires a `toast.success` on a saved single edit; confirm the label flows to the display (it reads `imageById.get(id).label` live — verify and test). If the draw page only shows labels when `showImageLabel` is on, surface that in the UI copy.
  - Layout editor UI per page; font upload (`putMedia('font-<id>')` → `addFont`; delete → `removeFont` + `deleteMedia`); draw-mode picker in LiveControlPanel (idle only); scale slider max 200; shape + label-position controls.
  - image fidelity constants.
- [ ] **Step 4: Run** `pnpm test` → PASS; `pnpm build`.
- [ ] **Step 5: Commit** `feat(admin): 排版编辑器、字体上传、抽奖模式选择、图片高清；修复图片描述保存与批量分组 (B4/B5)`.

---

### Task 8: Docs + manual verification

**Files:**
- Modify: `README.md` (new layout/fonts/draw-mode operations), `CLAUDE.md` (architecture: PageLayout, useCustomFonts, draw modes, fit-text)
- Modify: `docs/plans/2026-11-17-two-phase-draw-spec.md` or add a short addendum note pointing at the new design doc

- [ ] **Step 1** Update README operation flow (choose draw mode, customize each page, upload fonts, module shape/label position) and CLAUDE.md architecture notes.
- [ ] **Step 2** Manual check (headless Chrome, temp `--user-data-dir`): each page's title size/color/placement change reflects on the display within ~1s; a decoration image appears at its position; image-only and name-only rounds each end with effects; module font size is uniform with mixed-length names; dept shows when enabled.
- [ ] **Step 3** `pnpm test` + `pnpm build` green.
- [ ] **Step 4: Commit** `docs: 排版/字体/抽奖模式说明与架构更新`.

---

## Self-review notes

- Spec coverage: layout (T1,T3,T5,T7), shape+label pos (T1,T4,T7), decouple (T1,T3,T6,T7), fonts (T1,T2,T5,T7), fidelity (T7), B1 (T4), B2 (T4), B3 (T4), B4 (T7), B5 (T7). All covered.
- Type consistency: new types defined in T1, consumed by later tasks via Interfaces blocks.
- Review Focus items 1–5 each have an owning test (T6, T4, T1, T7, T5).
- Proportion: plan carries decisions (types, signatures, transitions, test assertions), bodies left to implementer.
