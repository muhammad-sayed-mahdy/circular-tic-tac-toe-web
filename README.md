# Circular Tic Tac Toe

Tic Tac Toe on a circular board: **4 rings × 8 sectors = 32 cells**, first to get **four in a row** wins.
Play against the computer (four difficulty levels) or a friend on the same device.

It is a static web app — plain HTML, CSS and JavaScript, **no build step and no dependencies** — so it runs
from any static host, including GitHub Pages.

## Rules

Players take turns placing a mark on any empty cell; **X moves first**. There are **56** winning patterns:

| Pattern | Count | Description |
| --- | --- | --- |
| Half ring | 32 | 4 neighbouring cells in the same ring (rings wrap around) |
| Line from the centre | 8 | all 4 cells of one sector |
| Spiral | 16 | one cell per ring, stepping one sector over each ring (8 left + 8 right) |

If all 32 cells fill up with no four in a row, the game is a draw.

Cells are numbered `ring * 8 + sector`, with ring 0 at the centre and cell 0 just right of the bottom spoke,
counting counter-clockwise.

## Features

- **1 player** vs the computer — Easy, Medium, Hard, Master — playing as X, O or random
- **2 players** on one device
- **Undo / redo** (buttons or `Ctrl+Z` / `Ctrl+Y`); in 1-player mode an undo takes back your move and the reply
- Main menu, how-to-play screen with pattern diagrams, scoreboard
- Synthesised sound effects (Web Audio, no audio files) with a mute toggle (`M`)
- Hover previews, animated marks, highlighted winning line, confetti
- "Thinking" indicator; the AI runs in a Web Worker so the UI never freezes
- Responsive (phone, tablet, desktop, landscape), keyboard playable (arrows + Enter), respects reduced-motion
- Works offline once loaded; settings are remembered in `localStorage`

## Difficulty levels

| Level | How it plays |
| --- | --- |
| Easy | Mostly random; often misses wins and threats |
| Medium | Always takes a win and blocks a three, plans one move ahead, slightly noisy |
| Hard | Alpha-beta search several moves deep with threat extensions |
| Master | Perfect play: opening book + exhaustive forced-win proof search, with deep heuristic search as fallback |

### Can Master be beaten?

**Only if you move first — and then only with perfect play.**

The game is **solved: the first player can force a win** by opening on the innermost ring
(or, by symmetry, the outermost one). Consequences:

- **Master playing X (first) is unbeatable.** It wins every game. This was checked exhaustively: Master's
  strategy was played against *every* possible sequence of replies (30,237 positions) with zero failures;
  the longest game lasts 29 plies and no move takes more than about 0.1 s.
- **Master playing O (second) can be beaten**, because a forced win exists for you. You have to find it
  yourself, though — after any inaccuracy Master defends, and it will punish a mistake with a forced win of its own.

You can reproduce the check: start the local server and open `tools/verify.html`.

## Run locally

Any static file server works. The AI uses a Web Worker, which browsers block on `file://`, so opening
`index.html` directly still works but runs the AI on the main thread.

Windows, nothing to install:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8080
```

Or with Python / Node if you have them:

```bash
python -m http.server 8080
```

```bash
npx serve .
```

Then open <http://localhost:8080/>.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Choose the `main` branch and the `/ (root)` folder, then save.

The site appears at `https://<user>.github.io/<repo>/` after a minute. All paths are relative, so it works
from a sub-path with no configuration. The empty `.nojekyll` file tells Pages to serve the files as they are.

## Project layout

```
index.html           page shell: menu, setup, game and help screens
css/style.css        all styling and animations
js/engine.js         rules, win lines, bitboard search, proof search, symmetries, difficulty levels
js/book.js           generated opening book for Master (101 positions)
js/ai-worker.js      runs the engine in a Web Worker
js/audio.js          synthesised sound effects
js/game.js           board rendering (SVG), game flow, undo/redo, menus
serve.ps1            tiny static server for Windows (PowerShell)
tools/verify.html    exhaustive check that Master always wins when moving first
tools/book.html      regenerates js/book.js (run the server with -AllowSave)
```

## How the AI works

- A position is two 32-bit bitboards, one per player; the 56 winning lines are bit masks.
- **Search** is negamax with alpha-beta pruning, a transposition table and iterative deepening.
  Forced blocks cost no depth and threat-making moves cost less, so forcing sequences are followed deeply.
- **Proof search** (Master) drops the heuristics and looks only for forced wins: threat moves are free
  and the budget counts quiet moves. A win score is only ever produced by a real four in a row, so a
  reported win is a proof.
- **Opening book**: the few early positions whose proof is expensive are precomputed and stored
  under their canonical form across the board's 32 symmetries (8 rotations × mirror × inner/outer ring swap).
