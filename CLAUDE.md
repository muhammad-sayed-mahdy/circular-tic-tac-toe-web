# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Circular Tic Tac Toe: a static browser game (4 rings × 8 sectors = 32 cells, four in a row wins, 56 win lines) with an AI that includes a perfect-play "Master" level. Plain HTML/CSS/vanilla JS — **no framework, no build step, no package manager, no dependencies**. Deployed as-is to GitHub Pages (`.nojekyll`). `README.md` documents rules, difficulty levels and the solved-game result; keep it in sync when behaviour changes.

## Running

Serve the repo root with any static server (Web Workers are blocked on `file://`, so the AI falls back to the main thread there):

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8080
```

```bash
sh serve.sh 8080
```

`.claude/launch.json` defines a preview config `cttt` (port 8137, `serve.ps1 -AllowSave`).

There is no lint and no unit-test suite. Engine checks are browser pages under `tools/`, run through the dev server:

- `tools/verify.html` — exhaustively plays Master (moving first) against every defence; must report `failures=0 unproven=0`. Run after any change to search, proof search, `LEVELS.master`, or the book.
- `tools/book.html` — regenerates `js/book.js` (takes minutes; `?thresh=N` sets the node limit below which a position is considered cheap enough to prove live). With `serve.ps1 -AllowSave` it writes the file via `POST /__save-book`; otherwise it offers a download. Never hand-edit `js/book.js`.
- `tools/strength.html` — compares every level in `LEVELS` against simulated players from both seats, plus predictability and optional trap lines (1–32 board numbering). Extra `LEVELS`-style configs and trap lines are entered on the page and kept in the URL; Master uses a shorter clock unless "full thinking time" is ticked. Run it after changing a level.

## Architecture

**Script loading, no modules.** `index.html` loads `js/book.js` → `js/engine.js` → `js/audio.js` → `js/game.js` as classic scripts. Each file is an IIFE that publishes one global: `self.CTTT_BOOK`, `CTTT` (engine), `Sfx` (audio). `engine.js` must stay worker-compatible (no DOM, uses `self`) because the same file is loaded via `importScripts` by `js/ai-worker.js` and by the `tools/*-worker.js` files.

**Engine (`js/engine.js`).** Cell index = `ring * 8 + sector` (ring 0 = centre); UI shows `cell + 1`. A position is two 32-bit int bitboards; search functions always take `(me, opp)` with `me` = side to move, and scores are from the mover's view (`WIN - ply`, `|score| > WIN_T` = proven). `Searcher` has:
- `search()` — negamax alpha-beta + transposition table; blocking a three costs no depth, threat moves cost less than quiet ones.
- `bestMove()` — iterative deepening with heuristic eval (Medium/Hard, Master fallback).
- `prove()` — same search with heuristics off; only returns a move for a genuine forced win.

`chooseMove(level, me, opp, searcher, prover)` is the single entry point and dispatches via the `LEVELS` table (`easy` is special-cased random-ish play; `hint` reuses Master's brain with shorter clocks). Master: random inner/outer-ring opening → opening book (as first player) → `prove()` → `bestMove()`. Book keys are canonical forms over the board's 32 symmetries (`SYM`/`canonical()`); the book stores moves in canonical orientation and `bookMove()` maps them back with `SYM_INV`. Any change that alters which positions are cheap to prove, or the symmetry/key scheme, requires regenerating the book and re-running verify.

**UI (`js/game.js`).** Game state is only `G.moves` + `G.ptr`; `recompute()` derives turn, bitboards and winner, so undo/redo just move the pointer. Board is a single SVG (200×200 viewBox centred at origin) with one annular-sector path per cell. AI/hint requests go to the worker tagged with an id; stale replies (after undo/new game) are dropped by id. Three `<main>` screens (menu/setup/game) toggled by `show()`, plus modal dialogs. Settings persist in `localStorage` under the `cttt.` prefix via a never-throwing wrapper.

**Theming.** All colours are CSS custom properties selected by `<html data-theme="chalk|neon|comic" data-mode="light|dark">`. An inline script in `index.html`'s `<head>` applies saved theme/mode before first paint; adding a theme means touching that script, the `css/style.css` variable blocks (light + dark), the theme cards in `index.html`, and `game.js`.

**Service worker (`sw.js`).** Network-first, cache fallback. The `CORE` list must include every file the game needs offline — update it when adding/renaming runtime files. Bump `CACHE` (`cttt-vN`) only if old cached entries must be purged.

## Conventions

- ES5-style JS (`var`, function expressions, `'use strict'` IIFEs) throughout; match it.
- Files carry detailed header/overview comments (`engine.js`, `game.js`); keep them accurate when changing behaviour.
- `*.sh` must keep LF endings (`.gitattributes`).
