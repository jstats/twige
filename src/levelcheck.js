// English level check scoring. Pure functions only (tests/levelcheck.test.js).
// Each scored section has 6 items ordered easy -> hard (A1, A2, B1, B1, B2, B2).
// Adaptive rule: after two wrong answers in a row, the rest of that section is skipped
// (skipped items count as not correct), so she is not pushed through items far above her level.
// Section level from the number correct out of 6 (skipped = not correct):
// 6, or 5 with both B2 items right -> B2; 4-5 -> B1; 2-3 -> A2; 0-1 -> A1.
// Speaking and writing are recorded for a person to review, not scored.
export const LEVELS = ["A1", "A2", "B1", "B2"];

export function shouldStop(sectionAnswers) {
  const scored = sectionAnswers.filter((a) => a.correct !== null);
  const last = scored.slice(-2);
  return last.length === 2 && last.every((a) => a.correct === false);
}

export function scoreSection(answers) {
  const scored = answers.filter((a) => a.correct !== null);
  if (!scored.length) return "Awaiting review";
  if (scored.length < 3) return "Not enough answers";
  const points = scored.filter((a) => a.correct).length;
  const b2 = scored.filter((a) => a.level === "B2");
  if (points === scored.length || (points >= scored.length - 1 && b2.length && b2.every((a) => a.correct))) return "B2";
  if (points >= 4) return "B1";
  if (points >= 2) return "A2";
  return "A1";
}

export function results(answers) {
  return Object.fromEntries(
    [...new Set(answers.map((a) => a.section))].map((s) => [s, scoreSection(answers.filter((a) => a.section === s))]),
  );
}
