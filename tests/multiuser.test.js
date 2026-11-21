import test from "node:test";
import assert from "node:assert/strict";
import { progressKey, recordingKey, mergeState } from "../src/sync.js";

test("progress and recording keys are isolated per student uid", () => {
  assert.equal(progressKey(null), "progress:guest");
  assert.equal(progressKey("uid-alice"), "progress:uid-alice");
  assert.equal(progressKey("uid-bob"), "progress:uid-bob");
  assert.notEqual(recordingKey("uid-alice", "lesson-en-u01-l01-0"), recordingKey("uid-bob", "lesson-en-u01-l01-0"));
  assert.equal(recordingKey(null, "task-en"), "guest:task-en");
});

test("mergeState combines cross-device work without losing either device's progress", () => {
  const base = { name: "", language: "en", explain: "en", swVoice: false, completed: { en: [], sw: [] } };
  const phone = {
    name: "Aline",
    completed: { en: ["en-u01-l01"], sw: [] },
    reviews: [{ id: "r1", box: 1, updated: 10 }],
    phrasebook: [{ id: "p1", answer: "Habari", prompt: "Hi", updated: 10 }],
    writing: [{ id: "w1", lesson: "en-u01-l01", text: "Sorry I am late", updated: 10 }],
    tasks: { en: { answer: "Phone note", updated: 20 } },
    reviewLog: { date: "2026-11-21", reviewed: 3, fresh: 2 },
    days: 2,
    lastDay: "2026-11-20",
    updated: 20,
  };
  const laptop = {
    name: "Aline K.",
    completed: { en: ["en-u01-l01", "en-u01-l02"], sw: ["sw-u01-l01"] },
    reviews: [{ id: "r1", box: 2, updated: 30 }, { id: "r2", box: 0, updated: 25 }],
    phrasebook: [{ id: "p2", answer: "Asante", prompt: "Thanks", updated: 25 }],
    writing: [],
    tasks: { en: { answer: "Old note", updated: 5 } },
    reviewLog: { date: "2026-11-21", reviewed: 5, fresh: 2 },
    days: 3,
    lastDay: "2026-11-21",
    updated: 30,
  };

  const merged = mergeState(phone, laptop, base);
  assert.equal(merged.name, "Aline K.");
  assert.deepEqual(merged.completed.en.sort(), ["en-u01-l01", "en-u01-l02"]);
  assert.deepEqual(merged.completed.sw, ["sw-u01-l01"]);
  assert.equal(merged.reviews.find((r) => r.id === "r1").box, 2);
  assert.equal(merged.reviews.length, 2);
  assert.equal(merged.phrasebook.length, 2);
  assert.equal(merged.writing.length, 1);
  assert.equal(merged.tasks.en.answer, "Phone note");
  assert.equal(merged.reviewLog.reviewed, 5);
  assert.equal(merged.days, 3);
  assert.equal(merged.lastDay, "2026-11-21");
});
