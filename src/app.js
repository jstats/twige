import { load, save, get, initial, getActiveUid, setActiveUid, clearGuest } from "./store.js";
import { mergeState, recordingKey } from "./sync.js";
import { add, grade, dueToday, logReview, merge, day } from "./srs.js";
import { shouldStop, results } from "./levelcheck.js";
import { speak, hasSwVoice, record, playback, listen, englishVoices, setPreferredVoice } from "./speech.js";
import { compareWords } from "./compare.js";
import { stableShuffle, checkPracticeAnswer, correctDisplay, fullSentenceForReview } from "./practice.js";
import { firebaseConfig } from "./config.js";
import { toWav16k, toBase64 } from "./wav.js";

const $ = document.querySelector("#app");
const FIREBASE = "https://www.gstatic.com/firebasejs/11.10.0/";

// ---------- state ----------
let authUid = await getActiveUid();
let state = await load(authUid);
let unit = {}, questions = [];
let route = "welcome";
// screen-local UI state
let step = 0, practice = 0, speakIndex = 0, selected = null, checked = false, showTranslation = false;
let orderPicked = [], typedAnswer = "";
let checkIndex = 0, checkHistory = [];
let activeRecorder = null, status = "", toastTimer = null;
let pron = {}; // reading-feedback results by recording key
let authMode = "signin", pendingDisplayName = "", migrateGuestOnSignup = false;
let syncState = authUid ? (navigator.onLine ? "syncing" : "offline") : "local";
let syncMsg = "", lastSyncedAt = null;
const drafts = { useKey: "", useText: "", taskLang: "", taskText: "", checkId: "", checkText: "", phrase: "", meaning: "" };

const escape = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

try {
  [unit.en, unit.sw, questions] = await Promise.all(
    ["/content/en/unit-01.json", "/content/sw/unit-01.json", "/content/levelcheck/en.json"].map((u) =>
      fetch(u).then((r) => { if (!r.ok) throw Error(u); return r.json(); }),
    ),
  );
} catch (e) {
  $.innerHTML = '<main class="shell"><h1>Lessons could not load</h1><p>Connect to the internet once so the lessons can be saved for offline use.</p></main>';
  throw e;
}

// ---------- icons & i18n ----------
const svg = (paths) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICO = {
  today: svg('<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/>'),
  review: svg('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'),
  phrasebook: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  progress: svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  play: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
  mic: svg('<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  bookmark: svg('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'),
  check: svg('<polyline points="20 6 9 17 4 12"/>'),
  back: svg('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'),
  user: svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
};

const i18n = {
  en: {
    today: "Today", review: "Review", phrasebook: "Phrasebook", progress: "Progress", settings: "Settings",
    todayHead: "Today: about 20 minutes", todaySub: "Choose one language for today. Your review is included.",
    start: "Start", anza: "Anza", cont: "Continue", close: "Close", back: "Back",
    checkAns: "Check answer", nextQ: "Next question", nextSpeak: "Continue to speaking",
    showAns: "Show the answer", again: "Didn’t know", effort: "With effort", easy: "Easy",
    save: "Save", lessonsTitle: "All 5 lessons (pick or replay)", done: "Done",
    progressHead: "What I can do now", phraseHead: "My phrasebook", reviewHead: "Review · 5 min",
    listen: "Listen", slower: "Slower", savePhrase: "Save to phrasebook",
  },
  fr: {
    today: "Aujourd’hui", review: "Révision", phrasebook: "Mes phrases", progress: "Progrès", settings: "Paramètres",
    todayHead: "Aujourd’hui : environ 20 minutes", todaySub: "Choisis une langue pour aujourd’hui. Ta révision est incluse.",
    start: "Commencer", anza: "Anza", cont: "Continuer", close: "Fermer", back: "Retour",
    checkAns: "Vérifier", nextQ: "Question suivante", nextSpeak: "Passer à l'oral",
    showAns: "Voir la réponse", again: "À revoir", effort: "Avec effort", easy: "Facile",
    save: "Enregistrer", lessonsTitle: "Les 5 leçons (choisir ou rejouer)", done: "Terminé",
    progressHead: "Ce que je sais faire", phraseHead: "Mon carnet de phrases", reviewHead: "Révision · 5 min",
    listen: "Écouter", slower: "Plus lent", savePhrase: "Ajouter au carnet",
  },
  rw: {
    today: "Uyu munsi", review: "Isubiramo", phrasebook: "Amagambo yanjye", progress: "Iterambere", settings: "Igenamiterere",
    todayHead: "Uyu munsi: hafi iminota 20", todaySub: "Hitamo ururimi rumwe rw'uyu munsi. Isubiramo ririmo.",
    start: "Tangira", anza: "Anza", cont: "Komeza", close: "Funga", back: "Subira inyuma",
    checkAns: "Reba igisubizo", nextQ: "Ikibazo gikurikira", nextSpeak: "Komeza ku kuvuga",
    showAns: "Erekana igisubizo", again: "Sinibuka", effort: "Byangoye gato", easy: "Byoroshye",
    save: "Bika", lessonsTitle: "Amasomo 5 yose (hitamo cyangwa usubiremo)", done: "Byarangiye",
    progressHead: "Ibyo nshobora gukora ubu", phraseHead: "Igitabo cy'interuro zanjye", reviewHead: "Isubiramo · 5 min",
    listen: "Umva", slower: "Buhoro", savePhrase: "Bika mu gitabo",
  },
};
const tr = (k) => i18n[state.explain]?.[k] || i18n.en[k] || k;
const explainText = (obj) => obj?.[state.explain] || obj?.en || "";
const fallbackNote = (obj) =>
  state.explain !== "en" && obj && !obj[state.explain] ? '<p class="small muted">Translation coming · showing English.</p>' : "";
const draft = (lang) => (lang === "sw" ? '<span class="pill">Draft · to be checked by a fluent speaker</span>' : "");
const button = (label, action, cls = "button", extra = "", iconHtml = "") =>
  `<button class="${cls}" data-action="${action}" ${extra}>${iconHtml}${escape(label)}</button>`;
const nav = () =>
  `<nav class="nav" aria-label="Main navigation">${["today", "review", "phrasebook", "progress"]
    .map((r) => `<a href="#${r}" class="${route === r ? "active" : ""}" ${route === r ? 'aria-current="page"' : ""}>${ICO[r]}${escape(tr(r))}</a>`)
    .join("")}</nav>`;
const shell = (body, withNav = true) => `<main class="shell">${body}</main>${withNav ? nav() : ""}`;
const lessons = () => unit[state.language].lessons;
const canSpeakSw = () => Boolean(state.swVoice && hasSwVoice());

function currentIndex() {
  const list = lessons();
  const sel = state.selectedLesson?.[state.language];
  if (Number.isInteger(sel) && sel >= 0 && sel < list.length) return sel;
  const done = state.completed[state.language] || [];
  const nextIdx = list.findIndex((x) => !done.includes(x.id));
  return nextIdx >= 0 ? nextIdx : 0;
}
const current = () => lessons()[currentIndex()];
const todaysQueue = () => dueToday(state.reviews, day(), state.reviewLog);

function order(id, n) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}
const choices = (id, options) =>
  order(id, options.length)
    .map((i) => `<button class="choice ${selected === i ? "selected" : ""}" data-action="answer:${i}" aria-pressed="${selected === i}">${escape(options[i])}</button>`)
    .join("");

function lineTranslation(x) {
  if (state.explain === "rw" && x.rw) return x.rw;
  if (state.explain === "fr" && x.fr) return x.fr;
  if (state.language === "sw" && state.explain === "en") return x.en;
  return x.fr || x.en || x.rw || "";
}

const persist = async () => {
  state = await save(state, authUid);
  sync();
};
const goto = (r) => {
  route = r;
  if (location.hash.slice(1) !== r) history.pushState(null, "", "#" + r);
  render();
  scrollTo(0, 0);
};

function captureDrafts() {
  const l = current();
  const useEl = document.querySelector("#use-answer");
  if (useEl) { drafts.useKey = l.id; drafts.useText = useEl.value; }
  const taskEl = document.querySelector("#task-answer");
  if (taskEl) { drafts.taskLang = state.language; drafts.taskText = taskEl.value; }
  const checkEl = document.querySelector("#check-write");
  if (checkEl && questions[checkIndex]) { drafts.checkId = questions[checkIndex].id; drafts.checkText = checkEl.value; }
  const phEl = document.querySelector("#phrase");
  if (phEl) drafts.phrase = phEl.value;
  const meanEl = document.querySelector("#meaning");
  if (meanEl) drafts.meaning = meanEl.value;
}

// ---------- sync (Firebase multi-learner) ----------
let user = null, auth = null, remote = null;

function syncLabel() {
  if (!authUid && !user) return { cls: "local", text: "Guest · Not synced" };
  if (!navigator.onLine) return { cls: "offline", text: "Offline · Saved on device" };
  if (syncState === "synced") return { cls: "synced", text: "Synced" };
  if (syncState === "error") return { cls: "error", text: "Sync issue" };
  return { cls: "syncing", text: "Syncing…" };
}

function accountBar() {
  const pill = syncLabel();
  const who = (state.name || user?.displayName || user?.email || "").trim();
  const label = (authUid || user)
    ? (who || "Learner account")
    : "Guest mode — tap to sign in";
  const target = (authUid || user) ? "settings" : "auth";
  return `<button type="button" class="account-bar" data-action="${target}">
    <span style="display:inline-flex;align-items:center;gap:8px;font-weight:700">${ICO.user}<span>${escape(label)}</span></span>
    <span class="sync-pill ${pill.cls}"><span class="dot"></span>${escape(pill.text)}</span>
  </button>`;
}

async function initFirebase() {
  if (!firebaseConfig || auth || !navigator.onLine) return;
  try {
    const [{ initializeApp }, A, F] = await Promise.all([
      import(FIREBASE + "firebase-app.js"),
      import(FIREBASE + "firebase-auth.js"),
      import(FIREBASE + "firebase-firestore.js"),
    ]);
    const app = initializeApp(firebaseConfig);
    auth = A.getAuth(app);
    remote = { db: F.getFirestore(app), doc: F.doc, getDoc: F.getDoc, setDoc: F.setDoc, A };

    A.onAuthStateChanged(auth, async (u) => {
      user = u;
      if (!u) {
        if (authUid) {
          // Session expired remotely or signed out; return cleanly to local guest scope
          authUid = null;
          await setActiveUid(null);
          state = await load(null);
          syncState = "local";
          syncMsg = "";
          render();
        } else if (["settings", "today", "welcome", "auth"].includes(route)) {
          render();
        }
        return;
      }

      syncState = "syncing";
      syncMsg = "";
      try {
        const guestToMigrate = !authUid && migrateGuestOnSignup ? state : null;
        migrateGuestOnSignup = false;

        authUid = u.uid;
        await setActiveUid(u.uid);

        let localForUid = await load(u.uid);
        if (guestToMigrate) {
          localForUid = mergeState(guestToMigrate, localForUid, initial);
          await clearGuest();
        }
        if (pendingDisplayName && !localForUid.name) localForUid.name = pendingDisplayName;
        if (!localForUid.name && u.displayName) localForUid.name = u.displayName;
        pendingDisplayName = "";
        localForUid.accountUid = u.uid;
        state = await save(localForUid, u.uid);

        const snap = await remote.getDoc(remote.doc(remote.db, "users", u.uid, "progress", "current"));
        const cloud = snap.exists() ? snap.data() : {};
        state = mergeState(state, cloud, initial);
        state.accountUid = u.uid;
        if (!state.name && u.displayName) state.name = u.displayName;

        state = await save(state, u.uid);
        await sync();
      } catch (e) {
        console.warn("Could not load saved progress", e);
        syncState = "error";
        syncMsg = e.code === "permission-denied"
          ? "Cloud sync is waiting for Firestore rules to be published on Firebase."
          : "Could not reach cloud backup right now. Your work is safe on this device.";
      }
      if (route === "auth" || route === "welcome") goto("today");
      else if (["settings", "today", "progress"].includes(route)) render();
    });
  } catch (e) {
    console.warn("Sync unavailable", e);
    if (authUid) { syncState = "offline"; }
  }
}

async function sync() {
  if (!authUid) { syncState = "local"; return; }
  if (!navigator.onLine) { syncState = "offline"; return; }
  if (!user || !remote) { syncState = "syncing"; return; }
  try {
    syncState = "syncing";
    await remote.setDoc(remote.doc(remote.db, "users", user.uid, "progress", "current"), JSON.parse(JSON.stringify(state)));
    syncState = "synced";
    syncMsg = "";
    lastSyncedAt = new Date();
  } catch (e) {
    console.warn("Sync failed", e);
    syncState = "error";
    syncMsg = e.code === "permission-denied"
      ? "Cloud backup permission denied. Publish firestore.rules in Firebase."
      : "Could not sync right now. Saved safely on this device.";
  }
}

const authMessage = (e) =>
  ({
    "auth/invalid-credential": "The email or password is not right. Try again, or tap “Forgot password”.",
    "auth/wrong-password": "The password is not right. Try again, or tap “Forgot password”.",
    "auth/user-not-found": "No account with this email yet. Switch to “Create account”.",
    "auth/email-already-in-use": "This email already has an account. Switch to “Sign in”.",
    "auth/weak-password": "Please use at least 6 characters for the password.",
    "auth/invalid-email": "Please check the email address.",
    "auth/network-request-failed": "No internet connection. Try again when you are online.",
    "auth/too-many-requests": "Too many tries. Please wait a few minutes and try again.",
  })[e.code] || "Could not sign in: " + e.message;

async function passwordAuth(kind) {
  const email = document.querySelector("#email")?.value.trim();
  const password = document.querySelector("#password")?.value || "";
  const nameVal = document.querySelector("#auth-name")?.value.trim() || "";
  if (!email) { status = "Please type your email address."; return render(); }
  if (!auth && navigator.onLine) await initFirebase();
  if (!remote?.A || !auth) { status = "Connect to the internet to sign in or create an account."; return render(); }
  const A = remote.A;
  try {
    if (kind === "reset") {
      await A.sendPasswordResetEmail(auth, email);
      status = "Password reset link sent to " + email + ".";
      authMode = "signin";
    } else if (kind === "create") {
      if (!nameVal) { status = "Please enter your name so you can recognize your account."; return render(); }
      if (password.length < 6) { status = "Please use at least 6 characters for your password."; return render(); }
      pendingDisplayName = nameVal;
      migrateGuestOnSignup = true;
      const cred = await A.createUserWithEmailAndPassword(auth, email, password);
      if (A.updateProfile && cred.user) {
        try { await A.updateProfile(cred.user, { displayName: nameVal }); } catch {}
      }
      status = "Account created! Your study progress now syncs across any device.";
    } else {
      if (!password) { status = "Please type your password."; return render(); }
      const guestHasWork = !authUid && (state.completed.en.length || state.completed.sw.length || state.reviews.length || state.answers.length);
      migrateGuestOnSignup = Boolean(guestHasWork) && confirm("Add the lessons done on this device before signing in to this account?");
      await A.signInWithEmailAndPassword(auth, email, password);
      status = "Signed in. Your progress is loaded.";
    }
  } catch (e) {
    migrateGuestOnSignup = false;
    status = authMessage(e);
  }
  render();
}

// ---------- screens ----------
function authScreen() {
  const isCreate = authMode === "signup";
  const isReset = authMode === "reset";
  const canBack = Boolean(state.completed.en.length || state.completed.sw.length || state.answers.length || authUid);
  return `<div class="top"><span class="eyebrow">TWIGE · LEARNER ACCOUNT</span>${canBack ? button(tr("back"), "today", "button secondary", "", ICO.back) : ""}</div>
  <h1>${isReset ? "Reset password" : isCreate ? "Create your learner account" : "Sign in to continue your study"}</h1>
  <p class="muted">Use your email and password from any phone, tablet, or computer to keep your lessons, phrasebook, and classwork in sync.</p>
  ${!isReset ? `<div class="seg" role="group" aria-label="Account mode">
    <button type="button" class="${!isCreate ? "active" : ""}" data-action="auth-mode:signin" aria-pressed="${!isCreate}">Sign in</button>
    <button type="button" class="${isCreate ? "active" : ""}" data-action="auth-mode:signup" aria-pressed="${isCreate}">Create account</button>
  </div>` : ""}
  <div class="card">
    ${!navigator.onLine ? '<p class="warning small">You appear to be offline. Connect to the internet to sign in or create an account.</p>' : ""}
    ${isCreate ? '<label for="auth-name">Your name</label><input id="auth-name" autocomplete="name" placeholder="e.g. Grace">' : ""}
    <label for="email">Email address</label><input id="email" type="email" autocomplete="email" autocapitalize="off">
    ${!isReset ? `<label for="password">Password</label><input id="password" type="password" autocomplete="${isCreate ? "new-password" : "current-password"}" minlength="6">` : ""}
    <div class="spacer"></div>
    ${isReset
      ? `<div class="row">${button("Send reset link", "reset")}${button("Back to sign in", "auth-mode:signin", "button secondary")}</div>`
      : isCreate
      ? button("Create account", "signup")
      : `${button("Sign in", "signin")}<p style="margin-top:10px">${button("Forgot password", "auth-mode:reset", "button secondary")}</p>`}
  </div>
  <p class="small muted">On a shared phone? Always sign out in Settings when you finish so the next learner can sign into their own account.</p>
  <p>${button("Continue without an account (this device only)", "today", "button secondary")}</p>`;
}

function welcomeScreen() {
  return `<div class="eyebrow">TWIGE</div><h1>English and Kiswahili for everyday life and work</h1>
  <p>About 20 minutes a day. Real conversations for home, the city and work.</p>
  <div class="card teal">
    <div class="eyebrow on-dark">LEARNER ACCOUNT · ANY DEVICE</div>
    <h2>Save & continue your study anywhere</h2>
    <p class="muted">Sign in or create your own learner account so your lessons and classwork follow you across devices.</p>
    <div class="row">${button("Sign in / Create account", "auth", "button orange", "", ICO.user)}</div>
  </div>
  <div class="card"><h2>English</h2><p>Tenses, sentence building, pronunciation and vocabulary for daily life and work.</p></div>
  <div class="card"><h2>Kiswahili</h2><p>From the beginning, for life in Nairobi.</p>${draft("sw")}</div>
  ${languageSelect()}
  <div class="spacer"></div>${button("Start the English level check (20 min)", "check-start")}
  <p class="small muted">Kiswahili starts at the beginning, no test needed.</p>
  <p>${button("Skip for now and try on this device", "today", "button secondary")}</p>`;
}

function todayScreen() {
  const idx = currentIndex();
  const lesson = lessons()[idx];
  const doneList = state.completed[state.language] || [];
  const n = todaysQueue().length;
  const startLabel = state.language === "sw" ? tr("anza") : tr("start");
  const greetName = (state.name || user?.displayName || "").trim();

  return `${accountBar()}
  <div class="top"><span class="eyebrow">TWIGE</span>${button(tr("settings"), "settings", "button secondary", "", ICO.settings)}</div>
  ${syncState === "error" && syncMsg ? `<div class="warning small">${escape(syncMsg)}</div>` : ""}
  <h1>${greetName ? `Hello, ${escape(greetName)}` : escape(tr("todayHead"))}</h1>
  <p>${greetName ? escape(tr("todayHead")) + " · " + escape(tr("todaySub")) : escape(tr("todaySub"))}</p>
  <div class="seg" role="group" aria-label="Today's language">
    <button type="button" class="${state.language === "en" ? "active" : ""}" data-action="choose-en" aria-pressed="${state.language === "en"}">English</button>
    <button type="button" class="${state.language === "sw" ? "active" : ""}" data-action="choose-sw" aria-pressed="${state.language === "sw"}">Kiswahili</button>
  </div>
  <div class="card teal"><div class="eyebrow on-dark">${state.language === "en" ? "ENGLISH" : "KISWAHILI"} LESSON · 15 MIN</div>
  <h2>${escape(lesson.title)}</h2><p class="muted">Unit 1 · Lesson ${idx + 1} of ${lessons().length}${doneList.includes(lesson.id) ? " · " + escape(tr("done")) : ""}</p>${draft(state.language)}
  ${doneList.length >= lessons().length ? '<p class="small">You have finished Unit 1. Pick any lesson below to practise again.</p>' : ""}
  <div class="spacer"></div>${button(startLabel, "lesson-start", "button orange", "", ICO.play)}</div>
  <details class="card picker"><summary>${escape(tr("lessonsTitle"))}</summary>
    <div class="lesson-list">
      ${lessons().map((l, i) => {
        const isDone = doneList.includes(l.id);
        const isCur = i === idx;
        return `<button class="lesson-row ${isCur ? "active" : ""}" data-action="select-lesson:${i}">
          <span><strong>${i + 1}. ${escape(l.title)}</strong></span>
          <span>${isDone ? `<span class="pill teal-pill">${escape(tr("done"))}</span>` : (isCur ? '<span class="pill">Next</span>' : '<span class="small muted">Open</span>')}</span>
        </button>`;
      }).join("")}
    </div>
  </details>
  <div class="card"><h2>${escape(tr("reviewHead"))}</h2><p>${n ? `${n} words and sentences due, both languages` : "Nothing due right now."}</p>${n ? button("Go", "review") : ""}</div>
  <p class="muted small">Extra time? The other language is optional today.</p>
  <div class="card warm"><div class="eyebrow">THIS WEEK’S TASK</div><h2>${escape(unit[state.language].weeklyTask.prompt)}</h2>${button("Open task", "task", "button secondary")}</div>
  ${state.answers.length ? "" : `<p>${button("Take the English level check", "check-start", "button secondary")}</p>`}`;
}

function languageSelect() {
  return `<label for="explain">Explanations in</label><select id="explain">
  <option value="en" ${state.explain === "en" ? "selected" : ""}>English</option>
  <option value="fr" ${state.explain === "fr" ? "selected" : ""}>Français</option>
  <option value="rw" ${state.explain === "rw" ? "selected" : ""}>Ikinyarwanda</option></select>
  <p class="small muted">You can change this at any time.</p>
  ${state.explain === "rw" ? '<p class="pill">Ikinyarwanda: draft written by AI, not yet checked. If a sentence sounds wrong, note it so it can be corrected.</p>' : ""}`;
}

const LABELS = ["Listen", "Words", "Pattern", "Practise", "Speak", "Use it"];

function renderDialogueTurn(x, isEmail) {
  const trans = showTranslation ? `<div class="small muted translation">${escape(lineTranslation(x))}</div>` : "";
  const body = escape(x.text).replace(/\n/g, "<br>");
  if (isEmail) {
    return `<div class="email-card ${x.who === "You" ? "you" : ""}"><div class="email-head">${escape(x.who)}</div><div>${body}</div>${trans}</div>`;
  }
  return `<div class="bubble ${x.who === "You" ? "you" : ""}"><strong>${escape(x.who)}:</strong> ${body}${trans}</div>`;
}

function renderPracticeStep(l) {
  const q = l.practice[practice];
  const type = q.type || "choice";
  const id = l.id + "-q" + practice;
  let body = `<div class="eyebrow">Question ${practice + 1} of ${l.practice.length}</div><h2>${escape(q.prompt)}</h2>`;

  if (type === "choice") {
    body += choices(id, q.options);
  } else if (type === "order") {
    const shuffled = stableShuffle(id, q.chips);
    const pickedIds = new Set(orderPicked.map((c) => c.id));
    const remaining = shuffled.filter((c) => !pickedIds.has(c.id));
    body += `<p class="small muted">Tap words in order to build the sentence:</p>
      <div class="answer-tray" aria-label="Your sentence">${orderPicked.length
        ? orderPicked.map((c, idx) => `<button type="button" class="word-chip picked" data-action="order-unpick:${idx}" ${checked ? "disabled" : ""}>${escape(c.text)}</button>`).join("")
        : '<span class="small muted">Tap words below…</span>'}</div>
      <div class="chip-bank" aria-label="Word choices">${remaining.map((c) => `<button type="button" class="word-chip" data-action="order-pick:${c.id}" ${checked ? "disabled" : ""}>${escape(c.text)}</button>`).join("")}</div>
      ${orderPicked.length && !checked ? `<p>${button("Clear words", "order-clear", "button secondary")}</p>` : ""}`;
  } else if (type === "fix") {
    body += `<div class="wrong-box"><div class="eyebrow">Incorrect</div><p class="wrong-text">${escape(q.wrong)}</p></div>
      <label for="practice-input">Type the corrected sentence</label>
      <input id="practice-input" value="${escape(typedAnswer)}" autocomplete="off" autocapitalize="off" ${checked ? "disabled" : ""}>`;
  } else if (type === "gap") {
    body += (q.hint ? `<p class="small muted">Hint: ${escape(q.hint)}</p>` : "") +
      `<label for="practice-input">Type the missing word or phrase</label>
      <input id="practice-input" value="${escape(typedAnswer)}" autocomplete="off" autocapitalize="off" ${checked ? "disabled" : ""}>`;
  }

  if (checked) {
    const userVal = type === "choice" ? selected : type === "order" ? orderPicked.map((c) => c.text) : typedAnswer;
    const right = checkPracticeAnswer(q, userVal);
    body += `<div class="${right ? "feedback" : "warning"}" role="status"><strong>${right ? "Correct." : "Not quite."}</strong> ${escape(explainText(q.feedback))}
      ${right ? "" : `<br>Answer: <strong>${escape(correctDisplay(q))}</strong><br><span class="small">This will come back in your review.</span>`}
      ${fallbackNote(q.feedback)}</div>`;
  }

  const btnLabel = checked ? (practice === l.practice.length - 1 ? tr("nextSpeak") : tr("nextQ")) : tr("checkAns");
  body += `<div class="spacer"></div>${button(btnLabel, checked ? "practice-next" : "practice-check")}`;
  return body;
}

// ---------- reading feedback (Azure pronunciation check via /api/pronounce) ----------
const yourPart = (l) => l.dialogue.filter((x) => x.who === "You").map((x) => x.text).join(" ");
function pronBox(key, label) {
  const r = pron[key];
  let inner = "";
  if (r === "busy") inner = '<p class="small">Checking your reading…</p>';
  else if (r?.error) inner = `<p class="small">${escape(r.error)}</p>`;
  else if (r && !r.heard) inner = `<p class="small">${escape(r.message)}</p>`;
  else if (r) {
    const words = r.words.filter((w) => w.state !== "extra")
      .map((w) => w.state === "clear" ? escape(w.word)
        : w.state === "missed" ? `<span class="pr-missed" title="Not heard">${escape(w.word)}</span>`
        : `<button class="pr-unclear" data-action="say-text:${escape(w.word)}" title="Tap to hear it">${escape(w.word)}</button>`)
      .join(" ");
    const tips = [];
    if (r.practise.length) tips.push(`Practise: <strong>${r.practise.map(escape).join(", ")}</strong>. Tap an underlined word to hear it, then record again.`);
    if (r.missed.length) tips.push(`Not heard: <strong>${r.missed.map(escape).join(", ")}</strong>.`);
    if (r.smooth === false) tips.push("Try reading in short phrases rather than word by word.");
    if (!tips.length) tips.push("Clear reading. Well done.");
    inner = `<p class="pr-text">${words}</p><p class="small">${r.clearCount} of ${r.total} words clear.</p>${tips.map((t) => `<p class="small">${t}</p>`).join("")}
    <p class="small muted">Underlined: practise · Grey: not heard. Words to practise go into your review.</p>`;
  }
  return `<div class="pron" role="status">${inner}</div>`;
}

function lessonScreen() {
  const l = current();
  let html = `<div class="top">${button(tr("close"), "today", "button secondary", "", ICO.back)}<span class="eyebrow">Step ${step + 1} of 6 · ${LABELS[step]}</span></div>
  <div class="steps" aria-hidden="true">${LABELS.map((_, i) => `<i class="${i <= step ? "on" : ""}"></i>`).join("")}</div>
  <h1>${escape(l.title)}</h1>${draft(state.language)}${state.explain === "rw" ? '<span class="pill">Ikinyarwanda: draft</span>' : ""}`;

  if (step === 0) {
    const isEmail = l.format === "email";
    html += l.dialogue.map((x) => renderDialogueTurn(x, isEmail)).join("");
    const audioButtons = state.language === "en" || canSpeakSw()
      ? `${button(tr("listen"), "play-dialogue", "button secondary", "", ICO.play)}${button(tr("slower"), "play-slow", "button secondary")}`
      : "";
    html += `<div class="row">${audioButtons}${button(showTranslation ? "Hide translation" : "Translation", "toggle-translation", "button secondary")}</div>`;
    if (state.language === "en") {
      const rk = RECORD_KEYS.read();
      html += `<div class="card"><div class="eyebrow">READ YOUR PART ALOUD</div><p>Record yourself reading the “You” lines, then check how clearly they came across.</p>
      <div class="row">${button(activeRecorder ? "Stop recording" : "Record my reading", "record-read", activeRecorder ? "button" : "button secondary", "", activeRecorder ? ICO.stop : ICO.mic)}${button("Hear me", "hear-read", "button secondary", "", ICO.play)}</div>
      <div class="row">${button("Check my reading", "check-pron:read", "button")}</div>${pronBox(rk)}</div>`;
    }
    if (state.language === "sw") {
      if (canSpeakSw()) {
        html += '<p class="small muted">Using your phone’s Kiswahili voice (draft until fluent-speaker recordings arrive).</p>';
      } else {
        html += `<div class="card warm"><p class="small">${state.swVoice ? "No Kiswahili voice was found on this browser yet. Fluent-speaker recordings are coming." : "Kiswahili audio will be added after a fluent speaker records it."}</p>
        ${!state.swVoice ? button("Try phone’s Kiswahili voice", "toggle-sw-voice", "button secondary") : ""}</div>`;
      }
    }
  }
  if (step === 1) {
    html += `<p>These words will help you in today’s conversation.</p>` +
      l.words
        .map((w, i) => {
          const canAudio = state.language === "en" || canSpeakSw();
          const gloss = state.explain === "rw" && w.rw ? w.rw : state.explain === "fr" && w.fr ? w.fr : "";
          return `<div class="card"><strong class="word">${escape(w.text)}</strong>
          <p>${escape(w.meaning)}${gloss ? ` <span class="muted">· ${escape(gloss)}</span>` : ""}</p>
          <p class="example">“${escape(w.example)}”</p>
          <div class="row">${canAudio ? button(tr("listen"), "say-word:" + i, "button secondary", "", ICO.play) : ""}${button(tr("savePhrase"), "save-word:" + i, "button secondary", "", ICO.bookmark)}</div></div>`;
        })
        .join("");
  }
  if (step === 2) {
    html += `<div class="card warm"><h2>Today’s pattern</h2><p>${escape(explainText(l.pattern.explain))}</p>${fallbackNote(l.pattern.explain)}
    ${l.pattern.examples.map((x) => `<p><strong>${escape(x)}</strong></p>`).join("")}</div>`;
    if (l.pattern.compare?.rw) html += `<div class="card"><div class="eyebrow">COMPARE WITH KINYARWANDA</div><p><strong>${escape(l.pattern.compare.rw)}</strong></p></div>`;
  }
  if (step === 3) {
    html += renderPracticeStep(l);
  }
  if (step === 4) {
    const sentence = l.speak[speakIndex];
    const canModel = state.language === "en" || canSpeakSw();
    html += `<p>Listen, then say it aloud. Then record yourself and compare.</p>
    <div class="card"><div class="eyebrow">SENTENCE ${speakIndex + 1} OF ${l.speak.length}</div><h2>${escape(sentence)}</h2>
    <div class="row">${canModel ? button(tr("listen"), "model", "button secondary", "", ICO.play) : ""}${button(activeRecorder ? "Stop recording" : "Record me", "record", activeRecorder ? "button" : "button secondary", "", activeRecorder ? ICO.stop : ICO.mic)}</div>
    <div class="row">${button("Hear me", "hear-me", "button secondary", "", ICO.play)}${canModel ? button("Hear both", "hear-both", "button secondary") : ""}</div>
    ${state.language === "en"
      ? `<div class="row">${button("Check my pronunciation", "check-pron:sentence", "button")}</div>${pronBox(RECORD_KEYS.record())}`
      : `<div class="row">${button("What did the phone hear?", "recognize", "button secondary")}</div>
    <div id="heard" role="status" class="small muted">This shows what the phone understood. It is not a pronunciation score.</div>`}</div>`;
  }
  if (step === 5) {
    const prevReplies = (state.writing || []).filter((w) => w.lesson === l.id);
    const lastReply = prevReplies[prevReplies.length - 1];
    const savedDraft = drafts.useKey === l.id ? drafts.useText : "";
    html += `<div class="card warm"><h2>Use it</h2><p>${escape(l.useIt.prompt)}</p>
    <label for="use-answer">Your reply</label><textarea id="use-answer">${escape(savedDraft)}</textarea>
    <div class="row">${button(activeRecorder ? "Stop recording" : "Record a reply", "record-use", activeRecorder ? "button" : "button secondary", "", activeRecorder ? ICO.stop : ICO.mic)}${button("Hear my reply", "hear-use", "button secondary", "", ICO.play)}</div>
    ${lastReply ? `<p class="small"><strong>Saved earlier (${escape(lastReply.date)}):</strong> ${escape(lastReply.text)}</p>` : ""}
    <p class="small muted">Your reply is saved to your account for your tutor to look at.</p></div>
    ${button("Finish lesson", "finish", "button", "", ICO.check)}`;
  }
  if (step === 4) html += `<div class="spacer"></div>${button(speakIndex < l.speak.length - 1 ? "Next sentence" : tr("cont"), "speak-next")}`;
  else if (step < 3) html += `<div class="spacer"></div>${button(tr("cont"), "step-next")}`;
  return html;
}

function checkScreen() {
  const q = questions[checkIndex];
  if (!q) return "";
  const savedWrite = drafts.checkId === q.id ? drafts.checkText : "";
  let html = `<div class="top">${button(tr("back"), "check-back", "button secondary", "", ICO.back)}<span class="eyebrow">Question ${checkIndex + 1} of ${questions.length}</span></div>
  <div class="bar" role="progressbar" aria-valuemin="1" aria-valuemax="${questions.length}" aria-valuenow="${checkIndex + 1}"><span style="width:${Math.round(((checkIndex + 1) / questions.length) * 100)}%"></span></div>
  <p class="eyebrow">${escape(q.section.toUpperCase())}</p><h1>${escape(q.prompt)}</h1>`;
  if (q.audio) html += `<p>${button(tr("listen"), "check-audio", "button secondary", "", ICO.play)}</p>`;
  if (q.options) html += choices(q.id, q.options);
  if (q.kind === "write") html += `<label for="check-write">Your answer</label><textarea id="check-write">${escape(savedWrite)}</textarea>`;
  if (q.kind === "record") {
    html += `<p>Record your answer. Someone will listen to it later; it is not marked by the app.</p>
    <div class="row">${button(activeRecorder ? "Stop recording" : "Record", "record-check", activeRecorder ? "button" : "button secondary", "", activeRecorder ? ICO.stop : ICO.mic)}${button("Hear my answer", "hear-check", "button secondary", "", ICO.play)}</div>`;
  }
  html += `<div class="spacer"></div>${button(checkIndex === questions.length - 1 ? "See my suggested starting point" : "Next", "check-next")}`;
  if (q.kind) html += `<p>${button("Skip this question", "check-skip", "button secondary")}</p>`;
  return html;
}

const FOCUS = {
  Tenses: "Tenses: when to use the present, past and future forms.",
  Words: "Everyday and work vocabulary.",
  Reading: "Reading short messages, signs and emails.",
  Listening: "Understanding speech at normal speed.",
};

function resultsScreen() {
  const scores = results(state.answers);
  const rank = (s) => ["A1", "A2", "B1", "B2"].indexOf(s);
  const scored = Object.keys(FOCUS).filter((s) => rank(scores[s]) >= 0).sort((a, b) => rank(scores[a]) - rank(scores[b]));
  const recorded = state.answers.some((a) => a.section === "Speaking" && a.response);
  const focus = [...scored.slice(0, 2).map((s) => FOCUS[s]), recorded ? "Sounds: chosen later from your speaking recordings." : "Sentence building and word order."];
  const row = (s) => {
    const v = scores[s];
    const shown = ["Speaking", "Writing"].includes(s) ? (state.answers.some((a) => a.section === s && a.response) ? "Saved for review" : "Skipped") : v || "—";
    const pct = rank(v) >= 0 ? (rank(v) + 1) * 25 : 0;
    return `<div class="card"><div class="top"><strong>${s}</strong><strong>${escape(shown)}</strong></div>${pct ? `<div class="bar"><span style="width:${pct}%"></span></div>` : ""}</div>`;
  };
  return `<div class="eyebrow">ENGLISH LEVEL CHECK</div><h1>Your suggested starting point</h1>
  <p>From your answers. Your first week of lessons will confirm or adjust it. A1 is beginner, B2 is confident at work.</p>
  ${["Tenses", "Words", "Reading", "Listening", "Speaking", "Writing"].map(row).join("")}
  <div class="card warm"><h2>Your first focus</h2>${focus.map((f, i) => `<p>${i + 1} · ${escape(f)}</p>`).join("")}</div>
  <div class="card"><h2>Your plan</h2><p>English: start at Unit 1, with extra tense practice. Kiswahili: start from the beginning.</p></div>
  ${button("Start my first lesson", "today")}`;
}

function reviewScreen() {
  const queue = todaysQueue();
  const item = queue[0];
  if (!item) return `<h1>${escape(tr("review"))}</h1><div class="card"><h2>All done for today</h2><p>New words and corrections come back on later days.</p></div>`;
  return `<h1>${escape(tr("reviewHead"))}</h1><p class="muted">${queue.length} left today</p>
  <div class="card"><span class="eyebrow">${item.lang === "sw" ? "KISWAHILI" : "ENGLISH"}</span> ${draft(item.lang)}
  <h2>${escape(item.prompt)}</h2><p>Say it or type it before you look.</p>
  <label for="recall">Your answer</label><input id="recall" autocomplete="off" autocapitalize="off">
  <div id="reveal">${button(tr("showAns"), "reveal")}</div></div>`;
}

let phraseFilter = "All";
function phrasebookScreen() {
  return `<h1>${escape(tr("phraseHead"))}</h1><p>${state.phrasebook.length} saved · everything here comes back in your review</p>
  <div class="row" role="group" aria-label="Filter">${["All", "Work", "Everyday", "Kiswahili"].map((t) => button(t, "filter:" + t, phraseFilter === t ? "button" : "button secondary", `aria-pressed="${phraseFilter === t}"`)).join("")}</div>
  ${phraseList()}
  <div class="card"><h2>Add a word or sentence</h2>
  <label for="phrase">Word or sentence</label><input id="phrase" maxlength="220" value="${escape(drafts.phrase)}">
  <label for="meaning">What it means, or when to use it</label><input id="meaning" maxlength="220" value="${escape(drafts.meaning)}">
  <label for="phrase-lang">Language</label><select id="phrase-lang"><option value="en">English</option><option value="sw">Kiswahili</option></select>
  <div class="spacer"></div>${button("Save and review later", "phrase-add")}</div>`;
}
function phraseList() {
  const list = state.phrasebook.filter((p) =>
    phraseFilter === "All" ? true : phraseFilter === "Kiswahili" ? p.lang === "sw" : p.lang === "en" && p.tag.toLowerCase() === phraseFilter.toLowerCase(),
  );
  return list.length
    ? list.map((p) => {
        const canAudio = p.lang === "en" || (p.lang === "sw" && canSpeakSw());
        return `<div class="card"><strong>${escape(p.answer)}</strong> ${draft(p.lang)}<p class="muted small">${escape(p.prompt)}</p>${canAudio ? button(tr("listen"), "say:" + p.id, "button secondary", "", ICO.play) : ""}</div>`;
      }).join("")
    : '<p class="muted">Nothing saved here yet.</p>';
}

function progressScreen() {
  const done = state.completed;
  const known = state.reviews.filter((x) => x.box >= 2).length;
  const recentWriting = [...(state.writing || [])].sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 8);
  const allLessons = [...(unit.en?.lessons || []), ...(unit.sw?.lessons || [])];
  const lessonTitle = (id) => allLessons.find((x) => x.id === id)?.title || id;

  return `<h1>${escape(tr("progressHead"))}</h1>
  <div class="row stats"><div class="card"><strong>${state.days}</strong><p>days learning</p></div><div class="card"><strong>${known}</strong><p>words known</p></div><div class="card"><strong>${todaysQueue().length}</strong><p>due today</p></div></div>
  ${["en", "sw"].map((lang) => `<h2>${lang === "en" ? "English" : "Kiswahili"}</h2>${unit[lang].canDo
    .map((text, i) => {
      const ok = done[lang]?.includes(unit[lang].lessons[i]?.id);
      return `<button class="card can can-btn ${ok ? "done" : ""}" data-action="open-lesson:${lang}:${i}">
        <div class="top"><strong>${escape(text)}</strong><span class="small muted">${ok ? escape(tr("done")) + " · Replay" : "Open lesson"}</span></div>
      </button>`;
    })
    .join("")}`).join("")}
  <h2>My saved classwork</h2>
  ${recentWriting.length
    ? `<div class="card">${recentWriting.map((w, idx) => `<div class="${idx ? "classwork-item" : ""}">
        <div class="small muted">${escape(lessonTitle(w.lesson))} · ${escape(w.date || "")}</div>
        <p style="margin:4px 0"><strong>${escape(w.text)}</strong></p>
      </div>`).join("")}</div>`
    : '<p class="muted">Your written “Use it” replies from lessons will appear here across all your devices.</p>'}
  <h2>My recordings</h2><p class="muted">Voice recordings stay stored only on the device where you recorded them.</p>`;
}

function taskScreen() {
  const lang = state.language, task = unit[lang].weeklyTask, entry = state.tasks[lang] || {};
  const corrections = (entry.corrections || []).filter(Boolean);
  const answerVal = drafts.taskLang === lang ? drafts.taskText : (entry.answer || "");
  return `<div class="top">${button(tr("back"), "today", "button secondary", "", ICO.back)}</div>
  <p class="eyebrow">WEEKLY TASK · ${lang === "en" ? "ENGLISH" : "KISWAHILI"}</p><h1>${escape(task.prompt)}</h1>${draft(lang)}
  <div class="card"><p><strong>Include:</strong> ${task.checklist.map(escape).join(" · ")}</p>
  <div class="row">${button(activeRecorder ? "Stop recording" : "Record", "record-task", activeRecorder ? "button" : "button secondary", "", activeRecorder ? ICO.stop : ICO.mic)}${button("Hear my recording", "hear-task", "button secondary", "", ICO.play)}</div>
  <label for="task-answer">Or write it here</label><textarea id="task-answer">${escape(answerVal)}</textarea>
  <div class="spacer"></div>${button(tr("save"), "task-save")}</div>
  ${entry.good || corrections.length ? `<div class="feedback"><strong>What went well</strong><p>${escape(entry.good || "")}</p>
    ${corrections.map((c, i) => `<p>${escape(c)}</p>${button("Save to my phrasebook", "correction:" + i, "button secondary")}`).join("")}</div>` : ""}
  <details class="card tutor"><summary>For the tutor: add feedback</summary>
  <p class="small muted">Listen to the recording on this phone, then write what went well and up to three corrections as “You said … / Better … / Why …”.</p>
  <label for="task-good">What went well</label><textarea id="task-good">${escape(entry.good || "")}</textarea>
  ${[0, 1, 2].map((i) => `<label for="task-c${i}">Correction ${i + 1}</label><textarea id="task-c${i}" placeholder="You said … / Better … / Why …">${escape(entry.corrections?.[i] || "")}</textarea>`).join("")}
  <div class="spacer"></div>${button("Save feedback", "task-feedback", "button secondary")}</details>`;
}

function voiceCard() {
  const voices = englishVoices();
  if (!voices.length) return "";
  const opts = voices
    .map((v) => `<option value="${escape(v.voiceURI)}" ${state.voiceURI === v.voiceURI ? "selected" : ""}>${escape(v.name)} (${escape(v.lang)})</option>`)
    .join("");
  return `<div class="card"><h2>English reading voice</h2>
  <label for="voice">Voice</label><select id="voice"><option value="">Automatic (most natural on this phone)</option>${opts}</select>
  <div class="spacer"></div>${button("Test the voice", "test-voice", "button secondary")}
  <p class="small muted">On iPhone, more natural voices can be downloaded in Settings → Accessibility → Spoken Content → Voices → English. Choose one marked “Enhanced” or “Premium”, then pick it here.</p></div>`;
}

function settingsScreen() {
  const swAvailable = hasSwVoice();
  const pill = syncLabel();
  let acctHtml;
  if (!firebaseConfig) {
    acctHtml = "<p>Progress is saved on this device.</p>";
  } else if (authUid || user) {
    const emailText = user?.email ? ` (${escape(user.email)})` : "";
    const timeNote = lastSyncedAt ? ` · Last synced ${lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "";
    acctHtml = `<p>Signed in${emailText}. <span class="sync-pill ${pill.cls}"><span class="dot"></span>${escape(pill.text)}</span><span class="small muted">${escape(timeNote)}</span></p>
      ${syncMsg ? `<p class="warning small">${escape(syncMsg)}</p>` : ""}
      <label for="profile-name">Your display name</label>
      <div class="row"><input id="profile-name" value="${escape(state.name || "")}" maxlength="40" placeholder="Your name">${button("Save name", "save-name", "button secondary")}</div>
      <div class="spacer"></div>
      <div class="row">${button("Sync now", "sync-now", "button secondary")}${button("Sign out", "signout", "button secondary")}</div>
      <p class="small muted">Signing out safely saves your progress and clears this learner session so another person can sign in.</p>`;
  } else {
    acctHtml = `<p>You are currently using <strong>Guest mode</strong> on this device only.</p>
      <p class="small muted">Sign in or create a learner account to access your lessons, phrasebook, and classwork from any phone or computer.</p>
      ${button("Sign in / Create account", "auth", "button", "", ICO.user)}`;
  }

  return `<div class="top">${button(tr("back"), "today", "button secondary", "", ICO.back)}</div><h1>${escape(tr("settings"))}</h1>
  <div class="card"><h2>Learner account & sync</h2>${acctHtml}</div>
  ${languageSelect()}
  ${voiceCard()}
  <div class="card"><h2>Kiswahili audio</h2>
    <p class="small muted">Recorded fluent-speaker Kiswahili audio is coming. You can optionally try your phone’s built-in Kiswahili voice as a draft preview.</p>
    ${button(`Phone’s Kiswahili voice: ${state.swVoice ? "On" : "Off"}`, "toggle-sw-voice", state.swVoice ? "button" : "button secondary")}
    <p class="small muted">${swAvailable ? "A Kiswahili voice was detected on this browser." : "No Kiswahili voice detected on this browser right now."}</p>
  </div>
  <p class="muted small">Voice recordings stay only on the device where they were recorded.</p>`;
}

function showToast(msg) {
  document.querySelector(".toast")?.remove();
  clearTimeout(toastTimer);
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `<span>${escape(msg)}</span><button type="button" data-action="dismiss-toast" aria-label="Dismiss notice">×</button>`;
  document.body.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), 4500);
}

function render() {
  setPreferredVoice(state.voiceURI);
  const screens = { welcome: welcomeScreen, auth: authScreen, today: todayScreen, lesson: lessonScreen, check: checkScreen, results: resultsScreen, review: reviewScreen, phrasebook: phrasebookScreen, progress: progressScreen, task: taskScreen, settings: settingsScreen };
  const body = (screens[route] || todayScreen)();
  $.innerHTML = shell(body, !["welcome", "auth", "check", "results", "lesson"].includes(route));
  if (status) {
    showToast(status);
    status = "";
  }
}

// ---------- actions ----------
function enqueue(id, prompt, answer, lang = state.language, tag = "everyday") {
  if (!state.reviews.some((x) => x.id === id)) state.reviews = merge(state.reviews, add({ id, prompt, answer, lang, tag }));
}
function countDay() {
  if (state.lastDay !== day()) { state.days++; state.lastDay = day(); }
}
function wordCard(w, lang) {
  let cue = w.meaning;
  if (state.explain === "fr" && w.fr) cue = `${w.fr} — ${w.meaning}`;
  else if (state.explain === "rw" && w.rw) cue = `${w.rw} — ${w.meaning}`;
  return { prompt: cue, answer: `${w.text} — “${w.example}”` };
}
const recKey = (raw) => recordingKey(authUid, raw);
const RECORD_KEYS = {
  record: () => recKey(`lesson-${current().id}-${speakIndex}`),
  read: () => recKey(`read-${current().id}`),
  "record-use": () => recKey(`use-${current().id}`),
  "record-check": () => recKey(`check-${questions[checkIndex].id}`),
  "record-task": () => recKey(`task-${state.language}`),
  "record-read": () => recKey(`read-${current().id}`),
};
const HEAR_KEYS = { "hear-read": "record-read", "hear-me": "record", "hear-use": "record-use", "hear-check": "record-check", "hear-task": "record-task" };

async function stopRecording() {
  if (!activeRecorder) return;
  const r = activeRecorder;
  activeRecorder = null;
  await r.stop();
}

function resetPracticeState() {
  selected = null;
  checked = false;
  orderPicked = [];
  typedAnswer = "";
}

function clearAllDrafts() {
  Object.keys(drafts).forEach((k) => { drafts[k] = ""; });
}

async function action(a) {
  if (a === "dismiss-toast") { document.querySelector(".toast")?.remove(); return; }
  captureDrafts();
  if (activeRecorder && !(a in RECORD_KEYS)) await stopRecording();
  const l = current();

  if (a.startsWith("auth-mode:")) { authMode = a.slice(10); return render(); }
  if (a.startsWith("choose-")) { state.language = a.slice(7); await persist(); return goto(route === "welcome" ? "today" : route); }
  if (["today", "review", "phrasebook", "progress", "settings", "task", "auth"].includes(a)) return goto(a);
  if (a === "toggle-sw-voice") {
    state.swVoice = !state.swVoice;
    await persist();
    status = state.swVoice
      ? (hasSwVoice() ? "Phone’s Kiswahili voice enabled (draft)." : "Kiswahili voice enabled, though this browser reports no sw voice yet.")
      : "Phone’s Kiswahili voice turned off.";
    return render();
  }
  if (a === "save-name") {
    const nm = document.querySelector("#profile-name")?.value?.trim() || "";
    if (!nm) { status = "Please enter your name."; return render(); }
    state.name = nm;
    await persist();
    status = "Name updated.";
    return render();
  }
  if (a === "sync-now") {
    if (!navigator.onLine) { status = "You are offline. Connect to sync."; return render(); }
    if (!auth) await initFirebase();
    await persist();
    status = syncState === "synced" ? "Progress synced to your account." : (syncMsg || "Sync checked.");
    return render();
  }

  // lesson selection & launch
  if (a.startsWith("select-lesson:")) {
    state.selectedLesson[state.language] = Number(a.slice(14));
    await persist();
    step = 0; practice = 0; speakIndex = 0; showTranslation = false; resetPracticeState();
    return goto("lesson");
  }
  if (a.startsWith("open-lesson:")) {
    const [, lang, idxStr] = a.split(":");
    state.language = lang;
    state.selectedLesson[lang] = Number(idxStr);
    await persist();
    step = 0; practice = 0; speakIndex = 0; showTranslation = false; resetPracticeState();
    return goto("lesson");
  }

  // level check
  if (a === "check-start") { state.answers = []; checkIndex = 0; checkHistory = []; selected = null; drafts.checkText = ""; return goto("check"); }
  if (a === "check-back") {
    if (!checkHistory.length) return goto(state.completed.en.length || state.completed.sw.length ? "today" : "welcome");
    const h = checkHistory.pop();
    state.answers.splice(state.answers.length - h.added, h.added);
    checkIndex = h.from; selected = null; return render();
  }
  if (a === "check-audio") return void speak(questions[checkIndex].audio);
  if (a === "check-next" || a === "check-skip") {
    const q = questions[checkIndex];
    let response = null;
    if (a === "check-next") {
      if (q.kind === "write") response = document.querySelector("#check-write")?.value?.trim() || null;
      else if (q.kind === "record") response = (await get(RECORD_KEYS["record-check"](), "recordings")) ? "recording saved" : null;
      else response = selected;
      if (response === null) { status = q.kind === "record" ? "Record an answer, or skip this question." : q.kind ? "Write an answer, or skip this question." : "Choose an answer first."; return render(); }
    }
    const from = checkIndex;
    const added = [{ id: q.id, section: q.section, level: q.level, correct: q.options ? response === q.answer : null, response }];
    state.answers.push(...added);
    let next = checkIndex + 1;
    if (q.options && shouldStop(state.answers.filter((x) => x.section === q.section))) {
      while (questions[next]?.section === q.section) {
        const s = questions[next];
        const skip = { id: s.id, section: s.section, level: s.level, correct: false, response: null, skipped: true };
        state.answers.push(skip); added.push(skip); next++;
      }
    }
    checkHistory.push({ from, added: added.length });
    selected = null; drafts.checkId = ""; drafts.checkText = "";
    if (next < questions.length) { checkIndex = next; return render(); }
    state.answersUpdated = Date.now();
    await persist();
    return goto("results");
  }

  // lesson flow
  if (a === "lesson-start") { step = 0; practice = 0; speakIndex = 0; showTranslation = false; resetPracticeState(); return goto("lesson"); }
  if (a === "step-next") { step++; return render(); }
  if (a === "toggle-translation") { showTranslation = !showTranslation; return render(); }
  if (a === "play-dialogue" || a === "play-slow") {
    if (state.language === "sw" && !canSpeakSw()) { status = "Kiswahili audio will be added after a fluent speaker records it."; return render(); }
    for (const x of l.dialogue) { if (route !== "lesson" || step !== 0) break; await speak(x.text, state.language, a === "play-slow" ? 0.75 : 1, state.swVoice); }
    return;
  }
  if (a.startsWith("say-word:")) return void speak(l.words[Number(a.slice(9))].example, state.language, 1, state.swVoice);
  if (a.startsWith("save-word:")) {
    const w = l.words[Number(a.slice(10))];
    const id = `${l.id}-w-${w.text}`;
    const c = wordCard(w, state.language);
    if (!state.phrasebook.some((p) => p.id === id)) state.phrasebook.push({ id, prompt: c.prompt, answer: w.text, lang: state.language, tag: l.strand, updated: Date.now() });
    enqueue(id, c.prompt, c.answer, state.language, l.strand);
    await persist(); status = "Saved to your phrasebook."; return render();
  }
  if (a.startsWith("answer:")) { if (!checked) { selected = Number(a.slice(7)); render(); } return; }
  if (a.startsWith("order-pick:")) {
    if (checked) return;
    const q = l.practice[practice];
    const chipId = Number(a.slice(11));
    if (!orderPicked.some((c) => c.id === chipId) && q.chips[chipId] !== undefined) {
      orderPicked.push({ id: chipId, text: q.chips[chipId] });
      render();
    }
    return;
  }
  if (a.startsWith("order-unpick:")) {
    if (checked) return;
    orderPicked.splice(Number(a.slice(13)), 1);
    return render();
  }
  if (a === "order-clear") { if (!checked) { orderPicked = []; render(); } return; }
  if (a === "practice-check") {
    const q = l.practice[practice];
    const type = q.type || "choice";
    if (type === "choice" && selected === null) { status = "Choose an answer first."; return render(); }
    if (type === "order" && !orderPicked.length) { status = "Tap the words to build your answer first."; return render(); }
    if ((type === "gap" || type === "fix")) {
      typedAnswer = document.querySelector("#practice-input")?.value ?? typedAnswer;
      if (!typedAnswer.trim()) { status = "Type your answer first."; return render(); }
    }
    checked = true;
    const userVal = type === "choice" ? selected : type === "order" ? orderPicked.map((c) => c.text) : typedAnswer;
    if (!checkPracticeAnswer(q, userVal)) {
      enqueue(`${l.id}-q${practice}`, q.prompt || q.wrong, fullSentenceForReview(q), state.language, l.strand);
    }
    await persist(); return render();
  }
  if (a === "practice-next") {
    resetPracticeState();
    if (practice < l.practice.length - 1) practice++; else { practice = 0; step++; }
    return render();
  }
  if (a === "model") {
    if (speak(l.speak[speakIndex], state.language, 1, state.swVoice) === false) { status = "Kiswahili audio will be added after a fluent speaker records it."; render(); }
    return;
  }
  if (a === "speak-next") { if (speakIndex < l.speak.length - 1) speakIndex++; else step++; return render(); }
  if (a === "hear-both") {
    const p = speak(l.speak[speakIndex], state.language, 1, state.swVoice);
    if (p) await p;
    if (!(await playback(RECORD_KEYS.record()))) { status = "Record yourself first."; render(); }
    return;
  }
  if (a.startsWith("say-text:")) return void speak(a.slice(9));
  if (a.startsWith("check-pron:")) {
    const l = current();
    const which = a.slice(11);
    const key = which === "read" ? RECORD_KEYS.read() : RECORD_KEYS.record();
    const text = which === "read" ? yourPart(l) : l.speak[speakIndex];
    if (!user) { pron[key] = { error: "Sign in (Settings) to use reading feedback." }; return render(); }
    if (!navigator.onLine) { pron[key] = { error: "Reading feedback needs the internet." }; return render(); }
    const blob = await get(key, "recordings");
    if (!blob) { pron[key] = { error: "Record yourself first, then tap Check." }; return render(); }
    pron[key] = "busy"; render();
    try {
      const { wav, seconds } = await toWav16k(blob);
      if (seconds > 30) { pron[key] = { error: "Please keep the recording under 30 seconds." }; return render(); }
      const token = await user.getIdToken();
      const r = await fetch("/api/pronounce", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ text, lang: state.language, audio: toBase64(wav) }),
      });
      const data = await r.json().catch(() => ({ error: "Unexpected answer from the server." }));
      pron[key] = r.ok ? data : { error: data.error || "Reading feedback is not available right now." };
      if (r.ok && data.heard) {
        for (const w of data.practise) enqueue(`pron-${state.language}-${w}`, `Say clearly: “${w}” (from “${text.length > 70 ? text.slice(0, 70) + "…" : text}”)`, w, state.language, l.strand);
        if (data.practise.length) await persist();
      }
    } catch (e) {
      pron[key] = { error: "Could not check the reading: " + e.message };
    }
    return render();
  }
  if (a === "recognize") {
    const box = document.querySelector("#heard");
    box.textContent = "Listening… say the sentence now.";
    const heard = await listen(state.language);
    const el = document.querySelector("#heard");
    if (!el) return;
    if (heard === undefined) el.textContent = "This browser cannot listen. You can still record yourself and use Hear both.";
    else if (!heard) el.textContent = "The phone did not catch that. Check the internet connection and try again.";
    else {
      const cmp = compareWords(l.speak[speakIndex], heard);
      el.innerHTML = `<p><strong>I heard:</strong> “${cmp.words.map((w) => (w.ok ? escape(w.word) : `<mark>${escape(w.word)}</mark>`)).join(" ")}”</p>` +
        (cmp.same ? "<p>That matches the sentence.</p>" : `<p>${cmp.missing.length ? `Not heard: <strong>${escape(cmp.missing.join(" "))}</strong>. ` : ""}Listen to the model and try once more.</p>`) +
        '<p class="small muted">This is what the phone understood, not a pronunciation score.</p>';
    }
    return;
  }
  if (a === "finish") {
    const text = document.querySelector("#use-answer")?.value?.trim();
    if (text) state.writing = [...(state.writing || []), { id: crypto.randomUUID(), lesson: l.id, prompt: l.useIt.prompt, text, lang: state.language, date: day(), updated: Date.now() }];
    state.completed[state.language] = [...new Set([...state.completed[state.language], l.id])];
    const nextIdx = lessons().findIndex((x) => !state.completed[state.language].includes(x.id));
    state.selectedLesson[state.language] = nextIdx >= 0 ? nextIdx : null;
    for (const w of l.words) { const c = wordCard(w, state.language); enqueue(`${l.id}-w-${w.text}`, c.prompt, c.answer, state.language, l.strand); }
    drafts.useKey = ""; drafts.useText = "";
    countDay();
    await persist();
    status = "Lesson finished. Its words will come back in your review.";
    return goto("today");
  }

  // review
  if (a === "reveal") {
    const item = todaysQueue()[0];
    if (!item) return;
    const recallVal = document.querySelector("#recall")?.value?.trim() || "";
    let diffHtml = "";
    if (recallVal) {
      const targetCore = item.answer.split(" — ")[0];
      const cmp = compareWords(targetCore, recallVal);
      diffHtml = cmp.same
        ? '<p class="small"><strong>Matches the answer.</strong></p>'
        : `<p class="small"><strong>You typed:</strong> “${cmp.words.map((w) => (w.ok ? escape(w.word) : `<mark>${escape(w.word)}</mark>`)).join(" ")}”</p>`;
    }
    const canAudio = item.lang === "en" || (item.lang === "sw" && canSpeakSw());
    document.querySelector("#reveal").innerHTML = `<p class="answer"><strong>${escape(item.answer)}</strong></p>${diffHtml}
    ${canAudio ? `<p>${button(tr("listen"), "review-listen", "button secondary", "", ICO.play)}</p>` : ""}
    <div class="row">${button(tr("again"), "grade:again", "button secondary")}${button(tr("effort"), "grade:effort", "button secondary")}${button(tr("easy"), "grade:easy")}</div>`;
    return;
  }
  if (a === "review-listen") {
    const item = todaysQueue()[0];
    if (item) speak(item.answer.split(" — ")[0], item.lang, 1, state.swVoice);
    return;
  }
  if (a.startsWith("grade:")) {
    const item = todaysQueue()[0];
    if (!item) return render();
    state.reviewLog = logReview(state.reviewLog, item);
    state.reviews = merge(state.reviews, grade(item, a.slice(6)));
    countDay();
    await persist(); return render();
  }

  // phrasebook
  if (a.startsWith("filter:")) { phraseFilter = a.slice(7); return render(); }
  if (a.startsWith("say:")) { const p = state.phrasebook.find((x) => x.id === a.slice(4)); if (p) speak(p.answer, p.lang, 1, state.swVoice); return; }
  if (a === "phrase-add") {
    const answer = document.querySelector("#phrase").value.trim(), prompt = document.querySelector("#meaning").value.trim(), lang = document.querySelector("#phrase-lang").value;
    if (!answer || !prompt) { status = "Please fill in both boxes."; return render(); }
    const p = { id: crypto.randomUUID(), prompt, answer, lang, tag: "everyday", updated: Date.now() };
    state.phrasebook.push(p); enqueue(p.id, p.prompt, p.answer, p.lang, p.tag);
    drafts.phrase = ""; drafts.meaning = "";
    await persist(); status = "Saved. It will come back in your review."; return render();
  }

  // weekly task
  if (a === "task-save" || a === "task-feedback") {
    const lang = state.language, val = (id) => document.querySelector(id)?.value ?? "";
    state.tasks[lang] = { ...(state.tasks[lang] || {}), answer: val("#task-answer"), good: val("#task-good"), corrections: [0, 1, 2].map((i) => val("#task-c" + i)), updated: Date.now() };
    drafts.taskLang = ""; drafts.taskText = "";
    await persist(); status = "Saved."; return render();
  }
  if (a.startsWith("correction:")) {
    const c = (state.tasks[state.language]?.corrections || []).filter(Boolean)[Number(a.slice(11))];
    if (!c) return;
    const better = c.match(/better\s*[:…-]?\s*(.+?)(?:\s*\/\s*why|$)/i)?.[1]?.trim() || c;
    const p = { id: "corr-" + c, prompt: "Say it correctly: " + (c.match(/you said\s*[:…-]?\s*(.+?)(?:\s*\/|$)/i)?.[1]?.trim() || "my correction"), answer: better, lang: state.language, tag: "everyday", updated: Date.now() };
    if (!state.phrasebook.some((x) => x.id === p.id)) state.phrasebook.push(p);
    enqueue(p.id, p.prompt, p.answer, p.lang, p.tag);
    await persist(); status = "Saved to your phrasebook."; return render();
  }

  // account
  if (a === "test-voice") { speak("Hi Grace. I'm sorry, I'm running late. I'll call you as soon as I arrive."); return; }
  if (a === "signin") return passwordAuth("signin");
  if (a === "signup") return passwordAuth("create");
  if (a === "reset") return passwordAuth("reset");
  if (a === "signout") {
    await persist();
    if (auth) await auth.signOut();
    user = null;
    authUid = null;
    await setActiveUid(null);
    state = await load(null);
    syncState = "local";
    syncMsg = "";
    lastSyncedAt = null;
    authMode = "signin";
    clearAllDrafts();
    resetPracticeState();
    status = "Signed out safely.";
    return goto("auth");
  }

  // recording
  if (a in RECORD_KEYS) {
    if (activeRecorder) { await stopRecording(); status = "Recording saved on this device."; return render(); }
    try { const k = RECORD_KEYS[a](); delete pron[k]; activeRecorder = await record(k); status = "Recording… press Stop when you finish."; }
    catch (e) { status = e.name === "NotAllowedError" ? "Please allow the microphone to record." : e.message; }
    return render();
  }
  if (a in HEAR_KEYS) {
    if (!(await playback(RECORD_KEYS[HEAR_KEYS[a]]()))) { status = "No recording saved yet."; render(); }
    return;
  }
}

// ---------- events and start-up ----------
$.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  e.preventDefault();
  try { await action(b.dataset.action); } catch (err) { console.error(err); status = "Something went wrong: " + err.message; render(); }
});
document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-action='dismiss-toast']")) {
    e.preventDefault();
    document.querySelector(".toast")?.remove();
  }
});
$.addEventListener("input", (e) => {
  if (e.target.id === "practice-input") typedAnswer = e.target.value;
  captureDrafts();
});
$.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "practice-input" && !checked) { e.preventDefault(); action("practice-check"); }
  else if (e.target.id === "recall") { e.preventDefault(); action("reveal"); }
});
$.addEventListener("change", async (e) => {
  if (e.target.id === "explain") { state.explain = e.target.value; await persist(); render(); }
  if (e.target.id === "voice") { state.voiceURI = e.target.value; setPreferredVoice(state.voiceURI); await persist(); speak("I'll call you as soon as I arrive."); }
});
window.addEventListener("popstate", async () => {
  const next = location.hash.slice(1) || (authUid ? "today" : "welcome");
  if (next === route) return;
  await stopRecording();
  route = next;
  render();
  scrollTo(0, 0);
});
window.addEventListener("online", () => {
  if (authUid) { syncState = "syncing"; render(); }
  auth ? sync().then(() => render()) : initFirebase();
});
window.addEventListener("offline", () => {
  if (authUid) { syncState = "offline"; render(); }
});
if ("speechSynthesis" in window) {
  try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => { if (["lesson", "settings"].includes(route)) render(); }; } catch {}
}

const fresh = !authUid && !state.completed.en.length && !state.completed.sw.length && !state.answers.length && !state.reviews.length;
route = location.hash.slice(1) || (fresh ? "welcome" : "today");
if (["lesson", "check", "results"].includes(route) && !location.hash.includes("results")) route = fresh ? "welcome" : "today";
render();
initFirebase();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
