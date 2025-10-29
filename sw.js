const CACHE = "gymplan-v1";
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "login.html",
  "login.css",
  "login.js",
  "icons/logo.png",
  "icons/logo-512.png",
  "manifest.webmanifest"
];

// Install: App-Shell cachen
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

// Activate: alte Caches löschen
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});

// Fetch: API network-first, statische Assets cache-first
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = req.url;

  // Supabase & andere APIs: network-first (Tokens frisch halten)
  if (url.includes(".supabase.co")) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Statische Dateien: cache-first
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
