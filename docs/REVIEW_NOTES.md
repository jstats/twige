# Twige — Review Notes & Actionable Recommendations (21 Nov 2026)

Comprehensive review of **Twige** (`jstats/twige`, inspected at commit `ef9a6d2`) across **Aesthetics**, **Content**, and **Functionality**, including concrete file-level notes and agreed improvement priorities for the next implementation pass.

---

## 1. Summary of Agreed Next-Pass Priorities

1. **Aesthetics & Visual Polish:** Preserve the calm, distraction-free adult palette (`#0F5257` deep teal, `#F2A65A` warm orange, `#FDF3EB` warm sand, zero mascots/points/confetti) while adding clean monochrome SVG icons, segmented controls, and offline font reliability.
2. **Kinyarwanda (`rw`) Support:** Fill missing Kinyarwanda dialogue translations, vocabulary glosses, grammar explanations, and practice feedback.
3. **Optional Kiswahili Device Speech Fallback:** Add an opt-in setting to try the device's `sw` / `sw-KE` Web Speech voice (labeled clearly as a draft device voice) instead of leaving dead audio buttons on Kiswahili lessons.
4. **Lesson Picker & Replay:** Allow the learner to pick, preview, or replay any of the 5 lessons in Unit 1 (and jump directly from Progress "I can…" cards).
5. **Interactive Practice Variety:** Implement interactive `order` (tap word chips in sequence), `gap` (type missing word), and `fix` (correct an underlined mistake) exercises alongside existing `choice` items.

---

## 2. Aesthetics & Visual Design Notes

### What Works Well
- **Respectful adult tone:** Calm color tokens (`#0F5257`, `#F2A65A`, `#FDF3EB`, `#F7F9F9`), crisp 16px+ body typography, and generous 44–48px touch targets (`src/style.css`).
- **Clear progression indicator:** 6-segment lesson step bar and clean card contrast ratios (with `prefers-reduced-motion` support).

### Issues & Opportunities
- **Plain text navigation & buttons (`src/app.js`, `src/style.css`):** Bottom navigation (`Today`, `Review`, `Phrasebook`, `Progress`) and key controls (`Play`, `Slower`, `Record`, `Save`) have no icons. Adding lightweight 20px inline monochrome SVG icons (`stroke="currentColor"`) improves mobile scannability without breaking the adult calm style.
- **Segmented control mismatch (`docs/design/Today.dc.html` vs. `src/app.js`):** The design canvas specifies an elevated pill segmented switcher for `English | Kiswahili`, whereas `src/app.js` renders two separate buttons. Matching the segmented track adds polish and reduces visual weight.
- **Nav active border shift (`src/style.css`):** `.nav a.active` adds `border-top: 3px solid #0F5257` while inactive links have no top border, shifting the active label slightly downward. Reserve `border-top: 3px solid transparent` on `.nav a`.
- **Uniform dialogue bubbles (`src/style.css` vs. `docs/design/Lesson.dc.html`):** Chat bubbles use symmetric `15px` corners instead of directional speech-tail corners (`16px 16px 16px 4px` vs. `16px 16px 4px 16px`).
- **Google Font breaks offline (`src/style.css`, `sw.js`):** `src/style.css` loads `Plus Jakarta Sans` via `@import url('https://fonts.googleapis.com/...')`, which `sw.js` explicitly skips (`url.origin !== location.origin`). When offline, the font drops abruptly to system fallback. Self-hosting `.woff2` font files (cached in `sw.js`) or dropping the external `@import` fixes offline consistency and Lighthouse performance.
- **Layout jump on status banners (`src/app.js:436`):** Prepending `.feedback` inside `<main>` shifts all content below it downward when triggered. A fixed/dismissible top notice or bottom toast above `.nav` avoids layout shift.

---

## 3. Content & Curriculum Notes

### What Works Well
- **Grounded, practical topics (`content/en/unit-01.json`, `content/sw/unit-01.json`):** Realistic Nairobi scenarios (Mombasa Road traffic, office introductions, booking appointments, polite matatu directions) with French glosses and real example sentences.
- **Level Check design (`content/levelcheck/en.json`):** Solid 30-item bank (6 per scored skill ordered `A1 -> B2`, plus 3 speaking and 3 writing prompts) with fair two-wrong early stop logic.

### Issues & Opportunities
- **Kinyarwanda (`rw`) content is ~99% missing:** Only 1 string in the entire content folder (`sw-u01-l03` `pattern.compare.rw`) has Kinyarwanda. Selecting `Ikinyarwanda` in Settings triggers constant fallback notices to French/English across all dialogue lines, grammar explanations, and practice feedback.
- **Zero exercise type diversity (`content/en/unit-01.json`, `content/sw/unit-01.json`):** Although `docs/BUILD_BRIEF.md` calls for `choice`, `gap fill`, `word order`, and `fix the sentence`, **all 60 practice items (30 EN + 30 SW)** are currently `"type": "choice"`. Adding `order`, `gap`, and `fix` items will significantly strengthen active recall.
- **English Lesson 5 (`en-u01-l05`, "Writing a short work email"):** Currently has only 2 short bubbles (`Email from Miriam` and `You`) shown in the chat bubble layout. Formatting email exchanges cleanly (subject/greeting/body/sign-off) or adding an extra follow-up reply makes Step 1 feel natural.
- **English word cards force French (`src/app.js:455`):** `wordCard(w, "en")` builds `${w.fr} — ${w.meaning}` even when `state.explain === "en"`, showing French text to learners who selected English explanations (and ignores `w.rw` when `state.explain === "rw"`).

---

## 4. Functionality & Reliability Notes

### Bugs & UX Gaps Found
1. **Sequential Lesson Lock (`src/app.js:53`):**
   `const current = () => lessons()[(state.completed[state.language] || []).length % lessons().length];`
   There is no UI to select or replay an earlier lesson, pick a lesson out of order, or launch a lesson directly from Progress `"I can…"` cards. After finishing Lesson 5, `% 5` wraps silently back to Lesson 1.
2. **Recording wipes unsaved typed text (`src/app.js:299, 405, 592–600`):**
   In Lesson Step 6 (`Use it`, `#use-answer`) and Weekly Task (`#task-answer`), typing text and then tapping **Record** or **Stop recording** invokes `render()`, which rebuilds `$.innerHTML` and **erases whatever the learner typed**. Draft text must be captured in state before re-rendering.
3. **Dead audio buttons on Kiswahili Dialogue (`src/app.js:259, 523`, `src/speech.js:12`):**
   Lesson Step 0 renders `Play` and `Slower` buttons for Kiswahili even though clicking either only displays `"Kiswahili audio will be added after a fluent speaker records it."`, and `speak()` hard-blocks `lang === "sw"`. Either hide/replace those buttons when disabled or provide an opt-in **Try device Kiswahili voice** toggle (`sw-KE` / `sw`) when the browser has a compatible voice.
4. **Unused Recall Input on Review Screen (`src/app.js:359–361, 571–576`):**
   `reviewScreen()` displays `<input id="recall">`, but tapping **Show the answer** never reads, compares, or displays what the learner typed. Wiring `compareWords(item.answer, recallVal)` on reveal (without a numeric score) plus a **Listen** button for English cards makes review active instead of passive.
5. **Incomplete UI i18n (`src/app.js:35–40`):**
   `i18n` only translates 5 navigation/settings keys (`today`, `review`, `phrasebook`, `progress`, `settings`). All screen headings, buttons, and prompts remain English when `fr` or `rw` is chosen.
6. **SpeechRecognition sync-throw & cleanup (`src/speech.js:53–70`):**
   `r.start()` is not wrapped in `try/catch`, and timeouts aren't cleared on early `onresult`/`onerror`. Also, `listen()` should avoid hanging if recognition stops immediately without firing `onerror`.
7. **Outdated Auth Notes in `README.md`:**
   `README.md` still refers to **email-link sign-in** in two places, whereas commit `ef9a6d2` migrated authentication to **email and password** (`passwordAuth`) so iOS Home Screen PWAs retain session storage cleanly. Note also `docs/BUILD_BRIEF.md` vs `src/app.js` alignment and ensure Firestore rules (`firestore.rules`) are deployed to Firebase (`firebase deploy --only firestore:rules --project twige-learning`).
