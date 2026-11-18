# Layout / Fonts / Pool-Decouple + Bug Fixes — Design

**Date:** 2026-11-17
**Base branch:** `feat/two-phase-prize-draw` (continues the shipped two-phase work)
**Spec it extends:** `docs/plans/2026-11-17-two-phase-draw-spec.md`

## Intent and why

The two-phase draw shipped. After a test run the operator wants the three
display pages (welcome / prize / lottery) to look the way *they* want on
their projector, more font choice, image/name pools that can be drawn
independently, higher-fidelity images, and five bugs gone. The goal is an
operator who can make the screen match their event without touching code,
and a draw page whose modules read cleanly from the back of a hall.

## Goals

1. **Per-page global layout controls** for welcome / prize / lottery:
   title and subtitle font size / color / font / horizontal align;
   vertical placement of the text block (top / center / bottom); one
   optional decoration image per page with a size slider and a
   nine-point position preset.
2. **Module shape + label position:** module shape preset
   (square / rounded / circle); image-label shown **above or below** the
   image.
3. **Pool decouple with per-round mode:** each round the operator picks
   one of — *image then name* (default, current behaviour), *image only*,
   *name only*. All three end with effects + sound.
4. **Fonts:** a built-in list of ~20 Chinese and ~20 English font
   **names** (CSS family stacks — zero bytes added to the bundle), plus
   upload of a font file (stored in IndexedDB, injected via `@font-face`,
   available in every font dropdown and on the display).
5. **Higher-fidelity images:** auto-compress keeps more resolution/quality.
6. **Bug fixes B1–B5** (below).

## Non-goals

- Free drag-and-drop positioning of modules or text (explicitly deferred
  to a later project per the operator's choice — "先做全局控制，拖拽留后续").
- Per-module individual size/shape/position (follows from the above).
- Bundling actual font files into the offline build (names-list + upload
  only; a target machine missing a named font falls back gracefully).
- Rich-text / multi-line titles, animation authoring.

## Anti-goals (would make this a failure even if it "works")

- Breaking cross-round dedup, serial isolation, or the display-never-writes
  rule established in the two-phase work.
- Growing the single-file `dist/index.html` by tens of MB (rules out
  embedding font files).
- A module grid where font size differs module-to-module (that is B2, the
  thing we are fixing — the fix must not reintroduce it elsewhere).

## Constraints

- Stack unchanged: React 19 + TS + Tailwind 4 + Vite single-file; Zustand
  persist (`lucky-draw-storage`), bump persist version 8 → 9 with a
  migration that fills the new settings fields on old state.
- Binary (decoration images, font files) goes in IndexedDB
  (`lucky-draw-media`) via the existing `media-store`; settings keep only
  metadata. IndexedDB may be absent under `file://` — degrade, never throw
  (reuse `MediaUnavailableAlert` / `useMediaStoreAvailable`).
- Display windows remain read-only on the store (admin is sole writer).
- New files must be eslint-clean under the strict react-hooks rules.
- Colours on the display still via inline styles (the `.hermes-display-board`
  `!important` trap).

## Bugs

- **B1 — winner department not shown.** `DrawStage` never renders `dept`.
  Add: when `settings.showDept` is on, show the winner's department under
  the name on the completed module. Owner: `PrizeModule` + `DrawStage`.
- **B2 — module font size inconsistent.** `FitLine` shrinks each module's
  text independently, so a long name renders smaller than a short one.
  Fix: `DrawStage` computes **one** fitting font size for names (and one
  for labels) across all current modules and passes it to every module;
  modules render at that fixed size without per-element shrinking.
- **B3 — module size maxes out too small.** `moduleScale` is capped at 100
  and `DrawStage` additionally clamps `scale` to ≤ 1. Raise the max to 200
  and remove the ≤1 clamp so the slider can actually enlarge modules
  (layout still bounded by the grid cell).
- **B4 — image-description edit has no visible save / no effect on the draw
  page.** Root-caused during implementation; two contributing parts known:
  single-card label/group edits save on blur but give no confirmation
  (only batch does), and the label is only visible on the draw page when
  "show image label" is on. Fix: confirm single edits (toast), and ensure
  the draw page reflects the edited label live. A regression test asserts
  the edit reaches the store and the display reads it.
- **B5 — batch "set group" clears the group instead.** Reproduce,
  root-cause, fix, and lock with a test asserting that batch-setting a
  non-empty group leaves every selected image in that group.

## Approaches considered

**Layout customization — three ways:**

- **A. Enhanced global controls (chosen).** Each page gets a settings
  block: title/subtitle text styles, a vertical-placement choice, and one
  decoration image with size + nine-point position. No per-element
  coordinates. Fits the existing settings-form + DisplayStyleTab pattern,
  ships in days, and is forward-compatible with a later drag editor
  (coordinates can be added to the same objects).
- B. Free drag-and-drop editor. A canvas where every element is dragged and
  resized. Most flexible, but needs a new layout engine, hit-testing, and
  conflicts with the automatic module grid — weeks, and the operator
  explicitly deferred it.
- C. CSS/theme presets only. A few canned looks. Cheapest, but doesn't meet
  "every text's size/color/position adjustable."

Chosen **A**: it meets the stated requirement, reuses current patterns, and
leaves B as a clean follow-on.

**Fonts — three ways:**

- **A. Names list + upload (chosen).** ~40 CSS family stacks (no bytes) +
  user font upload to IndexedDB with `@font-face`. Meets "20 CN + 20 EN or
  upload" with a tiny bundle. Risk: a target machine lacking a named font
  falls back — acceptable and expected for a names list.
- B. Bundle real font files. Guaranteed rendering everywhere, but adds tens
  of MB to the offline single file — violates a constraint.
- C. Google Fonts web-load. Zero bundle, but the app runs offline from USB;
  no network. Rejected.

Chosen **A**.

**Pool decouple — two ways:**

- **A. Per-round mode on the control panel, default two-phase (chosen).**
  Operator picks the mode each round; `image-only` runs one roll of images
  then celebrates, `name-only` runs one roll of names (no image area) then
  celebrates. Matches how rounds already differ (module count, pools).
- B. One global mode in settings. Simpler UI but can't mix modes across
  rounds in one event. Rejected per the operator's choice.

Chosen **A**.

## The parts decided

### Data model (new / changed types, `src/lib/types.ts`)

```
type HAlign = 'left' | 'center' | 'right';
type VAlign = 'top' | 'center' | 'bottom';
type ModuleShape = 'square' | 'rounded' | 'circle';
type LabelPosition = 'above' | 'below';
type DrawMode = 'image-then-name' | 'image-only' | 'name-only';
type DecorPosition =
  'top-left'|'top-center'|'top-right'|'center-left'|'center'|'center-right'|
  'bottom-left'|'bottom-center'|'bottom-right';

interface TextBlockStyle { fontFamily: string; fontSize: number; color: string; align: HAlign; }
interface PageDecor { imageKey: string; imageName: string; widthPct: number; position: DecorPosition; }
interface PageLayout { verticalAlign: VAlign; title: TextBlockStyle; subtitle: TextBlockStyle; decor: PageDecor; }

interface UploadedFont { key: string; family: string; name: string; } // key: IndexedDB 'font-<id>', family: CSS name used in @font-face

// ModuleStyle gains: shape: ModuleShape; labelPosition: LabelPosition;  (moduleScale max 200)
// Settings gains: welcomeLayout, prizeLayout, lotteryLayout: PageLayout; fonts: UploadedFont[];
// CurrentRound gains: drawMode: DrawMode;  (default 'image-then-name')
```

### State machine for draw modes

The current machine is `idle → rollingPrizes → prizesRevealed →
rollingNames → completed`. Mode changes which transitions apply:

- **image-then-name:** unchanged.
- **image-only:** `idle → rollingPrizes → completed`. Stopping the image
  roll draws images, writes winners with `imageId` but **no person**, and
  completes with celebration. (Winner records without a name — the module
  shows only the image. Dedup on images still holds; no name is consumed.)
- **name-only:** `idle → rollingNames → completed`. Modules show no image
  area; stopping draws names, writes winners with no `imageId`, celebrates.

`advanceRound` branches on `round.drawMode`. Mode is chosen on the control
panel while `idle`; `setRoundConfig` accepts `drawMode` in `idle` only.
Validation reuses the existing image/name shortage checks, each gated by
whether that mode draws that pool.

> **Decision (ruling):** image-only winners are real `Winner` records with
> `imageId` set and `id`/`name` left empty-ish (a synthetic placeholder
> person is **not** created). Dedup for images keys on `imageId`; name
> dedup is unaffected because no participant is consumed. Cost if wrong:
> winner-records export shows blank name rows for image-only rounds — which
> is correct for an image-only draw.

### Fonts

- `FONT_PRESETS` expands to ~20 CN + ~20 EN entries (family stacks only).
- `useCustomFonts(fonts)` hook: for each `UploadedFont`, load its blob from
  IndexedDB and register a `FontFace(family, url)` on `document.fonts`
  (once per family; cleaned up on change). Used by both the admin shell and
  `RollingBoard` so previews and the display both see uploaded fonts.
- Upload UI in DisplayStyleTab (or a Fonts section): accept `.ttf/.otf/.woff/.woff2`,
  size-capped, `putMedia('font-<id>', file)`, append to `settings.fonts`.
- Every font `<Select>` lists presets + uploaded families + "follow global".

### Layout controls (admin)

A per-page layout editor UI (welcome / prize / lottery), reached from the
settings area / DisplayStyleTab, driving `updatePageLayout(page, patch)`.
Live-applied, no save button, consistent with DisplayStyleTab. A small
preview per page is nice-to-have, not required.

### Display rendering

`RollingBoard` applies each page's `PageLayout`: wraps the text block with
the chosen vertical alignment, applies title/subtitle `TextBlockStyle`
(inline styles), and renders the decoration image (from IndexedDB URL) at
its position/size. `DrawStage` applies the lottery-page layout to its
header and renders the decoration image. Module shape, label position,
department line, uniform font size, and the raised scale all live in
`PrizeModule` + `grid-layout` + `DrawStage`.

### Image fidelity

`prepareImageBlob`: raise `maxSide` 1024 → 1920 and quality 0.88 → 0.92.
(Still only re-encodes when the result is smaller than the original;
SVG/GIF still pass through.)

## Left to the builder

- Exact React/Tailwind structure of the layout-editor UI and which existing
  shadcn primitives to reuse (Select / Slider / color input already in
  DisplayStyleTab).
- The text-measurement mechanism for B2's shared font size (canvas
  `measureText` vs a hidden measuring element) — must be deterministic and
  unit-testable.
- Exact ~40 font-family stacks (sensible common CN/EN fonts).
- Nine-point position → CSS translation.
- Migration details for persist v8 → v9 filling the new fields.
```
