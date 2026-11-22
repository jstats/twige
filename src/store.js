import { progressKey } from "./sync.js";

const DB = "twige-v1";
const ACTIVE_UID_KEY = "active-uid";
const LEGACY_KEY = "progress";
let db;

function open() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      for (const name of ["state", "recordings"]) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve((db = req.result));
    req.onerror = () => reject(req.error);
  });
}

export async function get(key, store = "state") {
  const d = await open();
  return new Promise((resolve, reject) => {
    const q = d.transaction(store).objectStore(store).get(key);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}

export async function put(key, value, store = "state") {
  const d = await open();
  return new Promise((resolve, reject) => {
    const q = d.transaction(store, "readwrite").objectStore(store).put(value, key);
    q.onsuccess = () => resolve(value);
    q.onerror = () => reject(q.error);
  });
}

export async function del(key, store = "state") {
  const d = await open();
  return new Promise((resolve, reject) => {
    const q = d.transaction(store, "readwrite").objectStore(store).delete(key);
    q.onsuccess = () => resolve();
    q.onerror = () => reject(q.error);
  });
}

export const initial = {
  name: "",
  language: "en",
  explain: "en",
  swVoice: false,
  voiceURI: "",
  selectedLesson: { en: null, sw: null },
  completed: { en: [], sw: [] },
  reviews: [],
  phrasebook: [],
  writing: [],
  answers: [],
  answersUpdated: 0,
  reviewLog: null,
  tasks: {},
  lastDay: null,
  days: 0,
  updated: 0,
};

export function normalizeState(raw) {
  const s = { ...initial, ...(raw || {}) };
  s.completed = { en: [], sw: [], ...(s.completed || {}) };
  s.selectedLesson = { en: null, sw: null, ...(s.selectedLesson || {}) };
  s.swVoice = Boolean(s.swVoice);
  s.name = String(s.name || "");
  return s;
}

export async function getActiveUid() {
  return (await get(ACTIVE_UID_KEY)) || null;
}

export async function setActiveUid(uid) {
  if (uid) return put(ACTIVE_UID_KEY, uid);
  return del(ACTIVE_UID_KEY);
}

export async function load(uid = null) {
  const scopedKey = progressKey(uid);
  let data = await get(scopedKey);
  if (!data) {
    const legacy = await get(LEGACY_KEY);
    if (legacy) {
      const legacyUid = legacy.accountUid || null;
      if ((uid && legacyUid === uid) || (!uid && !legacyUid)) {
        data = legacy;
        await put(scopedKey, legacy);
      }
    }
  }
  return normalizeState(data);
}

export async function save(state, uid = null) {
  const next = { ...state, updated: Date.now() };
  return put(progressKey(uid), next);
}

export async function clearGuest() {
  return del(progressKey(null));
}
