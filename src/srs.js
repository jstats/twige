// Spaced review scheduler. Pure functions only (unit-tested in tests/srs.test.js).
// Boxes: 1, 3, 7, 14, 30, 60 days.
// "again" (Didn't know) -> box 1, due tomorrow. "effort" -> same box, same interval. "easy" -> next box.
// Daily caps: at most 20 items reviewed per day, of which at most 8 are new; overflow waits for the next day.
export const INTERVALS = [1, 3, 7, 14, 30, 60];
export const DAILY_LIMIT = 20;
export const NEW_LIMIT = 8;

const pad = (n) => String(n).padStart(2, "0");
// Local calendar date (Nairobi time on her phone), not UTC.
export const day = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const addDays = (date, n) => {
  const [y, m, d] = date.split("-").map(Number);
  return day(new Date(y, m - 1, d + n, 12));
};

export function add(item, date = day(), now = Date.now()) {
  return {
    id: item.id,
    prompt: item.prompt,
    answer: item.answer,
    lang: item.lang || "en",
    tag: item.tag || "everyday",
    box: 0,
    reps: 0,
    due: addDays(date, 1),
    updated: now,
  };
}

export function grade(item, rating, date = day(), now = Date.now()) {
  const box = rating === "again" ? 0 : rating === "easy" ? Math.min(INTERVALS.length - 1, item.box + 1) : item.box;
  return { ...item, box, reps: (item.reps || 0) + 1, due: addDays(date, INTERVALS[box]), updated: now };
}

const freshLog = (log, date) => (log && log.date === date ? log : { date, reviewed: 0, fresh: 0 });

// Items to show today, respecting both daily caps.
export function dueToday(items, date = day(), log) {
  const l = freshLog(log, date);
  const ready = items.filter((i) => i.due <= date).sort((a, b) => a.due.localeCompare(b.due));
  const seen = ready.filter((i) => (i.reps || 0) > 0);
  const fresh = ready.filter((i) => !(i.reps || 0)).slice(0, Math.max(0, NEW_LIMIT - l.fresh));
  return [...seen, ...fresh].slice(0, Math.max(0, DAILY_LIMIT - l.reviewed));
}

export function logReview(log, item, date = day()) {
  const l = freshLog(log, date);
  return { date, reviewed: l.reviewed + 1, fresh: l.fresh + ((item.reps || 0) ? 0 : 1) };
}

export function merge(items, item) {
  return [...items.filter((i) => i.id !== item.id), item];
}

// Combine two lists by id, keeping the most recently updated copy (used when syncing devices).
export function mergeLists(a = [], b = []) {
  const out = new Map();
  for (const x of [...a, ...b]) {
    const prev = out.get(x.id);
    if (!prev || (x.updated || 0) >= (prev.updated || 0)) out.set(x.id, x);
  }
  return [...out.values()];
}
