// Offline shell for Set Roulette. Only our own files are cached — never YouTube
// responses or media, which must always come fresh from YouTube.

const CACHE = 'setroulette-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/main.css',
  './assets/icon.svg',
  './src/app.js',
  './src/store.js',
  './src/catalog.js',
  './src/player.js',
  './src/shuffle.js',
  './src/oembed.js',
  './src/youtube-api.js',
  './src/data/sets.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // YouTube, ytimg, googleapis: straight to network

  // Network-first, so a deploy is picked up immediately; cache is the fallback.
  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html')))
  );
});
