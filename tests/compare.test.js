import test from "node:test";
import assert from "node:assert/strict";
import { compareWords } from "../src/compare.js";

test("contractions and punctuation do not count as differences", () => {
  assert.equal(compareWords("I'll call you as soon as I arrive.", "I will call you as soon as I arrive").same, true);
});

test("a missing 'will' is reported", () => {
  const r = compareWords("I'll call you as soon as I arrive.", "I call you as soon as I arrive");
  assert.equal(r.same, false);
  assert.deepEqual(r.missing, ["will"]);
});

test("a different word is highlighted", () => {
  const r = compareWords("I'm running late.", "I'm running lake");
  assert.deepEqual(r.words.filter((w) => !w.ok).map((w) => w.word), ["lake"]);
});
