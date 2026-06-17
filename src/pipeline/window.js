'use strict';

/**
 * Recency window for a morning brief. The brief should cover only "yesterday
 * through now" — a tight, well-defined window — not a loose multi-day rolling
 * lookback. Monday extends back over the weekend (to Friday) so nothing is
 * missed across non-trading days.
 *
 * Modes:
 *   - calendar (default): start = 00:00 of the previous business day in `timeZone`.
 *   - rolling: pass `hours` (e.g. BRIEF_WINDOW_HOURS=24) for a simple now-Nh window.
 */
const DAY = 86400000;

function tzParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const o = {};
  for (const p of fmt.formatToParts(date)) if (p.type !== 'literal') o[p.type] = p.value;
  return o;
}

/** ms to add to a UTC instant to get wall-clock time in `timeZone`, at that instant. */
function tzOffsetMs(date, timeZone) {
  const p = tzParts(date, timeZone);
  const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asIfUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/** UTC instant of local midnight for calendar date y-m-d in `timeZone`. */
function tzMidnightUTC(y, m, d, timeZone) {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  return guess - tzOffsetMs(new Date(guess), timeZone);
}

function computeWindow({ now = new Date(), timeZone = 'America/New_York', hours = null } = {}) {
  const end = +now;
  if (hours != null && hours !== '') {
    const h = Number(hours);
    return { windowStart: end - h * 3600000, windowEnd: end, timeZone, label: `last ${h}h` };
  }
  const p = tzParts(now, timeZone);
  const y = +p.year, m = +p.month, d = +p.day;
  const todayMidnight = tzMidnightUTC(y, m, d, timeZone);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun .. 6=Sat
  const back = dow === 1 ? 3 : dow === 0 ? 2 : dow === 6 ? 1 : 1; // Mon->Fri, weekend->Fri, else yesterday
  const windowStart = todayMidnight - back * DAY;
  return { windowStart, windowEnd: end, timeZone, label: rangeLabel(windowStart, end, timeZone) };
}

function rangeLabel(start, end, timeZone) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' });
  return `${f.format(new Date(start))} → ${f.format(new Date(end))} (${timeZone})`;
}

/** Drop items outside [windowStart, now+1h]. Undated items dropped unless dropUndated===false. */
function filterWindow(items, ctx) {
  if (ctx.windowStart == null) return items;
  const end = ctx.now + 3600000; // small tolerance for clock skew / freshly published
  return items.filter((it) => {
    if (!it.publishedAt) return ctx.dropUndated === false;
    const t = +new Date(it.publishedAt);
    return t >= ctx.windowStart && t <= end;
  });
}

module.exports = { computeWindow, filterWindow };
