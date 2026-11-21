// Pure practice exercise helpers (unit-tested in tests/practice.test.js).

export function normalizeAnswer(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.?!,;:"“”]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashId(id = "") {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function stableShuffle(id, items = []) {
  const n = items.length;
  const idx = [...Array(n).keys()];
  let h = hashId(id);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  // If shuffle accidentally kept natural order for >1 items, rotate once so chips feel scrambled.
  if (n > 1 && idx.every((v, i) => v === i)) {
    idx.push(idx.shift());
  }
  return idx.map((i) => ({ id: i, text: items[i] }));
}

export function checkPracticeAnswer(q, userInput) {
  if (!q) return false;
  const type = q.type || "choice";
  if (type === "choice") {
    return Number(userInput) === q.answer;
  }
  const actual = normalizeAnswer(Array.isArray(userInput) ? userInput.join(" ") : userInput);
  if (!actual) return false;
  const accepted = [q.answerText, ...(q.accept || [])].filter(Boolean).map(normalizeAnswer);
  return accepted.includes(actual);
}

export function correctDisplay(q) {
  if (!q) return "";
  if ((q.type || "choice") === "choice") return q.options?.[q.answer] || "";
  return q.answerText || "";
}

export function fullSentenceForReview(q) {
  if (!q) return "";
  const type = q.type || "choice";
  if (type === "choice") {
    const ans = q.options?.[q.answer] || "";
    if (q.prompt?.includes("____")) {
      return q.prompt
        .replace(/\s*____\s*/, (m) => (ans.startsWith("'") ? "" : " ") + ans + (m.endsWith(" ") ? " " : ""))
        .replace(/\s+([.?!,])/g, "$1")
        .trim();
    }
    return ans;
  }
  if (type === "gap") {
    const ans = q.answerText || "";
    if (q.prompt?.includes("____")) {
      return q.prompt
        .replace(/\s*____\s*/, (m) => (ans.startsWith("'") ? "" : " ") + ans + (m.endsWith(" ") ? " " : ""))
        .replace(/\s+([.?!,])/g, "$1")
        .trim();
    }
    return ans;
  }
  return q.answerText || "";
}
