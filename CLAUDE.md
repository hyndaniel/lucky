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
- Persistence key: `'lucky-draw-storage'` (version 8, `migrate` + `merge`/`normalizeSettings` fill missing fields)
- Multi-window sync via polling (Display: 500ms, Admin: 1000ms)
- Binary media (prize images, custom audio) lives in IndexedDB (`lucky-draw-media`, `src/lib/media-store.ts`), not localStorage; the store keeps only metadata. IndexedDB may be unavailable under `file://` in some browsers.

**Two-phase draw** (prize images roll first, then names): the round state machine lives in the store (`currentRound.phase`: idle → rollingPrizes → prizesRevealed → rollingNames → completed; actions `advanceRound`/`cancelRound`/`nextRound` return `ActionResult`). The rules (pools, dedup, validation reasons, drawing) live in pure functions in `src/lib/draw-engine.ts`; the store only calls them. Spec: `docs/plans/2026-11-17-two-phase-draw-spec.md`.

**Core Business Logic** (`src/lib/`):
- `draw-engine.ts` - Image/name pools, dedup, `validatePrizeRollStart`, `drawImages`/`drawNames` (injectable rng)
- `lottery-logic.ts` - Weighted random selection, must-win prioritization, banned list filtering (used by `drawNames`)
- `grid-layout.ts` - `getGridColumns` / `computeModuleLayout` for the module grid
- `media-store.ts` - IndexedDB blob store; `image-processing.ts` - image compression
- `effects.ts` - Winner celebrations (confetti / stars / rockets / emoji); `sound.ts` - `soundEngine` singleton (audio must be unlocked by a click; sound plays only in the display window)
- `name-import.ts`, `serial.ts`, `winner-records.ts`, `defaults.ts` (defaults, `FONT_PRESETS`)

**Key Components**:
- `src/pages/DisplayPage.tsx` - Display page with real-time sync
- `src/pages/AdminPage.tsx` - Admin shell; assembles the tabs
- `src/components/display/DrawStage.tsx` - Two-phase draw stage (module grid); `PrizeModule.tsx` is the single module card, shared by the display and the admin style preview
- `src/components/admin/` - Admin tab components (`LiveControlPanel`, `ImagePoolTab`, `DisplayStyleTab`, `WinnersTab`, pickers)
- `src/components/RollingBoard.tsx` - Welcome/prize pages animation

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
