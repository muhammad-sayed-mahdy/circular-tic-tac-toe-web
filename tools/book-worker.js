/* Builds js/book.js: the first player's winning replies for every position that is too
   expensive to prove on the fly. Run via tools/book.html (takes a few minutes). */
importScripts('../js/engine.js');
onmessage = function (ev) {
  var E = CTTT, THRESH = ev.data.thresh || 200000;
  var cheap = new E.Searcher(20), big = new E.Searcher(23);
  var book = {}, seen = {}, count = 0, cheapCount = 0, t0 = Date.now(), maxPly = 0;
  function gen(x, o, ply) {            // first player to move in a position proven to be a win
    var cn = E.canonical(x, o);
    if (seen[cn.key]) return; seen[cn.key] = 1;
    cheap.clear();
    if (cheap.prove(x, o, { nodeLimit: THRESH })) { cheapCount++; return; }   // found quickly at play time
    var pr = big.prove(x, o, {});
    if (!pr) { postMessage({ log: 'FAILED to prove ' + cn.key }); return; }
    book[cn.key] = E.SYM[cn.g][pr.move]; count++;
    if (ply > maxPly) maxPly = ply;
    if (count % 10 === 0) postMessage({ log: 'entries=' + count + ' cheap=' + cheapCount + ' maxPly=' + maxPly + ' s=' + Math.round((Date.now() - t0) / 1000) });
    var x2 = x | (1 << pr.move), empty = ~(x2 | o), th = E.winCells(x2, empty);
    if ((th & (th - 1)) !== 0) return;                 // double threat: already won
    var replies = th !== 0 ? th : empty;
    while (replies !== 0) { var r = E.ctz(replies); replies &= replies - 1; gen(x2, o | (1 << r), ply + 2); }
  }
  for (var r = 1; r < 32; r++) { gen(1, 1 << r, 2); postMessage({ log: 'root reply ' + r + ' done, entries=' + count }); }
  postMessage({ log: 'DONE entries=' + count + ' cheap=' + cheapCount + ' maxPly=' + maxPly + ' s=' + Math.round((Date.now() - t0) / 1000), book: book });
};
