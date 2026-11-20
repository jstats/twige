import test from "node:test";
import assert from "node:assert/strict";
import { add, grade, dueToday, logReview, mergeLists, addDays, day, DAILY_LIMIT, NEW_LIMIT } from "../src/srs.js";

const item = (id, date = "2026-11-20") => add({ id, prompt: "p", answer: "a" }, date, 1);

test("a new item (e.g. a wrong practice answer) is due the next day, not today", () => {
  const x = item("x");
  assert.equal(dueToday([x], "2026-11-20").length, 0);
  assert.equal(dueToday([x], "2026-11-21").length, 1);
});

test("Didn't know -> box 1, due tomorrow; Easy -> next box; With effort -> same interval", () => {
  const x = item("x");
  assert.equal(grade(x, "again", "2026-11-21").due, "2026-11-22");
  const e = grade(x, "easy", "2026-11-21");
  assert.equal(e.box, 1);
  assert.equal(e.due, "2026-11-24");
  const e2 = grade(e, "effort", "2026-11-24");
  assert.equal(e2.box, 1);
  assert.equal(e2.due, "2026-11-27");
  let y = x;
  for (const d of ["2026-11-21", "2026-11-24", "2026-12-01", "2026-12-15", "2027-01-14", "2027-03-15"]) y = grade(y, "easy", d);
  assert.equal(y.box, 5, "never goes past the 60-day box");
});

test("at most 8 new items a day", () => {
  const many = Array.from({ length: 15 }, (_, i) => item("n" + i));
  assert.equal(dueToday(many, "2026-11-21").length, NEW_LIMIT);
  let log;
  for (let i = 0; i < NEW_LIMIT; i++) log = logReview(log, many[i], "2026-11-21");
  assert.equal(dueToday(many.slice(NEW_LIMIT), "2026-11-21", log).length, 0, "overflow waits for tomorrow");
  assert.equal(dueToday(many.slice(NEW_LIMIT), "2026-11-22", log).length, 7);
});

test("at most 20 reviews a day in total", () => {
  const seen = Array.from({ length: 25 }, (_, i) => ({ ...item("s" + i), reps: 1 }));
  assert.equal(dueToday(seen, "2026-11-21").length, DAILY_LIMIT);
  let log;
  for (let i = 0; i < 20; i++) log = logReview(log, seen[i], "2026-11-21");
  assert.equal(dueToday(seen.slice(20), "2026-11-21", log).length, 0);
});

test("dates are local calendar days and roll over month ends", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(day(new Date(2026, 10, 20, 1, 30)), "2026-11-20", "1:30 a.m. local is still the 20th");
});

test("syncing keeps the most recently updated copy of each item", () => {
  const old = { id: "a", box: 0, updated: 1 }, newer = { id: "a", box: 3, updated: 5 };
  assert.equal(mergeLists([newer], [old])[0].box, 3);
  assert.equal(mergeLists([old], [newer])[0].box, 3);
});
