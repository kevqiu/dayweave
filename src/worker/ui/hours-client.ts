/**
 * Opening hours, in the browser.
 *
 * `src/lib/hours.ts` is the source of these rules and the place they are
 * reasoned about. The browser needs the same answers again after every drag,
 * move and time change — all of them optimistic, so there is no server answer
 * to wait for — and there is no bundler between the two, so this is the same
 * logic as a script the page can run.
 *
 * `hours-client.test.ts` runs this script and checks it agrees with
 * `src/lib/hours.ts` on a table of weeks, days and times, so the two cannot
 * drift without a test going red.
 */
export const HOURS_CLIENT = String.raw`
(function (w) {
  var DAY = 1440;
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function weekdayOf(isoDate) {
    return new Date(isoDate + "T12:00:00Z").getUTCDay();
  }

  function clock(minutes) {
    var m = ((minutes % DAY) + DAY) % DAY;
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }

  function minutes(time) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(time == null ? "" : time).trim());
    if (!m) return null;
    var h = Number(m[1]);
    var mm = Number(m[2]);
    return h > 23 || mm > 59 ? null : h * 60 + mm;
  }

  function sessions(week, weekday) {
    var today = week[weekday] || [];
    var yesterday = week[(weekday + 6) % 7] || [];
    var tomorrow = week[(weekday + 1) % 7] || [];
    var carried = yesterday.length > 0 && yesterday[yesterday.length - 1][1] === DAY;
    return today
      .filter(function (piece, i) {
        return !(i === 0 && piece[0] === 0 && carried && !(piece[1] === DAY && today.length === 1));
      })
      .map(function (piece) {
        var next = tomorrow[0];
        if (piece[1] === DAY && next && next[0] === 0 && next[1] < DAY) return [piece[0], DAY + next[1]];
        return [piece[0], piece[1]];
      });
  }

  function dayLabel(week, weekday) {
    var today = week[weekday] || [];
    if (today.length === 1 && today[0][0] === 0 && today[0][1] === DAY) return "Open 24 hours";
    var own = sessions(week, weekday);
    if (own.length === 0) return "Closed";
    return own.map(function (p) { return clock(p[0]) + " – " + clock(p[1]); }).join(", ");
  }

  function checkHours(week, isoDate, time) {
    if (!week || !isoDate) return null;
    var weekday = weekdayOf(isoDate);
    var dayName = WEEKDAYS[weekday];
    var pieces = week[weekday] || [];
    var own = sessions(week, weekday);
    var label = dayLabel(week, weekday);
    var m = minutes(time);
    var openNow = m !== null && pieces.some(function (p) { return p[0] <= m && m < p[1]; });
    var base = {
      weekday: weekday, dayName: dayName, label: label,
      open: pieces.map(function (p) { return [p[0], p[1]]; }), fix: null,
    };
    var out = function (extra) { return Object.assign({}, base, extra); };

    if (own.length === 0 && label !== "Open 24 hours") {
      if (openNow) return out({ closed: true, ok: true, note: null });
      return out({ closed: true, ok: false, note: "closed " + dayName + "s" });
    }
    if (m === null || openNow) return out({ closed: false, ok: true, note: null });

    var later = own.find(function (p) { return p[0] > m; });
    if (later) return out({ closed: false, ok: false, note: "opens " + clock(later[0]), fix: clock(later[0]) });
    var last = own[own.length - 1];
    return out({ closed: false, ok: false, note: "closed after " + clock(last[1]), fix: clock(last[0]) });
  }

  function nearestOpenDay(week, days, current, time, today) {
    if (!week) return null;
    var from = days.find(function (d) { return d.id === current.dayId; });
    var origin = Date.parse((from ? from.date : today) + "T12:00:00Z");
    var same = function (city) {
      return !city || !current.city || city.trim().toLowerCase() === current.city.trim().toLowerCase();
    };
    var pool = days
      .filter(function (d) { return d.id !== current.dayId && d.date >= today && same(d.city); })
      .map(function (d) { return { day: d, distance: Math.abs(Date.parse(d.date + "T12:00:00Z") - origin) }; })
      .sort(function (a, b) { return a.distance - b.distance || (a.day.date < b.day.date ? -1 : 1); });

    if (minutes(time) !== null) {
      var exact = pool.find(function (entry) {
        var check = checkHours(week, entry.day.date, time);
        return check && check.ok;
      });
      if (exact) return { dayId: exact.day.id, date: exact.day.date, time: null };
    }
    for (var i = 0; i < pool.length; i++) {
      var own = sessions(week, weekdayOf(pool[i].day.date));
      if (own.length === 0) continue;
      return { dayId: pool[i].day.id, date: pool[i].day.date, time: minutes(time) === null ? null : clock(own[0][0]) };
    }
    return null;
  }

  w.__HOURS__ = {
    weekdayOf: weekdayOf,
    dayLabel: dayLabel,
    checkHours: checkHours,
    nearestOpenDay: nearestOpenDay,
  };
})(window);
`;
