# Circular Tic Tac Toe

**Circular Tic Tac Toe** (also called round, radial or polar tic-tac-toe / noughts and crosses) is a free
browser game played on a ring-shaped board: **4 rings × 8 sectors = 32 cells**, and the first player to get
**four in a row** wins. Play against a computer opponent with four difficulty levels — including a
perfect-play **Master AI** — or against a friend on the same device.

It is a static web app written in plain **HTML, CSS and vanilla JavaScript**: no framework, no build step,
no dependencies, and it works offline.

> Built by **Claude Fable 5.2** (Anthropic), including the game, the AI, the solver that proves the
> game-theoretic result below, and this README.

## Features

- **Single player** vs AI — Easy, Medium, Hard, Master — as X, O or a random side
- **Two players** (hot-seat) on one device
- **Hints**: shows the best move for the player to move
- **Undo / redo**, with the scoreboard kept consistent
- **Three themes** — Chalk, Neon, Sunset — each with **light and dark mode**, following the system setting by default
- Main menu, how-to-play screen with pattern diagrams, confirmation before abandoning a game
- Synthesised **sound effects** (Web Audio, no audio files) with a mute toggle
- Hover previews, animated marks, highlighted winning line, confetti
- The AI runs in a **Web Worker**, with a "thinking" indicator, so the UI never freezes
- **Responsive** (phone, tablet, desktop, landscape) and **keyboard accessible**; respects reduced-motion

## Rules

Players take turns placing a mark on any empty cell; **X moves first**. There are **56 winning patterns**:

| Pattern | Count | Description |
| --- | --- | --- |
| Half ring | 32 | 4 neighbouring cells in the same ring (rings wrap around) |
| Line from the centre | 8 | all 4 cells of one sector |
| Spiral | 16 | one cell per ring, stepping one sector over each ring (8 left + 8 right) |

If all 32 cells fill up with no four in a row, the game is a draw.

Cells are numbered `ring * 8 + sector`, with ring 0 at the centre and cell 0 just right of the bottom spoke,
counting counter-clockwise.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Tab` / arrow keys, `Enter` | move between cells, place a mark |
| `Ctrl`+`Z` / `Ctrl`+`Y` | undo / redo (`Cmd` on macOS) |
| `Alt`+`H` | hint |
| `Alt`+`N` | new game |
| `Alt`+`M` | mute / unmute |
| `Esc` | close a dialog |

## Difficulty levels

| Level | How it plays |
| --- | --- |
| Easy | Mostly random; often misses wins and threats |
| Medium | Always takes a win and blocks a three, plans one move ahead, slightly noisy |
| Hard | Alpha-beta search several moves deep with threat extensions |
| Master | Perfect play: opening book + exhaustive forced-win proof search, with deep heuristic search as fallback |

### Is the Master AI beatable?

**Only if you move first — and then only with perfect play.**

Circular Tic Tac Toe is a **solved game: the first player can force a win** by opening on the innermost ring
(or, by symmetry, the outermost one).

- **Master playing X (first) is unbeatable.** It wins every game. This was checked exhaustively: Master's
  strategy was played against *every* possible sequence of replies (30,237 positions) with zero failures;
  the longest game lasts 29 plies and no move takes more than about 0.1 s.
- **Master playing O (second) can be beaten**, because a forced win exists for you. You have to find it
  yourself — after any inaccuracy Master defends, and it punishes a mistake with a forced win of its own.

You can reproduce the check: start a local server and open `tools/verify.html`.

## Run locally

Any static file server works. (Opening `index.html` straight from disk also works, but browsers block Web
Workers on `file://`, so the AI then runs on the main thread.)

Linux / macOS — uses whichever of python3, php, ruby, busybox or npx is installed:

```bash
sh serve.sh 8080
```

Windows — PowerShell only, nothing to install:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8080
```

Then open <http://localhost:8080/>.

## Project layout

```
index.html             page shell: menu, setup, game screens; help, settings and confirm dialogs
css/style.css          all styling; themes are blocks of CSS variables (data-theme / data-mode)
js/engine.js           rules, win lines, bitboard search, proof search, symmetries, difficulty levels
js/book.js             generated opening book for Master (101 positions)
js/ai-worker.js        runs the engine in a Web Worker
js/audio.js            synthesised sound effects
js/game.js             board rendering (SVG), game flow, undo/redo, hints, themes, menus
icon.png, manifest.webmanifest   app icon and web-app manifest
serve.sh / serve.ps1   tiny local static servers (Linux & macOS / Windows)
tools/verify.html      exhaustive check that Master always wins when moving first
tools/book.html        regenerates js/book.js
```

## How it works

**State.** A game is the list of moves played plus a pointer into that list. Whose turn it is, the board
and the winner are all derived from those two values, so undo and redo just move the pointer.

**Board.** One SVG with 32 annular-sector paths. A position is stored as two 32-bit *bitboards* (one bit per
cell, one integer per player); each of the 56 winning lines is a 4-bit mask, so a win test is a single `AND`.

**Search.** The engine is a negamax search with alpha-beta pruning, a transposition table and iterative
deepening. Blocking a three is forced and costs no search depth, and threat-making moves cost less than quiet
ones, so forcing sequences are followed far deeper than the nominal depth.

**Solving the game.** The proof search drops the heuristics and looks only for forced wins: threat moves are
free and the search budget counts quiet moves. A win score can only come from an actual four in a row, never
from a depth cut-off, so a reported win is a proof. Run from the empty board it shows that the first player
wins.

**Opening book.** The few early positions whose proof is too slow to repeat during play (101 of them) are
precomputed and stored under a canonical form across the board's 32 symmetries (8 rotations × mirror ×
inner/outer ring swap). Everything after the book is proven live in milliseconds.

**Themes.** Every colour is a CSS custom property. `<html data-theme="…" data-mode="light|dark">` selects a
palette; "System" mode follows `prefers-color-scheme` and updates live.

The source files are commented in detail — `js/engine.js` and `js/game.js` each start with an overview.

## Keywords

circular tic tac toe · round tic-tac-toe · radial / polar tic tac toe · noughts and crosses · four in a row ·
connect four variant · browser board game · JavaScript game · HTML5 game · no dependencies · minimax ·
alpha-beta pruning · bitboards · transposition table · solved game · game AI · Web Worker · SVG
