// Network first, cache as fallback: learners get the newest lessons when online,
// and the last saved copy when offline. Bump CACHE when the asset list changes.
const CACHE = "twige-v8";
const ASSETS = [
  "/",
  "/index.html",
  "/src/style.css",
  "/src/app.js",
  "/src/store.js",
  "/src/sync.js",
  "/src/srs.js",
  "/src/speech.js",
  "/src/wav.js",
  "/src/reading.js",
  "/src/compare.js",
  "/src/practice.js",
  "/src/levelcheck.js",
  "/src/config.js",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/content/en/unit-01.json",
  "/content/sw/unit-01.json",
  "/content/levelcheck/en.json",
  "/content/en/reading.json"
];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())),
);

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const key = e.request.mode === "navigate" ? "/index.html" : e.request;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return r;
      })
      .catch(() => caches.match(key, { ignoreSearch: e.request.mode === "navigate" }).then((c) => c || caches.match("/index.html"))),
  );
});
