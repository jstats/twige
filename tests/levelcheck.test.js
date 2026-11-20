import test from "node:test";
import assert from "node:assert/strict";
import { scoreSection, shouldStop, results } from "../src/levelcheck.js";

const LV = ["A1", "A2", "B1", "B1", "B2", "B2"];
const answers = (pattern) => pattern.map((c, i) => ({ section: "Tenses", level: LV[i], correct: c }));

test("all correct is B2; B2 items wrong but B1 strong is B1", () => {
  assert.equal(scoreSection(answers([true, true, true, true, true, true])), "B2");
  assert.equal(scoreSection(answers([true, true, true, true, false, false])), "B1");
});

test("weak above A2 gives A2 or A1", () => {
  assert.equal(scoreSection(answers([true, true, false, false, false, false])), "A2");
  assert.equal(scoreSection(answers([true, true, true, false, false, true])), "B1");
  assert.equal(scoreSection(answers([true, false, false, false, false, false])), "A1");
});

test("two wrong in a row stops the section", () => {
  assert.equal(shouldStop(answers([true, false])), false);
  assert.equal(shouldStop(answers([true, false, false])), true);
});

test("recorded and written answers are not auto-scored", () => {
  assert.equal(scoreSection([{ section: "Speaking", level: "B1", correct: null }]), "Awaiting review");
  const r = results([...answers([true, true, true, true, true, true]), { section: "Writing", level: "B1", correct: null }]);
  assert.equal(r.Tenses, "B2");
  assert.equal(r.Writing, "Awaiting review");
});
