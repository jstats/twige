# Twige

An English and Kiswahili learning web app (installable PWA) for one adult learner.

- **Build instructions:** [docs/BUILD_BRIEF.md](docs/BUILD_BRIEF.md). The section 9 prototype is implemented in this repository.
- **Screen designs:** `docs/design/` is the layout and wording reference.
- **Hosting:** Netlify project `twige-learning` deploys `main`; no build command, publish directory `/`.
- **Firebase:** project `twige-learning`, web config in `src/config.js`, email-link authentication, Firestore in `africa-south1`. Recordings stay on device because Firebase Storage is not enabled.

## Run and check

Serve the repository root over HTTP: `python3 -m http.server 8080`. Open `http://localhost:8080`. Run `node --test` for content, level check and review scheduling tests. Netlify can publish the repository root without a build step.

The first online visit caches the app shell and both five-lesson units. Progress, phrasebook and recordings are saved in browser IndexedDB. Sign in by email link to synchronize progress and phrasebook across devices; recording files remain local. Chrome speech recognition may need internet and reports what it heard, never a pronunciation score. English model audio uses browser speech synthesis. Kiswahili audio remains labelled as coming until a fluent speaker supplies recorded audio.

## Firestore access

The tracked `firestore.rules` permits only a signed-in user to read and write under `users/{their uid}/...`. Firestore rules are **not deployed by a Netlify build**. Deploy them to the Firebase project before testing cross-device sync, for example with the Firebase CLI after authenticating to the project: `firebase deploy --only firestore:rules --project twige-learning`. `firebase.json` points to the tracked rules file. Production mode denies access until rules are published. No private Firebase credential belongs in this repository.

## Editing lessons

Kiswahili and Kinyarwanda examples remain drafts pending fluent-speaker review. Edit the lesson JSON in `content/`; each lesson needs a dialogue, a rule, at least four practice questions, a speaking line and a real use prompt. Correct choice indices are zero based. Bump the `CACHE` constant in `sw.js` when content changes. Weekly feedback can be written on the same learner task view; a separate owner-only admin screen is not part of this first version.

## Acceptance limits

Automated tests and source syntax checks pass. Browser, Lighthouse, Android installation and cross-device sign-in still require testing on the deployed site. The placement result is an estimate from a small question bank; speaking and writing require human assessment. Translation falls back to English where French or Kinyarwanda text has not been reviewed. The remaining units and AI feedback belong to later phases.

## Review notes (Claude, 20 Nov 2026)

Reviewed ChatGPT's prototype (commit f7a070d) and fixed:

- **Answers always first:** every practice and level-check answer was option 1. Options are now shown in a stable shuffled order; every item has 3 options.
- **Content:** word cards only repeated the word; now each has a meaning, a French gloss and a real example. Dialogues have French translations (Translation button). Practice items rewritten (6 per lesson) with feedback in English and French. Kiswahili content rewritten and still marked Draft.
- **Review rules:** added the 8-new-items-a-day cap and a true 20-a-day cap; dates use the phone's local day, not UTC. Wrong practice answers come back the next day as a full correct sentence.
- **Her own "Use it" replies** no longer go into review uncorrected; they are saved for the tutor.
- **Level check:** new 30-item bank; scoring and the two-wrong stop rule as in the brief (section 6, revised).
- **Speaking:** "What did the phone hear?" now marks the words that differ and lists missing words; "Hear both" added; never a score.
- **Weekly task:** tutor feedback moved into a collapsed "For the tutor" section on the same phone (recordings live there).
- **Sync:** merging phone and laptop keeps the most recently updated copy of each review item instead of always the local one; sign-in no longer re-renders screens where she may be typing.
- **Offline/updates:** service worker is now network-first, so new versions reach her without a cache bump; cached copy used offline.

Still open: Firestore rules must be published in the Firebase console (Netlify does not deploy them); Kinyarwanda explanations; fluent-speaker review and recorded audio for Kiswahili; Lighthouse and real-phone checks.
## Review notes & next-pass plan (21 Nov 2026)

Full audit notes across aesthetics, content, and functionality are saved in [docs/REVIEW_NOTES.md](docs/REVIEW_NOTES.md). Key findings queued for the next pass (no app code changed yet):

- **Aesthetics:** Keep the calm adult teal/orange look, add monochrome SVG icons (bottom nav & audio actions), match the segmented language toggle from `docs/design/`, fix `.nav` border alignment, self-host/remove external Google Font `@import` for offline consistency, and stop status banners from shifting page content.
- **Content:** Fill missing Kinyarwanda (`rw`) dialogue/word/pattern/feedback translations, add interactive `order` / `gap` / `fix` exercises alongside `choice`, improve Lesson 5 email formatting, and fix `wordCard()` forcing French prompts when `explain === "en"`.
- **Functionality:** Add a unit lesson picker/replay flow, preserve typed drafts (`#use-answer`, `#task-answer`) when starting/stopping audio recording, add an opt-in device Kiswahili TTS fallback toggle (replacing dead Play/Slower clicks), compare `#recall` input on Review reveal via `compareWords()`, harden `SpeechRecognition` error handling, expand UI i18n, and update README auth docs from email-link to email + password.
