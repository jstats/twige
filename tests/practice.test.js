import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAnswer, stableShuffle, checkPracticeAnswer, fullSentenceForReview } from "../src/practice.js";

test("choice, gap, order, and fix normalization and scoring", () => {
  assert.equal(checkPracticeAnswer({ type: "choice", options: ["a", "b", "c"], answer: 1 }, 1), true);
  assert.equal(checkPracticeAnswer({ type: "choice", options: ["a", "b", "c"], answer: 1 }, 0), false);

  const gapQ = { type: "gap", prompt: "I ____ there by 10:30.", answerText: "'ll be", accept: ["will be"] };
  assert.equal(checkPracticeAnswer(gapQ, "I'll") , false);
  assert.equal(checkPracticeAnswer(gapQ, "will be."), true);
  assert.equal(checkPracticeAnswer(gapQ, "’ll be"), true);
  assert.equal(fullSentenceForReview(gapQ), "I'll be there by 10:30.");

  const orderQ = { type: "order", chips: ["I'll", "call", "you", "soon"], answerText: "I'll call you soon." };
  assert.equal(checkPracticeAnswer(orderQ, ["I'll", "call", "you", "soon"]), true);
  assert.equal(checkPracticeAnswer(orderQ, ["call", "I'll", "you", "soon"]), false);

  const fixQ = { type: "fix", wrong: "I'll call you as soon as I will arrive.", answerText: "I'll call you as soon as I arrive." };
  assert.equal(checkPracticeAnswer(fixQ, "i'll call you as soon as i arrive"), true);
  assert.equal(normalizeAnswer("  Hello?! "), "hello");
});

test("stableShuffle scrambles chips deterministically", () => {
  const chips = ["One", "Two", "Three", "Four"];
  const a = stableShuffle("q1", chips).map((x) => x.text);
  const b = stableShuffle("q1", chips).map((x) => x.text);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, chips);
  assert.deepEqual([...a].sort(), [...chips].sort());
});
