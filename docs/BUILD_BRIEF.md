# Twige: build brief for the English and Kiswahili learning app

Version 1, 20 November 2026. Owner: Jonesmus Wambua. Learner: one adult (his wife).
This brief is self-contained. Build the **prototype** described in section 9 first, then stop for a week of real use.

---

## 1. What we are building

A web app (installable PWA) that teaches one adult learner:

- **English** for everyday life and for work and business: tenses, sentence construction, pronunciation and vocabulary. She can already read and communicate, but struggles with tenses, pronunciation and sentence building.
- **Kiswahili** from the beginning (she lives in Nairobi).

Her languages: Kinyarwanda (first language), French (fluent), English (intermediate), Kiswahili (beginner).

This is **adult learning for an all-round person**: home, city life, health, school, money, officials and work. It is not a course about one profession. The look is calm and professional: no mascots, cartoons, confetti, badges or childish colours.

## 2. Teaching principles (follow these when writing code and content)

1. **Little and often.** About 20 minutes a day: one lesson (~15 min) in the language she picks for that day, plus a 5-minute review. The other language is optional.
2. **Recall, not re-reading.** Reviews make her say or type the answer before she sees it, and items come back at growing intervals.
3. **Explicit grammar, one step at a time.** A short clear rule, examples, practice, then use in a real situation.
4. **Real situations from an adult's week.** Every lesson starts with a short realistic dialogue.
5. **Pronunciation from her own recordings.** Shadowing in every lesson. Sound drills only for sounds her recordings show are hard to understand. Do not assume a fixed list.
6. **Honest, careful feedback.** Never teach a rule that is only sometimes true. Speech recognition shows "I heard…" and offers another try. It is **never** presented as a pronunciation score.
7. **Explanations in her chosen language:** English, French or Kinyarwanda, changeable at any time. Use comparisons with French or Kinyarwanda only where they genuinely help.
8. **Fluent-speaker check.** Every Kiswahili and Kinyarwanda item is marked draft until a fluent speaker approves it. The app shows a small "Draft" label on unapproved content.

## 3. Where it lives

- **Code:** a new private GitHub repository, **`jstats/twige`** (the owner creates it). Default branch `main`.
- **Hosting:** **Netlify**, auto-deploying from `main`, the same way as the owner's existing learning app (`jstats/grade1-learning` → beelove-learning.netlify.app). Suggested site name: `twige-learning` → https://twige-learning.netlify.app
- **Progress sync between phone and laptop:** a new **Firebase** project, `twige-learning`, with Firebase Authentication (email link sign-in, no password) and Firestore. The Firebase web config goes in `src/config.js`. It is public by design; security comes from Firestore rules that only allow the signed-in user to read and write her own data.
- **Secrets:** none in the repo. The later AI-feedback step uses a Netlify Function with the API key in a Netlify environment variable.

Repository layout:

```
twige/
  README.md                 how to run, deploy and add content
  docs/BUILD_BRIEF.md       this file
  index.html                app shell
  manifest.webmanifest
  sw.js                     service worker; bump CACHE version on every release
  src/
    app.js                  router and screens
    srs.js                  spaced-review scheduler (pure functions, tested)
    speech.js               text-to-speech, speech recognition, recording
    store.js                IndexedDB storage + Firestore sync
    levelcheck.js           English level check scoring (pure, tested)
    i18n/en.json fr.json rw.json   interface text and explanations
    config.js               Firebase web config
  content/
    en/unit-01.json ...     English units
    sw/unit-01.json ...     Kiswahili units
    levelcheck/en.json      level-check items
    audio/sw/...            recorded Kiswahili audio (fluent speaker)
  tests/
    srs.test.js  levelcheck.test.js  content.test.js
```

Technology: plain HTML, CSS and JavaScript ES modules, no framework and no build step, so it stays simple to maintain. Tests run with `node --test`. Content stays separate from code so fluent speakers can review it without touching code.

## 4. Screens and flow

A clickable design of every screen exists on the owner's Claude design canvas. The text below is the specification.

1. **Welcome:** choose English or Kiswahili; choose the explanation language (English / Français / Ikinyarwanda). Button: "Start the English level check (20 min)". Note: "Kiswahili starts at the beginning, no test needed."
2. **English level check:** about 30 items in 6 sections: tenses, words, reading, listening, speaking, writing. Progress bar, "Question N of 30", no marks shown until the end. Difficulty rises after correct answers and drops after wrong ones within each section.
3. **Suggested starting point:** a bar per skill (A1–B2), clearly labelled "suggested starting point; your first week will confirm or adjust it", her first three focus points, and her plan.
4. **Today:** an English / Kiswahili switch for today's language; today's lesson card (~15 min); review card (5 min, both languages); "the other language is optional today"; this week's task card; bottom navigation: Today, Review, Phrasebook, Progress.
5. **Lesson (6 steps):** 1 Listen to a dialogue (Play, Slower, Translation), 2 Words, 3 Pattern, 4 Practise, 5 Speak, 6 Use it (a short written or spoken reply). Step dots at the top.
6. **Practice with correction:** choice, gap fill, word order, "fix the sentence". Wrong answer: a short explanation in her chosen language, the correct form, and "this will come back in your review".
7. **Speaking:** the model sentence, Listen, Record me. Then "I heard: …" with differing words highlighted, "Hear me", "Hear both", "Try again". If a sound drill is due, it shows pairs chosen from her recordings.
8. **Review:** a prompt (often from French or her own phrasebook), "Show the answer", then Didn't know / With effort / Easy.
9. **Weekly task:** the instructions, a recorder or text box, then feedback: what went well, then up to 3 corrections in the form "You said / Better / Why", with "Save to my phrasebook". In the prototype the feedback is written by the owner or a tutor in an admin view, or skipped. AI feedback comes later (section 8).
10. **Phrasebook:** saved words and sentences with audio, filters (All, Work, Everyday, Kiswahili), and "Add a word or sentence". Everything saved goes into the review.
11. **Progress:** "I can…" statements per language (done, in progress), days learning, words known, items due, and her monthly recordings.
12. **Kiswahili lesson:** the same 6 steps, with a comparison box against Kinyarwanda where it helps, for example mtu / watu ↔ umuntu / abantu.

## 5. Content format

One JSON file per unit. Example (shortened):

```json
{
  "id": "en-u01",
  "lang": "en",
  "title": "Plans, times and changes",
  "strand": "everyday",
  "canDo": ["Say I am running late and give a new time"],
  "lessons": [{
    "id": "en-u01-l03",
    "title": "Calling to say you're running late",
    "minutes": 15,
    "dialogue": [
      {"who": "Grace", "text": "Hello?"},
      {"who": "You", "text": "Hi Grace. I'm sorry, I'm running late. There's a lot of traffic on Mombasa Road."},
      {"who": "Grace", "text": "No problem. When will you get here?"},
      {"who": "You", "text": "I'll be there by 10:30. I'll call you as soon as I arrive."}
    ],
    "translations": {"fr": ["Allô ?", "..."], "rw": ["...", "..."]},
    "words": [{"en": "running late", "fr": "en retard", "rw": "", "example": "Sorry, I'm running late."}],
    "pattern": {"name": "will for promises", "explain": {"en": "...", "fr": "...", "rw": ""}, "examples": ["I'll be there by 10:30."]},
    "practice": [{
      "type": "choice",
      "prompt": "Yesterday I ____ the email at 6 p.m.",
      "options": ["have sent", "sent"],
      "answer": 1,
      "feedback": {"en": "With a time that is over, like yesterday or last week, English uses the past simple.", "fr": "...", "rw": ""}
    }],
    "speak": ["I'll call you as soon as I arrive."],
    "useIt": {"type": "voice", "prompt": "Tell Grace you'll be 20 minutes late."}
  }],
  "weeklyTask": {"prompt": "Send a voice note saying you'll be late, with a new time.", "checklist": ["sorry", "reason", "new time", "promise"]},
  "reviewed": {"by": "", "date": ""}
}
```

Rules:

- Every Kiswahili and Kinyarwanda string carries `"reviewed": false` until a fluent speaker approves it.
- An empty translation falls back to English, with a small "translation coming" note.
- `tests/content.test.js` checks: valid JSON, unique ids, every choice answer index exists, no empty prompts, every lesson has a dialogue and at least 4 practice items.

## 6. Core logic

**Review scheduler (`src/srs.js`).** Boxes with intervals of 1, 3, 7, 14, 30 and 60 days.

- *Didn't know* → box 1, due tomorrow.
- *With effort* → stays in its box, interval as before.
- *Easy* → next box.
- New items enter box 1 after a lesson, a wrong practice answer, or a phrasebook save.
- Daily cap: 20 due items and 8 new items; the overflow goes to the next day.
- All functions are pure and unit-tested.

**English level check (`src/levelcheck.js`).**

- Each item has a section, a level (A1–B2) and a correct answer.
- Within a section, start at A2, go up a level after 2 correct answers in a row, and down after 2 wrong.
- The section level is the highest level with at least 60% correct and at least 3 items answered.
- Speaking and writing answers are **recorded and saved** but not auto-scored in the prototype. A person can listen later. The speaking section also saves a recording used to choose her sound drills.
- The result is labelled "suggested starting point".

**Speech (`src/speech.js`).**

- *Text-to-speech:* `speechSynthesis` with an English voice (prefer en-GB or en-US). Kiswahili voices are often missing on phones. Feature-detect, and for Kiswahili play recorded audio files from `content/audio/sw/` when they exist, otherwise show "audio coming".
- *Listening:* `SpeechRecognition` / `webkitSpeechRecognition` (Chrome on Android and desktop; needs internet). Compare the recognised words with the target sentence after normalising (lower case, strip punctuation, expand "I'll" ↔ "I will") and show "I heard: …" with differing words highlighted. Never show a score or a percentage. If recognition is unavailable, show only "Record" and "Hear both".
- *Recording:* `MediaRecorder` (webm/opus) stored in IndexedDB; "Hear both" plays the model and then her recording.

**Storage and sync (`src/store.js`).**

- *Offline first:* all progress, phrasebook and recordings in IndexedDB.
- *Sync:* when she is signed in and online, progress and phrasebook sync to Firestore under `users/{uid}/…`.
- Recordings stay on the device by default. An optional "Share this recording for feedback" uploads it to Firebase Storage under her uid.
- Firestore and Storage rules: a user can only read and write her own documents.

## 7. Design rules

- Calm adult style. Colours: deep teal `#0F5257` (main), warm orange `#F2A65A` (main button on dark), dark orange text `#A04A12`, text `#1D2327`, grey text `#5B6670`, light teal panels `#EEF5F5`, light orange panels `#FDF3EB`, white cards with `#E3E7E8` borders. Font: Plus Jakarta Sans (Google Fonts), system fallback.
- Body text at least 16 px, touch targets at least 44 px, contrast at least 4.5:1, real buttons and labels, works with large text.
- Phone first (390 px wide), and also comfortable on a laptop (content column up to 720 px).
- No emoji, mascots, confetti, cartoon images or game sounds. Progress is shown as "I can…" statements, not points.
- Works offline after the first visit, except speech recognition and sync.

## 8. Later steps (not in the prototype)

- **AI feedback** on weekly voice notes and emails: a Netlify Function sends the transcript or text to an AI model and returns "what went well" plus up to 3 "You said / Better / Why" corrections, in her explanation language. The API key lives in a Netlify environment variable. There is a monthly spending cap, and every correction can be reported as wrong.
- The remaining English units (the whole tense ladder) and Kiswahili units 2–10.
- A 4-weekly check-up: a short re-check plus a 2-minute recording.

## 9. The prototype: build this first, then stop

1. App shell, PWA install, offline caching, bottom navigation and settings (explanation language).
2. English level check: about 30 items with the scoring above, and the results screen.
3. **English Unit 1**: 5 lessons in the 6-step format, everyday and work situations (running late and rescheduling, introducing yourself at work, asking for help in an office, a phone call to book an appointment, a short work email). Tense focus: present simple vs continuous, plus "will" for promises.
4. **Kiswahili Unit 1**: 5 lessons (greetings, introducing yourself, people and family words with the Kinyarwanda comparison, numbers 1–20, polite phrases), marked draft until reviewed.
5. Review system, phrasebook and voice recording with "I heard…" feedback.
6. One weekly task for each language, with a manual feedback entry for the owner.
7. Progress screen with "I can…" statements.
8. Firebase sign-in and sync between phone and laptop.

**Done means:**

- Installs on Android Chrome and works offline.
- Progress made on the phone appears on the laptop after signing in.
- The level check gives a section-by-section suggestion.
- All tests pass (`node --test`).
- A wrong practice answer appears in the next day's review.
- Speech feedback never shows a score.
- Unreviewed Kiswahili and Kinyarwanda content shows "Draft".
- Lighthouse PWA and accessibility checks pass.

Then she uses it for one week. Collect her feedback on level, daily time and helpfulness before writing more units.

## 10. Owner steps (Jonesmus)

1. Create the private GitHub repo `jstats/twige` and add this file as `docs/BUILD_BRIEF.md`.
2. In Netlify: Add new site → Import from GitHub → `jstats/twige` → no build command, publish directory `/`.
3. In Firebase: create the project `twige-learning`, add a web app, enable Email link sign-in and Firestore, and paste the web config into `src/config.js` (or give it to ChatGPT to add).
4. Ask a fluent Kiswahili speaker and a fluent Kinyarwanda speaker to review the content files before she relies on them.
5. Open the Netlify link on her phone and laptop, then choose "Install app" or "Add to Home screen".
