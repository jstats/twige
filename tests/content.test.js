import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => JSON.parse(fs.readFileSync(new URL("../" + p, import.meta.url)));

for (const lang of ["en", "sw"]) {
  test(`${lang} unit 1: five complete lessons`, () => {
    const unit = read(`content/${lang}/unit-01.json`);
    assert.equal(unit.lessons.length, 5);
    assert.equal(unit.canDo.length, unit.lessons.length);
    const ids = new Set();
    for (const l of unit.lessons) {
      assert(!ids.has(l.id), "unique id " + l.id);
      ids.add(l.id);
      assert(l.title && l.dialogue.length >= 2 && l.speak.length && l.useIt.prompt && l.pattern.explain.en);
      assert(["everyday", "work"].includes(l.strand));
      assert(l.practice.length >= 4, "at least 4 practice items");
      for (const q of l.practice) {
        assert(q.prompt && q.options.length >= 3 && q.options[q.answer] !== undefined, q.prompt);
        assert.equal(new Set(q.options).size, q.options.length, "no duplicate options: " + q.prompt);
        assert(q.feedback.en, "feedback for " + q.prompt);
      }
      for (const w of l.words) {
        assert(w.meaning && w.example && w.example !== w.text, "word needs a meaning and a real example: " + w.text);
      }
      for (const x of l.dialogue) assert(x.fr || x.en, "dialogue line needs a translation");
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
