import { mergeLists } from "./srs.js";

export function progressKey(uid) {
  return uid ? `progress:${uid}` : "progress:guest";
}

export function recordingKey(uid, rawKey) {
  return `${uid || "guest"}:${rawKey}`;
}

export function mergeState(local = {}, cloud = {}, base = {}) {
  const later = (a, b, key) => ((a?.[key] || 0) >= (b?.[key] || 0) ? a : b);
  const logs = [local.reviewLog, cloud.reviewLog].filter(Boolean);
  const reviewLog = logs.reduce((acc, l) => {
    if (!acc || l.date > acc.date) return l;
    if (l.date === acc.date) {
      return {
        date: l.date,
        reviewed: Math.max(acc.reviewed, l.reviewed),
        fresh: Math.max(acc.fresh, l.fresh),
      };
    }
    return acc;
  }, null);

  const tasks = { ...(cloud.tasks || {}) };
  for (const [lang, t] of Object.entries(local.tasks || {})) {
    tasks[lang] = later(t, tasks[lang], "updated");
  }
  const check = later(local, cloud, "answersUpdated");
  const pref = later(local, cloud, "updated");

  return {
    ...base,
    ...cloud,
    ...local,
    name: (pref?.name || local.name || cloud.name || "").trim(),
    language: pref?.language || local.language || cloud.language || base.language || "en",
    explain: pref?.explain || local.explain || cloud.explain || base.explain || "en",
    swVoice: Boolean(pref?.swVoice ?? local.swVoice ?? cloud.swVoice),
    selectedLesson: { ...(cloud.selectedLesson || {}), ...(local.selectedLesson || {}) },
    completed: {
      en: [...new Set([...(local.completed?.en || []), ...(cloud.completed?.en || [])])],
      sw: [...new Set([...(local.completed?.sw || []), ...(cloud.completed?.sw || [])])],
    },
    reviews: mergeLists(cloud.reviews, local.reviews),
    phrasebook: mergeLists(cloud.phrasebook, local.phrasebook),
    writing: mergeLists(cloud.writing, local.writing),
    tasks,
    answers: check.answers || [],
    answersUpdated: check.answersUpdated || 0,
    reviewLog,
    days: Math.max(local.days || 0, cloud.days || 0),
    lastDay: [local.lastDay, cloud.lastDay].filter(Boolean).sort().pop() || null,
    updated: Math.max(local.updated || 0, cloud.updated || 0),
  };
}
