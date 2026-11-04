// Imported into the service worker (vite.config.ts, workbox.importScripts).
// The earlier Iron Log lived at this same address and cached itself as
// ironlog-v1 through ironlog-v4 (CLAUDE.md, repo instruction 3).

// Replacing that app, whose page can't show an update prompt: take over at once.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      if (keys.some((k) => /^ironlog-v/.test(k))) return self.skipWaiting();
      return undefined;
    }),
  );
});

// Delete its caches, so no phone keeps serving the old app.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => /^ironlog-v/.test(k)).map((k) => caches.delete(k)))));
});
