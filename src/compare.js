// Compares what speech recognition heard with the target sentence.
// Shows which words differ. It is NOT a pronunciation score and must never be shown as one.
const CONTRACTIONS = {
  "i'll": "i will", "you'll": "you will", "we'll": "we will", "she'll": "she will", "he'll": "he will", "it'll": "it will",
  "i'm": "i am", "you're": "you are", "we're": "we are", "they're": "they are", "it's": "it is", "that's": "that is",
  "there's": "there is", "what's": "what is", "i'd": "i would", "i've": "i have", "we've": "we have",
  "don't": "do not", "doesn't": "does not", "can't": "cannot", "won't": "will not", "isn't": "is not",
  "aren't": "are not", "haven't": "have not", "didn't": "did not", "couldn't": "could not", "let's": "let us",
};

export function tokens(text = "") {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9':\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (CONTRACTIONS[w] || w).split(" "));
}

// Returns the heard words, each marked ok or not, plus target words that were not heard.
export function compareWords(target, heard) {
  const t = tokens(target), h = tokens(heard);
  const dp = Array.from({ length: t.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = t.length - 1; i >= 0; i--)
    for (let j = h.length - 1; j >= 0; j--)
      dp[i][j] = t[i] === h[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const words = [], missing = [];
  let i = 0, j = 0;
  while (i < t.length || j < h.length) {
    if (i < t.length && j < h.length && t[i] === h[j]) { words.push({ word: h[j], ok: true }); i++; j++; }
    else if (j < h.length && (i >= t.length || dp[i][j + 1] >= dp[i + 1][j])) { words.push({ word: h[j], ok: false }); j++; }
    else { missing.push(t[i]); i++; }
  }
  return { words, missing, same: missing.length === 0 && words.every((w) => w.ok) };
}
