# Twige prototype

Plain HTML, CSS and JavaScript. Serve the repository root over HTTP (`python3 -m http.server 8080`), then open `http://localhost:8080`. Run `node --test` for the content and scheduler checks. Netlify can publish the repository root without a build command.

The first online visit caches the shell and both five-lesson units. Progress, phrasebook and recordings remain in this browser's IndexedDB. Chrome speech recognition requires internet and may be unavailable on other browsers; it reports only what it heard. English model audio uses the browser's speech synthesis. Kiswahili audio is deliberately labelled as coming until a fluent speaker supplies recordings.

To enable cross-device sync, create a Firebase web app, enable Email Link authentication (and the authorized deployment domain), Firestore and paste the public web config into `src/config.js`. Deploy `firestore.rules` before allowing sign-in. Do not add API secrets. The code intentionally leaves sync disabled until configuration exists. Recordings stay local; the optional upload path and Firebase Storage rules require a later implementation.

All Kiswahili and Kinyarwanda examples are drafts pending fluent-speaker review. Edit lesson data in `content/`; each unit has five lessons, and each lesson needs a dialogue, a rule, four practice prompts, a speaking line and a real use prompt. Correct choices are numeric zero-based indices. Bump the `CACHE` name in `sw.js` whenever lesson content changes.

The brief and design references remain in `docs/` on the default branch. Weekly task feedback can be entered in the same learner's task view; it is not a separate password-protected admin view.
