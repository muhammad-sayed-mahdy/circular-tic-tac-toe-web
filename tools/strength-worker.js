/*
 * Worker for tools/strength.html. Plays AI-vs-AI games and probes how predictable a level is.
 *
 * A "player spec" is { id, label, level } to use a level from engine.js as it is, or
 * { id, label, cfg } to try a custom set of options (same fields as the LEVELS table in engine.js).
 */
importScripts('../js/book.js', '../js/engine.js');
var E = CTTT, brains = {};

/** Register a spec's options in the engine's level table and return the key to play it with. */
function levelKey(spec) {
  if (spec.level) return spec.level;
  var key = '__' + spec.id;
  E.LEVELS[key] = Object.assign({ name: spec.label }, spec.cfg);
  return key;
}
/** One searcher + prover per player and seat, kept between games like the real AI worker does. */
function brain(tag) {
  return brains[tag] || (brains[tag] = { s: new E.Searcher(20), p: new E.Searcher(20) });
}
/**
 * Pick a move for `spec`. A spec with `mediumMoves` (0-1, used by the simulated players) plays a
 * Medium-level move with that probability and its own move otherwise.
 */
function choose(spec, me, opp, tag) {
  var b = brain(tag), key = spec.mediumMoves && Math.random() < spec.mediumMoves ? 'medium' : levelKey(spec);
  return E.chooseMove(key, me, opp, b.s, b.p).move;
}

/** Play one game; X (first player) is `xs`, O is `os`. */
function game(xs, os) {
  var b = [0, 0], n = 0, ms = [0, 0], cnt = [0, 0], moves = [];
  for (;;) {
    var side = n & 1, me = b[side], opp = b[1 - side], t0 = Date.now();
    var m = choose(side ? os : xs, me, opp, (side ? 'o:' : 'x:') + (side ? os.id : xs.id));
    ms[side] += Date.now() - t0; cnt[side]++;
    if (m < 0 || m > 31 || ((me | opp) >>> m) & 1) throw new Error('illegal move ' + m + ' by ' + (side ? os.id : xs.id));
    b[side] |= 1 << m; n++; moves.push(m);
    if (E.findWin(b[side]) >= 0) return { w: side ? 'O' : 'X', len: n, ms: ms, cnt: cnt, moves: moves };
    if (n === 32) return { w: 'D', len: n, ms: ms, cnt: cnt, moves: moves };
  }
}

/**
 * Replay the winner's moves from a won game against the level. True when the same fixed moves
 * win again, i.e. the level answered in a way that let the remembered line still work.
 */
function replayWins(moves, os) {
  var x = 0, o = 0;
  for (var j = 0; j < moves.length; j++) {
    if (j & 1) { o |= 1 << choose(os, o, x, 'p:' + os.id); if (E.findWin(o) >= 0) return false; continue; }
    if (((x | o) >>> moves[j]) & 1) return false;           // the level took that cell: the line is broken
    x |= 1 << moves[j];
    if (E.findWin(x) >= 0) return true;
  }
  return false;
}

/** True when O's reply `r` equals the expected reply, or gives a rotated/mirrored copy of the same position. */
function matches(x, o, r, expected) {
  return r === expected || E.canonical(x, o | (1 << r)).key === E.canonical(x, o | (1 << expected)).key;
}

onmessage = function (ev) {
  var d = ev.data, i, j;
  try {
    if (d.type === 'games') {
      var out = { X: 0, O: 0, D: 0, len: 0, ms: [0, 0], cnt: [0, 0] };
      for (i = 0; i < d.n; i++) {
        var g = game(d.x, d.o);
        out[g.w]++; out.len += g.len;
        out.ms[0] += g.ms[0]; out.ms[1] += g.ms[1]; out.cnt[0] += g.cnt[0]; out.cnt[1] += g.cnt[1];
      }
      postMessage({ id: d.id, ok: out });
    } else if (d.type === 'repeat') {
      // Ask the same question several times; sum of p^2 = chance two answers to one position agree.
      var total = 0;
      for (i = 0; i < d.positions.length; i++) {
        var pos = d.positions[i], counts = {};
        for (j = 0; j < d.k; j++) { var m = choose(d.spec, pos[0], pos[1], 'r:' + d.spec.id); counts[m] = (counts[m] || 0) + 1; }
        for (var c in counts) total += (counts[c] / d.k) * (counts[c] / d.k);
      }
      postMessage({ id: d.id, ok: { same: total / d.positions.length } });
    } else if (d.type === 'replay') {
      // A player who beat the level replays exactly the same moves: how often does it work again?
      var won = 0, tries = 0, okCount = 0, all = 0;
      while (won < d.lines && tries < d.lines * 8) {
        tries++;
        var gm = game(d.x, d.o);
        if (gm.w !== 'X') continue;
        won++;
        for (j = 0; j < d.k; j++) { all++; if (replayWins(gm.moves, d.o)) okCount++; }
      }
      postMessage({ id: d.id, ok: { ok: okCount, total: all } });
    } else if (d.type === 'trap') {
      // A trap is a fixed line (X, O, X, O, ...). For each of the level's turns, ask k times which reply
      // it picks in the line's position; then replay the whole line `walks` times and count how often the
      // level follows every reply. A reply giving a rotated or mirrored copy of the expected position counts.
      var hits = [], x = 0, o = 0, tag = 't:' + d.spec.id;
      for (j = 0; j < d.line.length; j++) {
        if ((j & 1) === 0) { x |= 1 << d.line[j]; continue; }
        var h = 0;
        for (i = 0; i < d.k; i++) if (matches(x, o, choose(d.spec, o, x, tag), d.line[j])) h++;
        hits.push(h);
        o |= 1 << d.line[j];
      }
      var walked = 0;
      for (i = 0; i < d.walks; i++) {
        var wx = 0, wo = 0, all = true;
        for (j = 0; j < d.line.length && all; j++) {
          if ((j & 1) === 0) { wx |= 1 << d.line[j]; continue; }
          all = matches(wx, wo, choose(d.spec, wo, wx, tag), d.line[j]);
          wo |= 1 << d.line[j];
        }
        if (all) walked++;
      }
      postMessage({ id: d.id, ok: { hits: hits, walked: walked } });
    }
  } catch (e) {
    postMessage({ id: d.id, err: String(e && e.message || e) });
  }
};
