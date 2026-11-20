# Twige

An English and Kiswahili learning web app (installable PWA) for one adult learner.

- **Build instructions:** [docs/BUILD_BRIEF.md](docs/BUILD_BRIEF.md). Start with the prototype in section 9.
- **Screen designs (reference only):** `docs/design/` holds the approved design for each screen. Use them for layout, wording and colours; they are not app code.
- **Hosting:** Netlify, auto-deploy from `main` (no build command, publish directory `/`).

## Already set up (20 Nov 2026)

- **Firebase project `twige-learning`:** web app registered (config in `src/config.js`); Authentication with Email/Password and Email link (passwordless) sign-in; authorised domain `twige-learning.netlify.app`; Firestore database (Standard, production mode, `africa-south1`). Firebase Storage is not enabled (needs a paid plan), so recordings stay on the device.
- **Netlify:** project `twige-learning` linked to this repo, publish directory `/`, no build command.
- **Still to do by the builder:** Firestore security rules (each user reads and writes only `users/{uid}/…`), plus everything in docs/BUILD_BRIEF.md section 9.
