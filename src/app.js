import { load, save, get, initial } from "./store.js";
import { add, grade, dueToday, logReview, merge, mergeLists, day } from "./srs.js";
import { shouldStop, results } from "./levelcheck.js";
import { speak, record, playback, listen } from "./speech.js";
import { compareWords } from "./compare.js";
import { firebaseConfig } from "./config.js";

const $ = document.querySelector("#app");
const FIREBASE = "https://www.gstatic.com/firebasejs/11.10.0/";

// ---------- state ----------
let state = await load();
let unit = {}, questions = [];
let route = "welcome";
// screen-local UI state
let step = 0, practice = 0, speakIndex = 0, selected = null, checked = false, showTranslation = false;
let checkIndex = 0, checkHistory = [];
let activeRecorder = null, status = "";

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

// ---------- small helpers ----------
const i18n = {
  en: { today: "Today", review: "Review", phrasebook: "Phrasebook", progress: "Progress", settings: "Settings" },
  fr: { today: "Aujourd’hui", review: "Révision", phrasebook: "Mes phrases", progress: "Progrès", settings: "Paramètres" },
  rw: { today: "Uyu munsi", review: "Isubiramo", phrasebook: "Amagambo yanjye", progress: "Iterambere", settings: "Igenamiterere" },
};
const tr = (k) => i18n[state.explain]?.[k] || i18n.en[k];
const explainText = (obj) => obj?.[state.explain] || obj?.en || "";
const fallbackNote = (obj) =>
  state.explain !== "en" && obj && !obj[state.explain] ? '<p class="small muted">Translation coming · showing English.</p>' : "";
const draft = (lang) => (lang === "sw" ? '<span class="pill">Draft · to be checked by a fluent speaker</span>' : "");
const button = (label, action, cls = "button", extra = "") =>
  `<button class="${cls}" data-action="${action}" ${extra}>${escape(label)}</button>`;
const nav = () =>
  `<nav class="nav" aria-label="Main navigation">${["today", "review", "phrasebook", "progress"]
    .map((r) => `<a href="#${r}" class="${route === r ? "active" : ""}" ${route === r ? 'aria-current="page"' : ""}>${tr(r)}</a>`)
    .join("")}</nav>`;
const shell = (body, withNav = true) => `<main class="shell">${body}</main>${withNav ? nav() : ""}`;
const lessons = () => unit[state.language].lessons;
const current = () => lessons()[(state.completed[state.language] || []).length % lessons().length];
const todaysQueue = () => dueToday(state.reviews, day(), state.reviewLog);

// Stable shuffle per question id, so the correct answer is not always in the same place.
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

// Translation of a dialogue line in her explanation language. Kinyarwanda is not written yet: French is shown.
function lineTranslation(x) {
  if (state.language === "sw" && state.explain === "en") return x.en;
  return x.fr || x.en || "";
}

const persist = async () => {
  await save(state);
  sync();
};
const goto = (r) => {
  route = r;
  if (location.hash.slice(1) !== r) history.pushState(null, "", "#" + r);
  render();
  scrollTo(0, 0);
};

// ---------- sync (Firebase) ----------
let user = null, auth = null, remote = null;

function mergeState(local, cloud) {
  const later = (a, b, key) => ((a?.[key] || 0) >= (b?.[key] || 0) ? a : b);
  const logs = [local.reviewLog, cloud.reviewLog].filter(Boolean);
  const reviewLog = logs.reduce((acc, l) => {
    if (!acc || l.date > acc.date) return l;
    if (l.date === acc.date) return { date: l.date, reviewed: Math.max(acc.reviewed, l.reviewed), fresh: Math.max(acc.fresh, l.fresh) };
    return acc;
  }, null);
  const tasks = { ...cloud.tasks };
  for (const [lang, t] of Object.entries(local.tasks || {})) tasks[lang] = later(t, tasks[lang], "updated");
  const check = later(local, cloud, "answersUpdated");
  return {
    ...initial,
    ...cloud,
    ...local,
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
  };
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
    if (A.isSignInWithEmailLink(auth, location.href)) {
      const email = localStorage.getItem("twige-email") || prompt("Please type the email address that received the sign-in link");
      if (email) {
        await A.signInWithEmailLink(auth, email, location.href);
        localStorage.removeItem("twige-email");
      }
      history.replaceState(null, "", "/#today");
      route = "today";
    }
    A.onAuthStateChanged(auth, async (u) => {
      user = u;
      // Re-render only screens that show account state, so typing elsewhere is never wiped.
      const refresh = () => ["settings", "today", "progress"].includes(route) && render();
      if (!u) return refresh();
      try {
        if (state.accountUid && state.accountUid !== u.uid) state = { ...initial, language: state.language, explain: state.explain };
        state.accountUid = u.uid;
        const snap = await remote.getDoc(remote.doc(remote.db, "users", u.uid, "progress", "current"));
        if (snap.exists()) state = mergeState(state, snap.data());
        await save(state);
        await sync();
      } catch (e) {
        console.warn("Could not load saved progress", e);
      }
      refresh();
    });
  } catch (e) {
    console.warn("Sync unavailable", e);
  }
}

async function sync() {
  if (!user || !remote || !navigator.onLine) return;
  try {
    await remote.setDoc(remote.doc(remote.db, "users", user.uid, "progress", "current"), JSON.parse(JSON.stringify(state)));
  } catch (e) {
    console.warn("Sync failed", e);
  }
}

// Email + password sign-in: works inside an iPhone Home Screen app (an emailed link would open
// in Safari, which keeps separate storage from the Home Screen app).
const authMessage = (e) =>
  ({
    "auth/invalid-credential": "The email or password is not right. Try again, or tap “Forgot password”.",
    "auth/wrong-password": "The password is not right. Try again, or tap “Forgot password”.",
    "auth/user-not-found": "No account with this email yet. Tap “Create account”.",
    "auth/email-already-in-use": "This email already has an account. Tap “Sign in” instead.",
    "auth/weak-password": "Please use at least 6 characters for the password.",
    "auth/invalid-email": "Please check the email address.",
    "auth/network-request-failed": "No internet connection. Try again when you are online.",
    "auth/too-many-requests": "Too many tries. Please wait a few minutes and try again.",
  })[e.code] || "Could not sign in: " + e.message;

async function passwordAuth(kind) {
  const email = document.querySelector("#email")?.value.trim();
  const password = document.querySelector("#password")?.value || "";
  if (!email) { status = "Please type your email address."; return render(); }
  const A = remote.A;
  try {
    if (kind === "reset") {
      await A.sendPasswordResetEmail(auth, email);
      status = "We sent a link to " + email + " to choose a new password. Then come back here and sign in.";
    } else {
      if (!password) { status = "Please type your password."; return render(); }
      if (kind === "create") await A.createUserWithEmailAndPassword(auth, email, password);
      else await A.signInWithEmailAndPassword(auth, email, password);
      status = "Signed in. Your progress is now kept on all your devices.";
    }
  } catch (e) {
    status = authMessage(e);
  }
  render();
}

// ---------- screens ----------
function welcomeScreen() {
  return `<div class="eyebrow">TWIGE</div><h1>English and Kiswahili for everyday life and work</h1>
  <p>About 20 minutes a day. Real conversations for home, the city and work.</p>
  <div class="card"><h2>English</h2><p>Tenses, sentence building, pronunciation and vocabulary for daily life and work.</p></div>
  <div class="card"><h2>Kiswahili</h2><p>From the beginning, for life in Nairobi.</p>${draft("sw")}</div>
  ${languageSelect()}
  <div class="spacer"></div>${button("Start the English level check (20 min)", "check-start")}
  <p class="small muted">Kiswahili starts at the beginning, no test needed.</p>
  <p>${button("Skip for now and go to today’s lesson", "today", "button secondary")}</p>`;
}

function todayScreen() {
  const lesson = current();
  const doneCount = (state.completed[state.language] || []).length;
  const n = todaysQueue().length;
  return `<div class="top"><span class="eyebrow">TWIGE</span>${button(tr("settings"), "settings", "button secondary")}</div>
  <h1>Today: about 20 minutes</h1><p>Choose one language for today. Your review is included.</p>
  <div class="row" role="group" aria-label="Today's language">${button("English", "choose-en", state.language === "en" ? "button" : "button secondary", `aria-pressed="${state.language === "en"}"`)}${button("Kiswahili", "choose-sw", state.language === "sw" ? "button" : "button secondary", `aria-pressed="${state.language === "sw"}"`)}</div>
  <div class="card teal"><div class="eyebrow on-dark">${state.language === "en" ? "ENGLISH" : "KISWAHILI"} LESSON · 15 MIN</div>
  <h2>${escape(lesson.title)}</h2><p class="muted">Unit 1 · Lesson ${lessons().indexOf(lesson) + 1} of ${lessons().length}</p>${draft(state.language)}
  ${doneCount >= lessons().length ? '<p class="small">You have finished Unit 1. Repeat the lessons while the next unit is being prepared.</p>' : ""}
  <div class="spacer"></div>${button(state.language === "en" ? "Start" : "Anza", "lesson-start", "button orange")}</div>
  <div class="card"><h2>Review · 5 min</h2><p>${n ? `${n} words and sentences due, both languages` : "Nothing due right now."}</p>${n ? button("Go", "review") : ""}</div>
  <p class="muted small">Extra time? The other language is optional today.</p>
  <div class="card warm"><div class="eyebrow">THIS WEEK’S TASK</div><h2>${escape(unit[state.language].weeklyTask.prompt)}</h2>${button("Open task", "task", "button secondary")}</div>
  ${state.answers.length ? "" : `<p>${button("Take the English level check", "check-start", "button secondary")}</p>`}`;
}

function languageSelect() {
  return `<label for="explain">Explanations in</label><select id="explain">
  <option value="en" ${state.explain === "en" ? "selected" : ""}>English</option>
  <option value="fr" ${state.explain === "fr" ? "selected" : ""}>Français</option>
  <option value="rw" ${state.explain === "rw" ? "selected" : ""}>Ikinyarwanda</option></select>
  <p class="small muted">You can change this at any time.${state.explain === "rw" ? " Kinyarwanda explanations are still being written; French or English is shown until then." : ""}</p>`;
}

const LABELS = ["Listen", "Words", "Pattern", "Practise", "Speak", "Use it"];

function lessonScreen() {
  const l = current();
  let html = `<div class="top">${button("Close", "today", "button secondary")}<span class="eyebrow">Step ${step + 1} of 6 · ${LABELS[step]}</span></div>
  <div class="steps" aria-hidden="true">${LABELS.map((_, i) => `<i class="${i <= step ? "on" : ""}"></i>`).join("")}</div>
  <h1>${escape(l.title)}</h1>${draft(state.language)}`;

  if (step === 0) {
    html += l.dialogue
      .map((x) => `<div class="bubble ${x.who === "You" ? "you" : ""}"><strong>${escape(x.who)}:</strong> ${escape(x.text)}${showTranslation ? `<div class="small muted translation">${escape(lineTranslation(x))}</div>` : ""}</div>`)
      .join("");
    html += `<div class="row">${button("Play", "play-dialogue", "button secondary")}${button("Slower", "play-slow", "button secondary")}${button(showTranslation ? "Hide translation" : "Translation", "toggle-translation", "button secondary")}</div>`;
    if (showTranslation && state.explain === "rw") html += '<p class="small muted">Kinyarwanda translation coming · showing French.</p>';
    if (state.language === "sw") html += '<p class="small muted">Kiswahili audio will be added after a fluent speaker records it.</p>';
  }
  if (step === 1) {
    html += `<p>These words will help you in today’s conversation.</p>` +
      l.words
        .map((w, i) => `<div class="card"><strong class="word">${escape(w.text)}</strong>
        <p>${escape(w.meaning)}${state.explain !== "en" && w.fr ? ` <span class="muted">· ${escape(w.fr)}</span>` : ""}</p>
        <p class="example">“${escape(w.example)}”</p>
        <div class="row">${state.language === "en" ? button("Listen", "say-word:" + i, "button secondary") : ""}${button("Save to phrasebook", "save-word:" + i, "button secondary")}</div></div>`)
        .join("");
  }
  if (step === 2) {
    html += `<div class="card warm"><h2>Today’s pattern</h2><p>${escape(explainText(l.pattern.explain))}</p>${fallbackNote(l.pattern.explain)}
    ${l.pattern.examples.map((x) => `<p><strong>${escape(x)}</strong></p>`).join("")}</div>`;
    if (l.pattern.compare?.rw) html += `<div class="card"><div class="eyebrow">COMPARE WITH KINYARWANDA</div><p><strong>${escape(l.pattern.compare.rw)}</strong></p></div>`;
  }
  if (step === 3) {
    const q = l.practice[practice];
    const id = l.id + "-q" + practice;
    const right = selected === q.answer;
    html += `<div class="eyebrow">Question ${practice + 1} of ${l.practice.length}</div><h2>${escape(q.prompt)}</h2>${choices(id, q.options)}`;
    if (checked)
      html += `<div class="${right ? "feedback" : "warning"}" role="status"><strong>${right ? "Correct." : "Not quite."}</strong> ${escape(explainText(q.feedback))}
      ${right ? "" : `<br>Answer: <strong>${escape(q.options[q.answer])}</strong><br><span class="small">This will come back in your review.</span>`}
      ${state.explain !== "en" && !q.feedback[state.explain] ? '<br><span class="small">Translation coming · showing English.</span>' : ""}</div>`;
    html += button(checked ? (practice === l.practice.length - 1 ? "Continue to speaking" : "Next question") : "Check answer", checked ? "practice-next" : "practice-check");
  }
  if (step === 4) {
    const sentence = l.speak[speakIndex];
    html += `<p>Listen, then say it with the voice. Then record yourself and compare.</p>
    <div class="card"><div class="eyebrow">SENTENCE ${speakIndex + 1} OF ${l.speak.length}</div><h2>${escape(sentence)}</h2>
    <div class="row">${button("Listen", "model", "button secondary")}${button(activeRecorder ? "Stop recording" : "Record me", "record", activeRecorder ? "button" : "button secondary")}</div>
    <div class="row">${button("Hear me", "hear-me", "button secondary")}${button("Hear both", "hear-both", "button secondary")}</div>
    <div class="row">${button("What did the phone hear?", "recognize", "button secondary")}</div>
    <div id="heard" role="status" class="small muted">This shows what the phone understood. It is not a pronunciation score.</div></div>`;
  }
  if (step === 5) {
    html += `<div class="card warm"><h2>Use it</h2><p>${escape(l.useIt.prompt)}</p>
    <label for="use-answer">Your reply</label><textarea id="use-answer"></textarea>
    <div class="row">${button(activeRecorder ? "Stop recording" : "Record a reply", "record-use", "button secondary")}${button("Hear my reply", "hear-use", "button secondary")}</div>
    <p class="small muted">Your reply is saved for your tutor to look at. It does not go into your review until someone has checked it.</p></div>
    ${button("Finish lesson", "finish")}`;
  }
  if (step === 4) html += `<div class="spacer"></div>${button(speakIndex < l.speak.length - 1 ? "Next sentence" : "Continue", "speak-next")}`;
  else if (step < 3) html += `<div class="spacer"></div>${button("Continue", "step-next")}`;
  return html;
}

function checkScreen() {
  const q = questions[checkIndex];
  if (!q) return "";
  let html = `<div class="top">${button("Back", "check-back", "button secondary")}<span class="eyebrow">Question ${checkIndex + 1} of ${questions.length}</span></div>
  <div class="bar" role="progressbar" aria-valuemin="1" aria-valuemax="${questions.length}" aria-valuenow="${checkIndex + 1}"><span style="width:${Math.round(((checkIndex + 1) / questions.length) * 100)}%"></span></div>
  <p class="eyebrow">${escape(q.section.toUpperCase())}</p><h1>${escape(q.prompt)}</h1>`;
  if (q.audio) html += `<p>${button("Listen", "check-audio", "button secondary")}</p>`;
  if (q.options) html += choices(q.id, q.options);
  if (q.kind === "write") html += `<label for="check-write">Your answer</label><textarea id="check-write"></textarea>`;
  if (q.kind === "record")
    html += `<p>Record your answer. Someone will listen to it later; it is not marked by the app.</p>
    <div class="row">${button(activeRecorder ? "Stop recording" : "Record", "record-check", activeRecorder ? "button" : "button secondary")}${button("Hear my answer", "hear-check", "button secondary")}</div>`;
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
  if (!item) return `<h1>Review</h1><div class="card"><h2>All done for today</h2><p>New words and corrections come back on later days.</p></div>`;
  return `<h1>Review · 5 min</h1><p class="muted">${queue.length} left today</p>
  <div class="card"><span class="eyebrow">${item.lang === "sw" ? "KISWAHILI" : "ENGLISH"}</span> ${draft(item.lang)}
  <h2>${escape(item.prompt)}</h2><p>Say it or type it before you look.</p>
  <label for="recall">Your answer</label><input id="recall" autocomplete="off" autocapitalize="off">
  <div id="reveal">${button("Show the answer", "reveal")}</div></div>`;
}

let phraseFilter = "All";
function phrasebookScreen() {
  return `<h1>My phrasebook</h1><p>${state.phrasebook.length} saved · everything here comes back in your review</p>
  <div class="row" role="group" aria-label="Filter">${["All", "Work", "Everyday", "Kiswahili"].map((t) => button(t, "filter:" + t, phraseFilter === t ? "button" : "button secondary", `aria-pressed="${phraseFilter === t}"`)).join("")}</div>
  ${phraseList()}
  <div class="card"><h2>Add a word or sentence</h2>
  <label for="phrase">Word or sentence</label><input id="phrase" maxlength="220">
  <label for="meaning">What it means, or when to use it</label><input id="meaning" maxlength="220">
  <label for="phrase-lang">Language</label><select id="phrase-lang"><option value="en">English</option><option value="sw">Kiswahili</option></select>
  <div class="spacer"></div>${button("Save and review later", "phrase-add")}</div>`;
}
function phraseList() {
  const list = state.phrasebook.filter((p) =>
    phraseFilter === "All" ? true : phraseFilter === "Kiswahili" ? p.lang === "sw" : p.lang === "en" && p.tag.toLowerCase() === phraseFilter.toLowerCase(),
  );
  return list.length
    ? list.map((p) => `<div class="card"><strong>${escape(p.answer)}</strong> ${draft(p.lang)}<p class="muted small">${escape(p.prompt)}</p>${p.lang === "en" ? button("Listen", "say:" + p.id, "button secondary") : ""}</div>`).join("")
    : '<p class="muted">Nothing saved here yet.</p>';
}

function progressScreen() {
  const done = state.completed;
  const known = state.reviews.filter((x) => x.box >= 2).length;
  return `<h1>What I can do now</h1>
  <div class="row stats"><div class="card"><strong>${state.days}</strong><p>days learning</p></div><div class="card"><strong>${known}</strong><p>words known</p></div><div class="card"><strong>${todaysQueue().length}</strong><p>due today</p></div></div>
  ${["en", "sw"].map((lang) => `<h2>${lang === "en" ? "English" : "Kiswahili"}</h2>${unit[lang].canDo
    .map((text, i) => {
      const ok = done[lang]?.includes(unit[lang].lessons[i]?.id);
      return `<div class="card can ${ok ? "done" : ""}"><strong>${escape(text)}</strong><p class="muted small">${ok ? "Done" : "Not yet"}</p></div>`;
    })
    .join("")}`).join("")}
  <h2>My recordings</h2><p class="muted">Recordings stay on this device. The monthly check-up recording will appear here.</p>`;
}

function taskScreen() {
  const lang = state.language, task = unit[lang].weeklyTask, entry = state.tasks[lang] || {};
  const corrections = (entry.corrections || []).filter(Boolean);
  return `<div class="top">${button("Back", "today", "button secondary")}</div>
  <p class="eyebrow">WEEKLY TASK · ${lang === "en" ? "ENGLISH" : "KISWAHILI"}</p><h1>${escape(task.prompt)}</h1>${draft(lang)}
  <div class="card"><p><strong>Include:</strong> ${task.checklist.map(escape).join(" · ")}</p>
  <div class="row">${button(activeRecorder ? "Stop recording" : "Record", "record-task", activeRecorder ? "button" : "button secondary")}${button("Hear my recording", "hear-task", "button secondary")}</div>
  <label for="task-answer">Or write it here</label><textarea id="task-answer">${escape(entry.answer || "")}</textarea>
  <div class="spacer"></div>${button("Save", "task-save")}</div>
  ${entry.good || corrections.length ? `<div class="feedback"><strong>What went well</strong><p>${escape(entry.good || "")}</p>
    ${corrections.map((c, i) => `<p>${escape(c)}</p>${button("Save to my phrasebook", "correction:" + i, "button secondary")}`).join("")}</div>` : ""}
  <details class="card tutor"><summary>For the tutor: add feedback</summary>
  <p class="small muted">Listen to the recording on this phone, then write what went well and up to three corrections as “You said … / Better … / Why …”.</p>
  <label for="task-good">What went well</label><textarea id="task-good">${escape(entry.good || "")}</textarea>
  ${[0, 1, 2].map((i) => `<label for="task-c${i}">Correction ${i + 1}</label><textarea id="task-c${i}" placeholder="You said … / Better … / Why …">${escape(entry.corrections?.[i] || "")}</textarea>`).join("")}
  <div class="spacer"></div>${button("Save feedback", "task-feedback", "button secondary")}</details>`;
}

function settingsScreen() {
  let sync;
  if (!firebaseConfig) sync = "<p>Progress is saved on this device.</p>";
  else if (user) sync = `<p>Signed in as ${escape(user.email)}. Your progress is kept the same on your phone and laptop.</p>${button("Sign out", "signout", "button secondary")}`;
  else if (!auth) sync = "<p>Connect to the internet to sign in.</p>";
  else
    sync = `<p>Sign in to keep your progress the same on your phone and laptop.</p>
    <label for="email">Email address</label><input id="email" type="email" autocomplete="email" autocapitalize="off">
    <label for="password">Password</label><input id="password" type="password" autocomplete="current-password" minlength="6">
    <div class="spacer"></div><div class="row">${button("Sign in", "signin")}${button("Create account", "signup", "button secondary")}</div>
    <p>${button("Forgot password", "reset", "button secondary")}</p>
    <p class="small muted">First time: type your email and a password (at least 6 characters), then tap Create account. On other devices, use Sign in with the same email and password.</p>`;
  return `<div class="top">${button("Back", "today", "button secondary")}</div><h1>Settings</h1>${languageSelect()}
  <div class="card"><h2>Use on phone and laptop</h2>${sync}</div><p class="muted small">Recordings stay on this device.</p>`;
}

function render() {
  const screens = { welcome: welcomeScreen, today: todayScreen, lesson: lessonScreen, check: checkScreen, results: resultsScreen, review: reviewScreen, phrasebook: phrasebookScreen, progress: progressScreen, task: taskScreen, settings: settingsScreen };
  const body = (screens[route] || todayScreen)();
  $.innerHTML = shell(body, !["welcome", "check", "results", "lesson"].includes(route));
  if (status) {
    const note = document.createElement("div");
    note.className = "feedback";
    note.setAttribute("role", "status");
    note.textContent = status;
    $.querySelector("main").prepend(note);
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
  // English: French cue -> English word. Kiswahili: meaning -> Kiswahili word.
  const prompt = lang === "en" ? `${w.fr} — ${w.meaning}` : state.explain === "fr" && w.fr ? w.fr : w.meaning;
  return { prompt, answer: `${w.text} — “${w.example}”` };
}
const RECORD_KEYS = {
  record: () => `lesson-${current().id}-${speakIndex}`,
  "record-use": () => `use-${current().id}`,
  "record-check": () => `check-${questions[checkIndex].id}`,
  "record-task": () => `task-${state.language}`,
};
const HEAR_KEYS = { "hear-me": "record", "hear-use": "record-use", "hear-check": "record-check", "hear-task": "record-task" };

async function stopRecording() {
  if (!activeRecorder) return;
  const r = activeRecorder;
  activeRecorder = null;
  await r.stop();
}

async function action(a) {
  // Any action other than the record button itself stops a running recording first.
  if (activeRecorder && !(a in RECORD_KEYS)) await stopRecording();
  const l = current();

  if (a.startsWith("choose-")) { state.language = a.slice(7); await persist(); return goto(route === "welcome" ? "today" : route); }
  if (["today", "review", "phrasebook", "progress", "settings", "task"].includes(a)) return goto(a);

  // level check
  if (a === "check-start") { state.answers = []; checkIndex = 0; checkHistory = []; selected = null; return goto("check"); }
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
    selected = null;
    if (next < questions.length) { checkIndex = next; return render(); }
    state.answersUpdated = Date.now();
    await persist();
    return goto("results");
  }

  // lesson
  if (a === "lesson-start") { step = 0; practice = 0; speakIndex = 0; selected = null; checked = false; showTranslation = false; return goto("lesson"); }
  if (a === "step-next") { step++; return render(); }
  if (a === "toggle-translation") { showTranslation = !showTranslation; return render(); }
  if (a === "play-dialogue" || a === "play-slow") {
    if (state.language === "sw") { status = "Kiswahili audio will be added after a fluent speaker records it."; return render(); }
    for (const x of l.dialogue) { if (route !== "lesson" || step !== 0) break; await speak(x.text, "en", a === "play-slow" ? 0.75 : 1); }
    return;
  }
  if (a.startsWith("say-word:")) return void speak(l.words[Number(a.slice(9))].example);
  if (a.startsWith("save-word:")) {
    const w = l.words[Number(a.slice(10))];
    const id = `${l.id}-w-${w.text}`;
    const c = wordCard(w, state.language);
    if (!state.phrasebook.some((p) => p.id === id)) state.phrasebook.push({ id, prompt: c.prompt, answer: w.text, lang: state.language, tag: l.strand, updated: Date.now() });
    enqueue(id, c.prompt, c.answer, state.language, l.strand);
    await persist(); status = "Saved to your phrasebook."; return render();
  }
  if (a.startsWith("answer:")) { if (!checked) { selected = Number(a.slice(7)); render(); } return; }
  if (a === "practice-check") {
    if (selected === null) { status = "Choose an answer first."; return render(); }
    checked = true;
    const q = l.practice[practice];
    if (selected !== q.answer) {
      // Review shows the gapped sentence; the answer is the whole correct sentence, not just the missing words.
      const full = q.prompt.includes("____") ? q.prompt.replace(/\s*____\s*/, (m) => (q.options[q.answer].startsWith("'") ? "" : " ") + q.options[q.answer] + (m.endsWith(" ") ? " " : "")).replace(/\s+([.?!,])/g, "$1").trim() : q.options[q.answer];
      enqueue(`${l.id}-q${practice}`, q.prompt, full, state.language, l.strand);
    }
    await persist(); return render();
  }
  if (a === "practice-next") {
    selected = null; checked = false;
    if (practice < l.practice.length - 1) practice++; else { practice = 0; step++; }
    return render();
  }
  if (a === "model") {
    if (speak(l.speak[speakIndex], state.language) === false) { status = "Kiswahili audio will be added after a fluent speaker records it."; render(); }
    return;
  }
  if (a === "speak-next") { if (speakIndex < l.speak.length - 1) speakIndex++; else step++; return render(); }
  if (a === "hear-both") {
    const p = speak(l.speak[speakIndex], state.language);
    if (p) await p;
    if (!(await playback(RECORD_KEYS.record()))) { status = "Record yourself first."; render(); }
    return;
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
    for (const w of l.words) { const c = wordCard(w, state.language); enqueue(`${l.id}-w-${w.text}`, c.prompt, c.answer, state.language, l.strand); }
    countDay();
    await persist();
    status = "Lesson finished. Its words will come back in your review.";
    return goto("today");
  }

  // review
  if (a === "reveal") {
    const item = todaysQueue()[0];
    document.querySelector("#reveal").innerHTML = `<p class="answer"><strong>${escape(item.answer)}</strong></p>
    <div class="row">${button("Didn’t know", "grade:again", "button secondary")}${button("With effort", "grade:effort", "button secondary")}${button("Easy", "grade:easy")}</div>`;
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
  if (a.startsWith("say:")) { const p = state.phrasebook.find((x) => x.id === a.slice(4)); if (p) speak(p.answer); return; }
  if (a === "phrase-add") {
    const answer = document.querySelector("#phrase").value.trim(), prompt = document.querySelector("#meaning").value.trim(), lang = document.querySelector("#phrase-lang").value;
    if (!answer || !prompt) { status = "Please fill in both boxes."; return render(); }
    const p = { id: crypto.randomUUID(), prompt, answer, lang, tag: "everyday", updated: Date.now() };
    state.phrasebook.push(p); enqueue(p.id, p.prompt, p.answer, p.lang, p.tag);
    await persist(); status = "Saved. It will come back in your review."; return render();
  }

  // weekly task
  if (a === "task-save" || a === "task-feedback") {
    const lang = state.language, val = (id) => document.querySelector(id)?.value ?? "";
    state.tasks[lang] = { ...(state.tasks[lang] || {}), answer: val("#task-answer"), good: val("#task-good"), corrections: [0, 1, 2].map((i) => val("#task-c" + i)), updated: Date.now() };
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
  if (a === "signin") return passwordAuth("signin");
  if (a === "signup") return passwordAuth("create");
  if (a === "reset") return passwordAuth("reset");
  if (a === "signout") { await auth.signOut(); user = null; return render(); }

  // recording
  if (a in RECORD_KEYS) {
    if (activeRecorder) { await stopRecording(); status = "Recording saved on this device."; return render(); }
    try { activeRecorder = await record(RECORD_KEYS[a]()); status = "Recording… press Stop when you finish."; }
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
$.addEventListener("change", async (e) => {
  if (e.target.id === "explain") { state.explain = e.target.value; await persist(); render(); }
});
window.addEventListener("popstate", async () => {
  await stopRecording();
  route = location.hash.slice(1) || "today";
  render();
});
window.addEventListener("online", () => (auth ? sync() : initFirebase()));

const fresh = !state.completed.en.length && !state.completed.sw.length && !state.answers.length && !state.reviews.length;
route = location.hash.slice(1) || (fresh ? "welcome" : "today");
if (["lesson", "check", "results"].includes(route) && !location.hash.includes("results")) route = fresh ? "welcome" : "today";
render();
initFirebase();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
