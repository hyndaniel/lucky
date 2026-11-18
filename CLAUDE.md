# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Enterprise Annual Party Lucky Draw System (年会受控抽奖系统) - A full-screen lottery/raffle tool with black-gold tech aesthetic. Features "controlled drawing" (guaranteed winners, banned lists, weighted probabilities) and offline operation with localStorage persistence.

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server (http://localhost:5173)
pnpm build            # TypeScript compile + Vite build (outputs single HTML file)
pnpm lint             # ESLint validation
pnpm preview          # Preview production build
pnpm test             # Run Vitest tests
```

## Architecture

**Stack**: React 19 + TypeScript + Tailwind CSS + Vite

**Routing**: Hash-based via Wouter for offline file:// protocol support
- `/` - Display page (lottery animation)
- `/admin` - Admin console (password-protected)

**State Management**: Zustand with localStorage persistence
- Store: `src/store/useStore.ts`
- Persistence key: `'lucky-draw-storage'` (version 9, `migrate` + `merge`/`normalizeSettings` fill missing fields)
- Multi-window sync via polling (Display: 500ms, Admin: 1000ms)
- Binary media (prize images, custom audio) lives in IndexedDB (`lucky-draw-media`, `src/lib/media-store.ts`), not localStorage; the store keeps only metadata. IndexedDB may be unavailable under `file://` in some browsers.

**Two-phase draw** (prize images roll first, then names): the round state machine lives in the store (`currentRound.phase`: idle → rollingPrizes → prizesRevealed → rollingNames → completed; actions `advanceRound`/`cancelRound`/`nextRound` return `ActionResult`). The rules (pools, dedup, validation reasons, drawing) live in pure functions in `src/lib/draw-engine.ts`; the store only calls them. Spec: `docs/plans/2026-11-17-two-phase-draw-spec.md`.

**Draw modes** (per round, `currentRound.drawMode`, set via `setRoundConfig` while idle only; default `image-then-name`): `advanceRound` branches on it. `image-then-name` is the full machine above. `image-only`: idle → rollingPrizes → completed (winners carry `imageId`, no person, no participant consumed). `name-only`: idle → rollingNames → completed (winners carry names, no image). All three end with effects + sound. Stats/export ignore image-only records. Spec: `docs/superpowers/specs/2026-11-17-layout-fonts-decouple-design.md`.

**Page layout & fonts** (settings model in `src/lib/types.ts`): `settings.welcomeLayout` / `prizeLayout` / `lotteryLayout` are `PageLayout` = `{ verticalAlign, title: TextBlockStyle, subtitle: TextBlockStyle, decor: PageDecor }`. `TextBlockStyle` = font family / size / color / align (`fontFamily ''` = follow global). `PageDecor` = one decoration image (IndexedDB key + 9-point `DecorPosition` + `widthPct`). The prize page renders a title only (no subtitle); the lottery page honours only top/bottom (`center` renders as top). Admin writes through `updatePageLayout(page, patch)`; the display only reads. `settings.fonts: UploadedFont[]` holds metadata for uploaded fonts (blob in IndexedDB, family `LuckyFont-<id>`); `moduleStyle` also has `shape` (square/rounded/circle) and `labelPosition` (above/below), `moduleScale` max 200.

**Core Business Logic** (`src/lib/`):
- `draw-engine.ts` - Image/name pools, dedup, `validatePrizeRollStart`, `drawImages`/`drawNames` (injectable rng)
- `lottery-logic.ts` - Weighted random selection, must-win prioritization, banned list filtering (used by `drawNames`)
- `grid-layout.ts` - `getGridColumns` / `computeModuleLayout` for the module grid
- `media-store.ts` - IndexedDB blob store; `image-processing.ts` - image compression (`prepareImageBlob`: maxSide 1920, quality 0.92)
- `fit-text.ts` - `fitFontSize` picks one shared font size for all module names (B2); `text-measure.ts` - canvas `createTextMeasurer` (returns null without canvas, caller then skips shrinking)
- `page-layout-style.ts` - pure PageLayout/TextBlockStyle/DecorPosition → inline CSS (display colors/positions must stay inline)
- `layout-editor.ts` - pure admin layout-editor logic: per-page editable sections, font options (follow-global + presets + uploaded), font upload validation (`.ttf/.otf/.woff/.woff2`, ≤15MB)
- `image-pool-filter.ts` - image-pool tab status derivation (available/used/frozen), stats, filtering, batch group helpers
- `grid-layout.ts` also owns `effectiveGap` and `MAX_OVERFLOW` (1.6): at scale > 1 the image area really enlarges and the grid may exceed the container by up to 1.6x
- `effects.ts` - Winner celebrations (confetti / stars / rockets / emoji); `sound.ts` - `soundEngine` singleton (audio must be unlocked by a click; sound plays only in the display window)
- `name-import.ts`, `serial.ts`, `winner-records.ts`, `defaults.ts` (defaults, `FONT_PRESETS`)

**Key Components**:
- `src/pages/DisplayPage.tsx` - Display page with real-time sync
- `src/pages/AdminPage.tsx` - Admin shell; assembles the tabs
- `src/components/display/DrawStage.tsx` - Two-phase draw stage (module grid); `PrizeModule.tsx` is the single module card, shared by the display and the admin style preview
- `src/components/admin/` - Admin tab components (`LiveControlPanel`, `ImagePoolTab`, `DisplayStyleTab`, `WinnersTab`, pickers)
- `src/components/RollingBoard.tsx` - Welcome/prize pages animation; applies each page's `PageLayout`
- `src/components/admin/PageLayoutEditor.tsx` - per-page layout editor (live-applied, no save button), rendered in `DisplayStyleTab`; `FontManager.tsx` - font upload/delete (delete resets references to follow-global)
- `src/hooks/useCustomFonts.ts` - registers uploaded fonts as `FontFace` on `document.fonts`; used by both admin and display

**CSS trap**: `src/index.css` overrides some Tailwind classes under `.hermes-display-board` with `!important`; display-facing colors must use inline styles.

**UI**: Shadcn/ui components in `src/components/ui/`

## Code Conventions

- Path aliases: Use `@/` prefix for imports (maps to `src/`)
- UI components: Import from `@/components/ui`
- Business logic: Place in `@/lib`
- Custom hooks: Place in `@/hooks`
- Types/interfaces: Define in `@/lib/types.ts`

## Build Output

Single-file HTML bundle in `/dist` - all CSS/JS/images inlined for offline USB distribution.

## Testing

Uses Vitest. Run with `pnpm test`.
