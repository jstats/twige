import test from "node:test";
import assert from "node:assert/strict";
import { summarise, UNCLEAR_BELOW } from "../src/pronounce-result.js";
import { encodeWav } from "../src/wav.js";

test("summarise classifies clear, Mispronunciation, Omission, and Insertion without exposing numeric scores", () => {
  const azure = {
    RecognitionStatus: "Success",
    NBest: [
      {
        PronunciationAssessment: { FluencyScore: 64 },
        Words: [
          {
            Word: "Good",
            PronunciationAssessment: { AccuracyScore: 95, ErrorType: "None" },
            Phonemes: [{ Phoneme: "g", PronunciationAssessment: { AccuracyScore: 98 } }],
          },
          {
            Word: "morning",
            PronunciationAssessment: { AccuracyScore: 42, ErrorType: "Mispronunciation" },
            Phonemes: [
              { Phoneme: "m", PronunciationAssessment: { AccuracyScore: 90 } },
              { Phoneme: "ao", PronunciationAssessment: { AccuracyScore: 35 } },
            ],
          },
          {
            Word: "um",
            PronunciationAssessment: { AccuracyScore: 80, ErrorType: "Insertion" },
          },
          {
            Word: "Grace",
            PronunciationAssessment: { AccuracyScore: 0, ErrorType: "Omission" },
          },
          {
            Word: "Morning",
            PronunciationAssessment: { AccuracyScore: UNCLEAR_BELOW - 1, ErrorType: "None" },
          },
        ],
      },
    ],
  };

  const res = summarise(azure, "Good morning Grace");
  assert.equal(res.ok, true);
  assert.equal(res.heard, true);
  assert.equal(res.text, "Good morning Grace");
  assert.deepEqual(
    res.words.map((w) => [w.word, w.state]),
    [
      ["Good", "clear"],
      ["morning", "unclear"],
      ["um", "extra"],
      ["Grace", "missed"],
      ["Morning", "unclear"],
    ],
  );
  assert.deepEqual(res.words[1].sounds, ["ao"]);
  assert.deepEqual(res.practise, ["morning"]); // lowercased and deduplicated
  assert.deepEqual(res.missed, ["Grace"]);
  assert.equal(res.clearCount, 1);
  assert.equal(res.total, 4); // Insertion excluded from reading total
  assert.equal(res.smooth, false); // FluencyScore 64 < 70

  // Must never expose raw Azure numeric scores to the learner UI
  const json = JSON.stringify(res);
  assert.equal(/AccuracyScore|PronScore|FluencyScore|CompletenessScore/.test(json), false);
});

test("summarise handles failed recognition statuses cleanly", () => {
  for (const bad of [
    { RecognitionStatus: "NoMatch", NBest: [] },
    { RecognitionStatus: "InitialSilenceTimeout" },
    null,
  ]) {
    const res = summarise(bad, "Hello");
    assert.equal(res.ok, false);
    assert.equal(res.heard, false);
    assert.ok(res.message.length > 0);
  }
});

test("summarise sets smooth=true when FluencyScore >= 70 and null when omitted", () => {
  const high = summarise({
    RecognitionStatus: "Success",
    NBest: [{ PronunciationAssessment: { FluencyScore: 70 }, Words: [{ Word: "Hello", PronunciationAssessment: { AccuracyScore: 90, ErrorType: "None" } }] }],
  });
  assert.equal(high.smooth, true);

  const missingFluency = summarise({
    RecognitionStatus: "Success",
    NBest: [{ Words: [{ Word: "Hello", PronunciationAssessment: { AccuracyScore: 90, ErrorType: "None" } }] }],
  });
  assert.equal(missingFluency.smooth, null);
});

test("encodeWav produces valid 16 kHz mono 16-bit PCM RIFF header", () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1.5, -1.5]);
  const buf = encodeWav(samples, 16000);
  const v = new DataView(buf);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  assert.equal(tag(0), "RIFF");
  assert.equal(v.getUint32(4, true), 36 + samples.length * 2);
  assert.equal(tag(8), "WAVE");
  assert.equal(tag(12), "fmt ");
  assert.equal(v.getUint16(22, true), 1); // mono
  assert.equal(v.getUint32(24, true), 16000); // sampleRate
  assert.equal(v.getUint16(34, true), 16); // bitsPerSample
  assert.equal(tag(36), "data");
  assert.equal(v.getUint32(40, true), samples.length * 2);
  assert.equal(v.getInt16(44 + 3 * 2, true), 0x7fff); // clamped +1
  assert.equal(v.getInt16(44 + 4 * 2, true), -0x8000); // clamped -1
});
