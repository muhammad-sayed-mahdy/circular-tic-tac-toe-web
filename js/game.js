/* Circular Tic Tac Toe - UI, game flow, undo/redo, AI orchestration. */
(function () {
  'use strict';
  var E = window.CTTT, Sfx = window.Sfx;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // ------------------------------------------------------------ geometry
  var R = [0, 24, 46, 68, 90];                 // ring boundaries
  var MID = [15.5, 35, 57, 79];                // where marks sit
  var MARK = [4.6, 6.4, 7.6, 8.6];             // mark half-size per ring

  // sector s spans angles (-90 + 45s) .. (-90 + 45(s+1)) degrees, counter-clockwise, cell 0 at the bottom
  function pt(radius, deg) {
    var a = deg * Math.PI / 180;
    return [+(radius * Math.cos(a)).toFixed(3), +(-radius * Math.sin(a)).toFixed(3)];
  }
  function cellCenter(c) {
    var ring = c >> 3, s = c & 7;
    return pt(MID[ring], -90 + 45 * s + 22.5);
  }
  function cellPath(c) {
    var ring = c >> 3, s = c & 7, a0 = -90 + 45 * s, a1 = a0 + 45;
    var ri = R[ring], ro = R[ring + 1];
    var o0 = pt(ro, a0), o1 = pt(ro, a1);
    if (ri === 0) return 'M0 0L' + o0 + 'A' + ro + ' ' + ro + ' 0 0 0 ' + o1 + 'Z';
    var i0 = pt(ri, a0), i1 = pt(ri, a1);
    return 'M' + o0 + 'A' + ro + ' ' + ro + ' 0 0 0 ' + o1 + 'L' + i1 + 'A' + ri + ' ' + ri + ' 0 0 1 ' + i0 + 'Z';
  }
  function linePath(li) {
    var cells = E.LINE_CELLS[li], p = cells.map(cellCenter);
    if (E.LINE_KIND[li] === 'ring') {
      var rad = MID[cells[0] >> 3];
      return 'M' + p[0] + 'A' + rad + ' ' + rad + ' 0 0 0 ' + p[3];
    }
    return 'M' + p[0] + 'L' + p[1] + 'L' + p[2] + 'L' + p[3];
  }
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function markNode(c, player, parent, extraClass) {
    var ctr = cellCenter(c), h = MARK[c >> 3];
    var g = el('g', { 'class': 'mark ' + (player ? 'o' : 'x') + (extraClass ? ' ' + extraClass : ''), transform: 'translate(' + ctr + ')' }, parent);
    g.style.setProperty('--sw', (h * 0.42).toFixed(2));
    if (player === 0) {
      el('path', { d: 'M' + (-h) + ' ' + (-h) + 'L' + h + ' ' + h, pathLength: 1 }, g);
      el('path', { d: 'M' + h + ' ' + (-h) + 'L' + (-h) + ' ' + h, pathLength: 1 }, g);
    } else {
      el('circle', { r: h, pathLength: 1 }, g);
    }
    return g;
  }
  /** Draw the empty board into an <svg>. Returns the cell <path> elements. */
  function drawBoard(svg, interactive) {
    svg.textContent = '';
    var gCells = el('g', { 'class': 'cells' }, svg), cells = [];
    for (var c = 0; c < E.N; c++) {
      var p = el('path', { d: cellPath(c), 'class': 'cell' + ((((c >> 3) + (c & 7)) & 1) ? ' shade' : ''), 'data-cell': c }, gCells);
      if (interactive) { p.setAttribute('tabindex', '0'); p.setAttribute('role', 'button'); }
      cells.push(p);
    }
    var gGrid = el('g', { 'class': 'grid' }, svg);
    for (var i = 1; i <= 4; i++) el('circle', { r: R[i] }, gGrid);
    for (var s = 0; s < 8; s++) { var q = pt(R[4], 45 * s); el('line', { x1: 0, y1: 0, x2: q[0], y2: q[1] }, gGrid); }
    return cells;
  }

  // ------------------------------------------------------------ state
  var LEVEL_DESC = {
    easy: 'Plays mostly at random and often misses threats. Good for learning the patterns.',
    medium: 'Always takes a win and blocks a three, but only plans one move ahead.',
    hard: 'Looks several moves ahead and sets up double threats.',
    master: 'Perfect play. Unbeatable when it moves first; if you move first a win exists, but one slip and it is gone.'
  };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('cttt.' + k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('cttt.' + k, v); } catch (e) {} }
  };
  var G = {
    mode: 'single', level: store.get('level', 'medium'), sidePref: store.get('side', 'x'),
    human: 0,            // which player the human is in single-player (0 = X, 1 = O)
    moves: [], ptr: 0,   // history + position in it (undo/redo)
    x: 0, o: 0, over: false, winner: -1, winLines: [],
    thinking: false, scored: null,
    scores: { x: 0, o: 0, d: 0 }
  };
  var boardSvg = $('#board'), cellEls, gMarks, gWin, gGhost, marks = {};
  var worker = null, reqId = 0, workerBusy = false, localSearcher = null, localProver = null, resultTimer = 0;

  function turn() { return G.ptr & 1; }
  function isHumanTurn() { return !G.over && !G.thinking && (G.mode === 'two' || turn() === G.human); }

  function recompute() {
    G.x = 0; G.o = 0;
    for (var i = 0; i < G.ptr; i++) { if (i & 1) G.o |= (1 << G.moves[i]); else G.x |= (1 << G.moves[i]); }
    var wx = E.allWins(G.x), wo = E.allWins(G.o);
    G.winLines = wx.concat(wo);
    G.winner = wx.length ? 0 : (wo.length ? 1 : -1);
    G.over = G.winner >= 0 || G.ptr === E.N;
    // keep the scoreboard consistent with undo/redo
    var res = !G.over ? null : (G.winner === 0 ? 'x' : (G.winner === 1 ? 'o' : 'd'));
    if (res !== G.scored) {
      if (G.scored) G.scores[G.scored]--;
      if (res) G.scores[res]++;
      G.scored = res;
    }
  }

  // ------------------------------------------------------------ rendering
  function playerName(p) {
    if (G.mode === 'two') return p === 0 ? 'Player 1' : 'Player 2';
    return p === G.human ? 'You' : 'Computer';
  }
  function render(animateLast) {
    var c, occ = G.x | G.o;
    // marks: remove stale, add missing
    for (c = 0; c < E.N; c++) {
      var want = (G.x >>> c) & 1 ? 0 : ((G.o >>> c) & 1 ? 1 : -1);
      var have = marks[c];
      if (have && have.player !== want) { have.node.remove(); delete marks[c]; have = null; }
      if (!have && want >= 0) {
        marks[c] = { player: want, node: markNode(c, want, gMarks, animateLast && G.moves[G.ptr - 1] === c ? 'pop' : '') };
      }
      cellEls[c].classList.toggle('taken', want >= 0);
      cellEls[c].setAttribute('aria-label', 'Ring ' + ((c >> 3) + 1) + ', sector ' + ((c & 7) + 1) + ', ' + (want < 0 ? 'empty' : (want ? 'O' : 'X')));
    }
    for (c in marks) marks[c].node.classList.toggle('last', !G.over && G.ptr > 0 && G.moves[G.ptr - 1] === +c);

    // winning lines
    gWin.textContent = '';
    var winCells = {};
    G.winLines.forEach(function (li) {
      E.LINE_CELLS[li].forEach(function (k) { winCells[k] = 1; });
      el('path', { d: linePath(li), 'class': 'winline ' + (G.winner ? 'o' : 'x'), pathLength: 1 }, gWin);
    });
    for (c = 0; c < E.N; c++) {
      cellEls[c].classList.toggle('win', !!winCells[c]);
      if (marks[c]) marks[c].node.classList.toggle('dim', G.winner >= 0 && !winCells[c]);
    }

    boardSvg.classList.toggle('locked', !isHumanTurn());
    boardSvg.classList.toggle('turn-o', turn() === 1);
    boardSvg.classList.toggle('over', G.over);
    if (!isHumanTurn()) gGhost.textContent = '';

    // panels
    $('#name-x').textContent = playerName(0);
    $('#name-o').textContent = playerName(1);
    $('#score-x').textContent = G.scores.x;
    $('#score-o').textContent = G.scores.o;
    $('#score-d').textContent = G.scores.d;
    $('#card-x').classList.toggle('active', !G.over && turn() === 0);
    $('#card-o').classList.toggle('active', !G.over && turn() === 1);
    $('#card-x').classList.toggle('winner', G.winner === 0);
    $('#card-o').classList.toggle('winner', G.winner === 1);

    var st = $('#status');
    st.classList.toggle('thinking', G.thinking);
    if (G.over) {
      st.textContent = G.winner < 0 ? 'Draw' : (playerName(G.winner) === 'You' ? 'You win!' : playerName(G.winner) + ' wins!');
    } else if (G.thinking) {
      st.innerHTML = '<span class="spinner"></span>Computer is thinking<span class="dots"><i>.</i><i>.</i><i>.</i></span>';
    } else if (G.mode === 'single') {
      st.innerHTML = 'Your turn &mdash; you are <b class="' + (G.human ? 'co">O' : 'cx">X') + '</b>';
    } else {
      st.innerHTML = playerName(turn()) + '&rsquo;s turn (<b class="' + (turn() ? 'co">O' : 'cx">X') + '</b>)';
    }

    $('#btn-undo').disabled = !canUndo();
    $('#btn-redo').disabled = !canRedo();
    $('#game-title').textContent = G.mode === 'two' ? 'Two players' : E.LEVELS[G.level].name;
  }

  function showResult() {
    clearTimeout(resultTimer);
    var box = $('#result');
    if (!G.over) { box.hidden = true; $(".controls").hidden = false; return; }
    var kind = G.winner >= 0 ? E.LINE_KIND[G.winLines[0]] : '';
    var how = { ring: 'a half ring', line: 'a line from the centre', spiral: 'a spiral' }[kind];
    var txt, sub;
    if (G.winner < 0) { txt = 'It’s a draw'; sub = 'The board is full and nobody made four in a row.'; }
    else if (G.mode === 'single' && G.winner === G.human) { txt = 'You win!'; sub = 'Four in a row with ' + how + '.'; }
    else if (G.mode === 'single') { txt = 'Computer wins'; sub = 'It completed ' + how + '. Undo to try another move.'; }
    else { txt = playerName(G.winner) + ' wins!'; sub = 'Four in a row with ' + how + '.'; }
    $('#result-text').textContent = txt;
    $('#result-text').className = 'result-text ' + (G.winner < 0 ? '' : (G.winner ? 'co' : 'cx'));
    $('#result-sub').textContent = sub;
    resultTimer = setTimeout(function () { box.hidden = false; $(".controls").hidden = true; }, 700);
  }

  function endEffects() {
    if (G.winner < 0) Sfx.play('draw');
    else if (G.mode === 'single' && G.winner !== G.human) Sfx.play('lose');
    else { Sfx.play('win'); confetti(); }
  }

  // ------------------------------------------------------------ moves
  function play(c, fromAI) {
    if (G.over || ((G.x | G.o) >>> c) & 1) { if (!fromAI) Sfx.play('error'); return; }
    G.moves.length = G.ptr;          // new move discards the redo branch
    G.moves.push(c); G.ptr++;
    Sfx.play(turn() === 1 ? 'placeX' : 'placeO');
    recompute();
    render(true);
    if (G.over) { endEffects(); showResult(); }
    else maybeAI();
  }

  function humanMovesBefore(ptr) {
    if (G.mode === 'two') return ptr;
    return G.human === 0 ? (ptr + 1) >> 1 : ptr >> 1;
  }
  function canUndo() { return humanMovesBefore(G.ptr) > 0 || (G.thinking && G.ptr > 0 && G.mode === 'single' && G.human === 0); }
  function canRedo() { return G.ptr < G.moves.length; }

  function undo() {
    if (!canUndo()) return;
    cancelAI();
    if (G.mode === 'two') G.ptr--;
    else { do { G.ptr--; } while (G.ptr > 0 && (G.ptr & 1) !== G.human); }
    Sfx.play('undo');
    recompute(); render(false); showResult();
    maybeAI();
  }
  function redo() {
    if (!canRedo()) return;
    cancelAI();
    G.ptr++;
    if (G.mode === 'single') {
      recompute();
      while (!G.over && G.ptr < G.moves.length && (G.ptr & 1) !== G.human) { G.ptr++; recompute(); }
    }
    Sfx.play('redo');
    recompute(); render(false); showResult();
    maybeAI();
  }

  function newGame() {
    cancelAI();
    if (G.mode === 'single') G.human = G.sidePref === 'random' ? (Math.random() < 0.5 ? 0 : 1) : (G.sidePref === 'o' ? 1 : 0);
    G.moves = []; G.ptr = 0; G.scored = null;
    recompute(); render(false); showResult();
    Sfx.play('start');
    maybeAI();
  }

  // ------------------------------------------------------------ AI
  function getWorker() {
    if (worker) return worker;
    try {
      worker = new Worker('js/ai-worker.js');
      worker.onmessage = function (ev) { workerBusy = false; onAIResult(ev.data); };
      worker.onerror = function () { worker = false; workerBusy = false; if (G.thinking) requestAI(); };
    } catch (e) { worker = false; }   // e.g. opened from file:// - fall back to the main thread
    return worker;
  }
  function maybeAI() {
    if (G.mode !== 'single' || G.over || turn() === G.human) return;
    G.thinking = true; render(false);
    requestAI();
  }
  var aiStart = 0;
  function requestAI() {
    var id = ++reqId, me = turn() ? G.o : G.x, opp = turn() ? G.x : G.o;
    aiStart = Date.now();
    var w = getWorker();
    if (w) { workerBusy = true; w.postMessage({ id: id, level: G.level, me: me, opp: opp }); }
    else {
      setTimeout(function () {
        if (id !== reqId) return;
        if (!localSearcher) { localSearcher = new E.Searcher(20); localProver = new E.Searcher(20); }
        var res = E.chooseMove(G.level, me, opp, localSearcher, localProver);
        onAIResult({ id: id, move: res.move });
      }, 60);
    }
  }
  function onAIResult(d) {
    if (d.id !== reqId) return;
    var wait = Math.max(0, 600 - (Date.now() - aiStart));   // never answer instantly; feels unnatural
    setTimeout(function () {
      if (d.id !== reqId) return;
      G.thinking = false;
      play(d.move, true);
    }, wait);
  }
  function cancelAI() {
    reqId++;
    G.thinking = false;
    if (worker && workerBusy) { worker.terminate(); worker = null; workerBusy = false; }
  }

  // ------------------------------------------------------------ board interaction
  function cellOf(target) {
    var v = target && target.getAttribute && target.getAttribute('data-cell');
    return v === null || v === undefined ? -1 : +v;
  }
  var hoverCell = -1;
  function setGhost(c) {
    if (c === hoverCell) return;
    hoverCell = c;
    gGhost.textContent = '';
    if (c >= 0 && isHumanTurn() && !(((G.x | G.o) >>> c) & 1)) {
      markNode(c, turn(), gGhost, 'ghost');
      Sfx.play('hover');
    }
  }
  function initBoard() {
    cellEls = drawBoard(boardSvg, true);
    gWin = el('g', { 'class': 'wins' }, boardSvg);
    gMarks = el('g', { 'class': 'marks' }, boardSvg);
    gGhost = el('g', { 'class': 'ghosts' }, boardSvg);

    boardSvg.addEventListener('click', function (ev) {
      var c = cellOf(ev.target);
      if (c >= 0 && isHumanTurn()) { hoverCell = -1; gGhost.textContent = ''; play(c, false); }
    });
    boardSvg.addEventListener('pointermove', function (ev) { if (ev.pointerType !== 'touch') setGhost(cellOf(ev.target)); });
    boardSvg.addEventListener('pointerleave', function () { setGhost(-1); });
    boardSvg.addEventListener('focusin', function (ev) { if (boardSvg.matches(':focus-within') && ev.target.matches(':focus-visible')) setGhost(cellOf(ev.target)); });
    boardSvg.addEventListener('keydown', function (ev) {
      var c = cellOf(ev.target); if (c < 0) return;
      var ring = c >> 3, s = c & 7, k = ev.key;
      if (k === 'Enter' || k === ' ') { ev.preventDefault(); if (isHumanTurn()) play(c, false); return; }
      if (k === 'ArrowLeft') s = (s + 7) & 7;        // around the ring
      else if (k === 'ArrowRight') s = (s + 1) & 7;
      else if (k === 'ArrowUp') ring = Math.min(3, ring + 1);   // outwards
      else if (k === 'ArrowDown') ring = Math.max(0, ring - 1); // inwards
      else return;
      ev.preventDefault();
      cellEls[ring * 8 + s].focus();
    });
  }

  // ------------------------------------------------------------ screens, menus, help
  function show(screen) {
    $$('.screen').forEach(function (n) { n.classList.toggle('active', n.id === 'screen-' + screen); });
    if (screen !== 'game') { cancelAI(); clearTimeout(resultTimer); $("#result").hidden = true; $(".controls").hidden = false; }
  }
  function syncSeg(id, value) {
    $$('#' + id + ' button').forEach(function (b) {
      var on = b.getAttribute('data-value') === value;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
    });
  }
  function syncSetup() {
    syncSeg('seg-level', G.level); syncSeg('seg-side', G.sidePref);
    $('#level-desc').textContent = LEVEL_DESC[G.level];
  }
  function syncSound() {
    $$('.sound-toggle').forEach(function (b) {
      b.textContent = Sfx.isEnabled() ? '🔊' : '🔇';
      b.title = Sfx.isEnabled() ? 'Sound on' : 'Sound off';
    });
  }
  function openHelp(open) {
    $('#help').hidden = !open;
    if (open) $('.modal-close').focus();
  }
  function startGame(mode) {
    G.mode = mode; G.scores = { x: 0, o: 0, d: 0 };
    show('game'); newGame();
  }

  var ACTIONS = {
    single: function () { syncSetup(); show('setup'); },
    two: function () { startGame('two'); },
    'start-single': function () { startGame('single'); },
    menu: function () { show('menu'); },
    help: function () { openHelp(true); },
    'close-help': function () { openHelp(false); },
    sound: function () { Sfx.toggle(); syncSound(); },
    undo: undo, redo: redo, restart: newGame
  };

  document.addEventListener('click', function (ev) {
    var seg = ev.target.closest && ev.target.closest('.seg button');
    if (seg) {
      var v = seg.getAttribute('data-value');
      if (seg.parentNode.id === 'seg-level') { G.level = v; store.set('level', v); }
      else { G.sidePref = v; store.set('side', v); }
      Sfx.play('click'); syncSetup(); return;
    }
    var b = ev.target.closest && ev.target.closest('[data-action]');
    if (b && !b.disabled) {
      var a = b.getAttribute('data-action');
      if (a !== 'undo' && a !== 'redo' && a !== 'restart' && a !== 'start-single' && a !== 'two') Sfx.play('click');
      ACTIONS[a]();
      return;
    }
    if (ev.target.id === 'help') openHelp(false);   // click on the backdrop
  });
  document.addEventListener('pointerover', function (ev) {
    var b = ev.target.closest && ev.target.closest('.btn, .seg button');
    if (b && !b.disabled && ev.pointerType === 'mouse' && !(ev.relatedTarget && b.contains(ev.relatedTarget))) Sfx.play('hover');
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { if (!$('#help').hidden) openHelp(false); return; }
    var inGame = $('#screen-game').classList.contains('active') && $('#help').hidden;
    var k = ev.key.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
    if (k === 'm' && !mod) { Sfx.toggle(); syncSound(); }
    if (!inGame) return;
    if (mod && k === 'z' && !ev.shiftKey) { ev.preventDefault(); undo(); }
    else if (mod && (k === 'y' || (k === 'z' && ev.shiftKey))) { ev.preventDefault(); redo(); }
    else if (k === 'n' && !mod) newGame();
  });

  // ------------------------------------------------------------ decorations
  function drawPatterns() {
    var demo = { ring: [16, 17, 18, 19], line: [1, 9, 17, 25], spiralL: [2, 11, 20, 29], spiralR: [2, 9, 16, 31] };
    $$('.mini').forEach(function (svg) {
      drawBoard(svg, false);
      var cells = demo[svg.getAttribute('data-pattern')], g = el('g', {}, svg);
      for (var li = 0; li < E.LINE_CELLS.length; li++) {
        if (E.LINE_CELLS[li].slice().sort().join() === cells.slice().sort().join()) el('path', { d: linePath(li), 'class': 'winline o static' }, g);
      }
      cells.forEach(function (c) { var p = cellCenter(c); el('circle', { cx: p[0], cy: p[1], r: 3 + (c >> 3) * 1.6, 'class': 'dot' }, g); });
    });
  }
  function drawLogo() {
    var svg = $('#logo-board');
    drawBoard(svg, false);
    var g = el('g', { 'class': 'marks' }, svg);
    [[26, 0], [18, 0], [10, 0], [2, 0], [20, 1], [29, 1], [13, 1], [7, 0], [23, 1], [16, 1]].forEach(function (m, i) {
      markNode(m[0], m[1], g, 'pop').style.animationDelay = (0.25 + i * 0.12) + 's';
    });
    el('path', { d: linePath(32 + 2), 'class': 'winline x', pathLength: 1, style: 'animation-delay:1.6s' }, svg);
  }

  var confettiRAF = 0;
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cv = $('#confetti'), c2 = cv.getContext('2d'), W = cv.width = innerWidth, H = cv.height = innerHeight;
    var cols = ['#5b8cff', '#ff5d7a', '#ffd166', '#4be3ac', '#c77dff'], ps = [], i, t0 = performance.now();
    for (i = 0; i < 130; i++) ps.push({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.45, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 3,
      s: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length]
    });
    cancelAnimationFrame(confettiRAF);
    (function frame(now) {
      var age = now - t0;
      c2.clearRect(0, 0, W, H);
      if (age > 2600) return;
      c2.globalAlpha = Math.min(1, (2600 - age) / 600);
      ps.forEach(function (p) {
        p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        c2.save(); c2.translate(p.x, p.y); c2.rotate(p.r); c2.fillStyle = p.c;
        c2.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c2.restore();
      });
      confettiRAF = requestAnimationFrame(frame);
    })(t0);
  }

  // ------------------------------------------------------------ boot
  initBoard(); drawPatterns(); drawLogo(); syncSound(); syncSetup();
  recompute(); render(false);
  getWorker();   // warm up
})();
