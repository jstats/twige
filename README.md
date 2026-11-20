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
