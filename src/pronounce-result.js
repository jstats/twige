// Turns Azure's pronunciation-assessment answer into what the app shows.
// Shared by the server step and the tests. The app shows words to practise, never a score.
export const UNCLEAR_BELOW = 60; // Azure accuracy (0-100) below this = "practise this word"

export function summarise(azure, text = "") {
  const best = azure?.NBest?.[0];
  if (!best || azure.RecognitionStatus !== "Success") {
    return { ok: false, heard: false, message: "The phone could not hear the reading clearly. Read a little louder, closer to the phone, and try again." };
  }
  const words = (best.Words || []).map((w) => {
    // The REST short-audio API puts AccuracyScore/ErrorType directly on the word; the SDK nests them.
    const pa = w.PronunciationAssessment || w;
    const error = pa.ErrorType || "None";
    let state = "clear";
    if (error === "Omission") state = "missed";
    else if (error === "Insertion") state = "extra";
    else if (error === "Mispronunciation" || (pa.AccuracyScore ?? 100) < UNCLEAR_BELOW) state = "unclear";
    const sounds = (w.Phonemes || [])
      .filter((p) => (p.PronunciationAssessment?.AccuracyScore ?? p.AccuracyScore ?? 100) < UNCLEAR_BELOW)
      .map((p) => p.Phoneme);
    return { word: w.Word, state, sounds };
  });
  const reading = words.filter((w) => w.state !== "extra");
  const practise = [...new Set(reading.filter((w) => w.state === "unclear").map((w) => w.word.toLowerCase()))];
  const missed = reading.filter((w) => w.state === "missed").map((w) => w.word);
  const fluency = best.PronunciationAssessment?.FluencyScore ?? best.FluencyScore;
  return {
    ok: true,
    heard: true,
    text,
    words,
    practise,
    missed,
    clearCount: reading.filter((w) => w.state === "clear").length,
    total: reading.length,
    smooth: fluency === undefined ? null : fluency >= 70,
  };
}
