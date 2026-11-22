// Splits a passage's sentences into readable parts (1-2 sentences, at most ~maxWords words each)
// and creates a compact, score-free progress summary for state.reading.
export const wordCount = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

export function splitPassage(sentences = [], maxWords = 25) {
  const parts = [];
  let buf = [];
  let words = 0;
  for (const raw of sentences) {
    const s = String(raw || "").trim();
    if (!s) continue;
    const w = wordCount(s);
    if (buf.length > 0 && (buf.length >= 2 || words + w > maxWords)) {
      parts.push(buf.join(" "));
      buf = [s];
      words = w;
    } else {
      buf.push(s);
      words += w;
    }
  }
  if (buf.length) parts.push(buf.join(" "));
  return parts;
}

export function compactReadingResult(res) {
  if (!res || !res.heard) return null;
  return {
    heard: true,
    words: (res.words || []).map((w) => ({ word: w.word, state: w.state })),
    practise: [...(res.practise || [])],
    missed: [...(res.missed || [])],
    clearCount: res.clearCount || 0,
    total: res.total || 0,
    smooth: res.smooth ?? null,
    updated: Date.now(),
  };
}
