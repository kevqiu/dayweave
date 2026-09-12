/**
 * The Plan view's arithmetic, in the browser.
 *
 * `src/lib/plan.ts` is the source of these rules and the place they are
 * reasoned about; this is the same arithmetic as a script the page can run,
 * because there is no bundler between the two (PLAN.md section 2 describes a
 * React app that does not exist yet).
 *
 * The duplication is deliberate and guarded: `plan-client.test.ts` runs this
 * script and checks it agrees with `src/lib/plan.ts` on a table of inputs, so
 * the two cannot drift without a test going red.
 */
export const PLAN_CLIENT = String.raw`
(function (w) {
  var PX_PER_HOUR = 44;
  var ROW_HEIGHT = 46;
  var FREE_SLOT = 31;
  var FREE_MIN_GAP = 75;

  function minutesOf(time) {
    if (!time) return null;
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
    if (!m) return null;
    var h = Number(m[1]);
    var mins = Number(m[2]);
    if (h > 23 || mins > 59) return null;
    return h * 60 + mins;
  }

  function formatClock(minutes) {
    var wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
    var h = Math.floor(wrapped / 60);
    var m = wrapped % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function formatFree(minutes) {
    if (minutes < 60) return minutes + " min free";
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return m === 0 ? h + " h free" : h + " h " + m + " free";
  }

  function planRows(stops) {
    return stops.map(function (stop, i) {
      var start = minutesOf(stop.time);
      var next = stops[i + 1];
      var nextStart = next ? minutesOf(next.time) : null;
      var gap = start !== null && nextStart !== null ? nextStart - start : null;
      var offer = gap !== null && gap >= FREE_MIN_GAP && stop.status !== "visited";
      return {
        id: stop.id,
        height: offer ? ROW_HEIGHT + FREE_SLOT : ROW_HEIGHT,
        free: offer ? formatFree(gap) : null,
        freeAt: offer ? formatClock(start + 60) : null,
      };
    });
  }

  function gridSpan(times) {
    var from = 8 * 60;
    var to = 23 * 60;
    times.forEach(function (time) {
      var at = minutesOf(time);
      if (at === null) return;
      if (at < from) from = Math.floor(at / 60) * 60;
      if (at + 60 > to) to = Math.min(24 * 60, Math.ceil((at + 60) / 60) * 60);
    });
    return { from: from, to: to, height: ((to - from) * PX_PER_HOUR) / 60 };
  }

  function gridY(span, minutes) {
    return ((minutes - span.from) * PX_PER_HOUR) / 60;
  }

  function gridTime(span, y) {
    var raw = span.from + (y * 60) / PX_PER_HOUR;
    var snapped = Math.round(raw / 15) * 15;
    return Math.min(span.to, Math.max(span.from, snapped));
  }

  function cardBox(span, start, end, hasSubtitle) {
    var from = minutesOf(start);
    if (from === null) return null;
    var until = minutesOf(end);
    var natural = hasSubtitle ? 38 : 30;
    var height = until !== null && until > from
      ? Math.max(natural, ((until - from) * PX_PER_HOUR) / 60)
      : natural;
    return { top: gridY(span, from), height: height };
  }

  function hourLines(span) {
    var out = [];
    for (var m = span.from + 60; m < span.to; m += 60) out.push(gridY(span, m));
    return out;
  }

  function hourLabels(span) {
    var out = [];
    var firstEven = span.from % 120 === 0 ? span.from : span.from + 60;
    for (var m = firstEven; m <= span.to; m += 120) {
      out.push({ at: gridY(span, m), label: formatClock(m) });
    }
    return out;
  }

  w.__PLAN__ = {
    PX_PER_HOUR: PX_PER_HOUR,
    minutesOf: minutesOf,
    formatClock: formatClock,
    formatFree: formatFree,
    planRows: planRows,
    gridSpan: gridSpan,
    gridY: gridY,
    gridTime: gridTime,
    cardBox: cardBox,
    hourLines: hourLines,
    hourLabels: hourLabels,
  };
})(window);
`;
