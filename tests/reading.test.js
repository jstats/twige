import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { splitPassage, wordCount, compactReadingResult } from "../src/reading.js";

const data = JSON.parse(fs.readFileSync(new URL("../content/en/reading.json", import.meta.url), "utf8"));

test("content/en/reading.json has 12 passages (4 A2, 4 A2+, 4 B1), unique ids, and valid sentences", () => {
  assert.equal(data.passages.length, 12);
  const byLevel = { A2: 0, "A2+": 0, B1: 0 };
  const ids = new Set();

  for (const p of data.passages) {
    assert.ok(p.id && !ids.has(p.id), `duplicate or empty id: ${p.id}`);
    ids.add(p.id);
    assert.ok(p.level in byLevel, `unexpected level: ${p.level}`);
    byLevel[p.level]++;
    assert.ok(p.title && p.title.length >= 5, `missing title on ${p.id}`);
    assert.ok(["everyday", "work"].includes(p.topic), `unexpected topic on ${p.id}: ${p.topic}`);
    assert.ok(Array.isArray(p.sentences) && p.sentences.length >= 4 && p.sentences.length <= 6, `${p.id} sentence count ${p.sentences?.length}`);

    for (const s of p.sentences) {
      const wc = wordCount(s);
      assert.ok(wc >= 6 && wc <= 18, `${p.id} sentence word count ${wc} out of [6, 18]: ${s}`);
    }
  }

  assert.deepEqual(byLevel, { A2: 4, "A2+": 4, B1: 4 });
});

test("splitPassage divides every passage into 1-2 sentence parts of at most 25 words", () => {
  for (const p of data.passages) {
    const parts = splitPassage(p.sentences, 25);
    assert.ok(parts.length >= 2 && parts.length <= p.sentences.length, `${p.id} unexpected part count ${parts.length}`);
    for (const part of parts) {
      const wc = wordCount(part);
      assert.ok(wc <= 25, `${p.id} part exceeds 25 words (${wc}): ${part}`);
    }
    assert.equal(parts.join(" "), p.sentences.join(" "));
  }
});

test("compactReadingResult keeps word states without numeric scores", () => {
  const c = compactReadingResult({
    ok: true,
    heard: true,
    words: [
      { word: "Hello", state: "clear", sounds: [] },
      { word: "neighbour", state: "unclear", sounds: ["ey"] },
    ],
    practise: ["neighbour"],
    missed: [],
    clearCount: 1,
    total: 2,
    smooth: true,
  });
  assert.equal(c.words.length, 2);
  assert.deepEqual(c.practise, ["neighbour"]);
  assert.equal("AccuracyScore" in c, false);
  assert.equal("sounds" in c.words[0], false);
  assert.equal(compactReadingResult({ ok: false, heard: false }), null);
});

import { mergeState } from "../src/sync.js";
import { initial } from "../src/store.js";

test("state.reading from cloud survives mergeState on a device without reading progress yet", () => {
  const cloud = {
    ...initial,
    reading: {
      "read-a2-01": {
        done: true,
        parts: {
          0: { heard: true, words: [{ word: "Hello", state: "clear" }], practise: [], missed: [], clearCount: 1, total: 1, smooth: true, updated: 100 },
        },
      },
    },
  };
  const merged = mergeState({ ...initial }, cloud, initial);
  assert.equal(merged.reading["read-a2-01"].done, true);
  assert.equal(merged.reading["read-a2-01"].parts[0].clearCount, 1);
});
