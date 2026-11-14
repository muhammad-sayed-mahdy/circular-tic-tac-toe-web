/* Exhaustively checks that Master, moving first, wins against EVERY possible defence. */
importScripts('../js/book.js', '../js/engine.js');
onmessage = function () {
  var E = CTTT, S = new E.Searcher(18), P = new E.Searcher(22);
  var seen = new Set(), fails = 0, unproven = 0, maxPly = 0, maxMs = 0, t0 = Date.now();
  function visit(x, o, ply) {                       // Master (x) to move
    var k = x + ':' + o;
    if (seen.has(k)) return; seen.add(k);
    if (ply > maxPly) maxPly = ply;
    var t1 = Date.now(), r = E.chooseMove('master', x, o, S, P);
    maxMs = Math.max(maxMs, Date.now() - t1);
    if (!r.proven) { unproven++; return; }
    var x2 = x | (1 << r.move);
    if (E.findWin(x2) >= 0) return;                 // Master won
    var empty = ~(x2 | o);
    if (E.winCells(o, empty)) { fails++; return; }  // defender could win: must never happen
    var th = E.winCells(x2, empty);
    if (th & (th - 1)) return;                      // double threat: won next move
    var replies = th ? th : empty;                  // defender must block a single threat
    while (replies) { var c = E.ctz(replies); replies &= replies - 1; visit(x2, o | (1 << c), ply + 2); }
    if (seen.size % 2000 === 0) postMessage('checked ' + seen.size + ' positions...');
  }
  for (var r = 1; r < 32; r++) visit(1, 1 << r, 3);  // Master opened on cell 0 (other openings are symmetric)
  postMessage('DONE: positions=' + seen.size + ' failures=' + fails + ' unproven=' + unproven +
    ' longestGame=' + maxPly + ' plies, slowestMove=' + maxMs + 'ms, total=' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  postMessage(fails + unproven === 0 ? 'RESULT: Master always wins when it moves first.' : 'RESULT: verification FAILED.');
};
