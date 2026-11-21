import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => JSON.parse(fs.readFileSync(new URL("../" + p, import.meta.url)));

for (const lang of ["en", "sw"]) {
  test(`${lang} unit 1: five complete lessons with Kinyarwanda and mixed exercises`, () => {
    const unit = read(`content/${lang}/unit-01.json`);
    assert.equal(unit.lessons.length, 5);
    assert.equal(unit.canDo.length, unit.lessons.length);
    const ids = new Set();
    for (const l of unit.lessons) {
      assert(!ids.has(l.id), "unique id " + l.id);
      ids.add(l.id);
      assert(l.title && l.dialogue.length >= 2 && l.speak.length && l.useIt.prompt && l.pattern.explain.en);
      assert(l.pattern.explain.rw, "pattern needs Kinyarwanda explanation: " + l.id);
      assert(["everyday", "work"].includes(l.strand));
      assert(l.practice.length >= 4, "at least 4 practice items");
      const types = new Set(l.practice.map((q) => q.type || "choice"));
      assert(types.has("choice") && types.has("gap") && types.has("order") && types.has("fix"), "mixed types in " + l.id);
      for (const q of l.practice) {
        const type = q.type || "choice";
        assert(q.prompt, "prompt needed");
        if (type === "choice") {
          assert(q.options.length >= 3 && q.options[q.answer] !== undefined, q.prompt);
          assert.equal(new Set(q.options).size, q.options.length, "no duplicate options: " + q.prompt);
        } else if (type === "order") {
          assert(Array.isArray(q.chips) && q.chips.length >= 2 && q.answerText, q.prompt);
        } else if (type === "gap") {
          assert(q.prompt.includes("____") && q.answerText, q.prompt);
        } else if (type === "fix") {
          assert(q.wrong && q.answerText && q.wrong !== q.answerText, q.prompt);
        } else {
          assert.fail("unknown practice type: " + type);
        }
        assert(q.feedback.en && q.feedback.rw, "feedback en+rw for " + q.prompt);
      }
      for (const w of l.words) {
        assert(w.meaning && w.rw && w.example && w.example !== w.text, "word needs meaning, rw, and real example: " + w.text);
      }
      for (const x of l.dialogue) {
        assert((x.fr || x.en) && x.rw, "dialogue line needs translation and rw");
      }
      if (lang === "sw") {
        assert(l.dialogue.every((x) => x.reviewed === false), "Kiswahili stays draft until reviewed");
        assert(l.practice.every((x) => x.reviewed === false));
      }
    }
  });
}

test("level check: 30 items, 6 per scored section ordered easy to hard", () => {
  const q = read("content/levelcheck/en.json");
  assert.equal(q.length, 30);
  assert.equal(new Set(q.map((x) => x.id)).size, 30);
  const L = ["A1", "A2", "B1", "B2"];
  for (const s of ["Tenses", "Words", "Reading", "Listening"]) {
    const items = q.filter((x) => x.section === s);
    assert.equal(items.length, 6, s);
    for (let i = 1; i < items.length; i++) assert(L.indexOf(items[i].level) >= L.indexOf(items[i - 1].level), s + " order");
    for (const x of items) assert(x.options.length === 3 && x.options[x.answer] !== undefined);
    if (s === "Listening") assert(items.every((x) => x.audio));
  }
  assert(q.filter((x) => x.kind === "record").length === 3 && q.filter((x) => x.kind === "write").length === 3);
});
