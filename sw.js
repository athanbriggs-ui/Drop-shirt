// Bump VERSION whenever any file changes so installed phones pick up the update.
const VERSION = 'stance-v6';
const STATE = 'stance-state'; // nudge settings written by the page
const FILES = [
  './', 'index.html', 'css/app.css', 'js/app.js', 'js/data.js', 'js/guide.js', 'js/clips.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== STATE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Serve from cache straight away, refresh the cache in the background.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      const fresh = fetch(e.request).then((res) => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => hit);
      return hit || fresh;
    }),
  );
});

// Background check-in: the browser wakes this up now and then (Chrome on Android, installed app).
async function backgroundNudge() {
  const cache = await caches.open(STATE);
  const res = await cache.match('state');
  if (!res) return;
  const s = await res.json();
  if (!s.on || !s.bg) return;
  const now = new Date(), h = now.getHours();
  const inHours = s.from <= s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to;
  const trainedToday = s.lastSession && new Date(s.lastSession).toDateString() === now.toDateString();
  if (!inHours || trainedToday || Date.now() - s.last < s.every * 60000) return;
  const open = await self.clients.matchAll({ type: 'window' });
  if (open.some((c) => c.visibilityState === 'visible')) return; // the page handles it when it is on screen
  const body = s.lines[Math.floor(Math.random() * s.lines.length)];
  await self.registration.showNotification('Stance & Motion', {
    body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'nudge', renotify: true, vibrate: [200, 100, 200],
  });
  s.last = Date.now();
  await cache.put('state', new Response(JSON.stringify(s), { headers: { 'content-type': 'application/json' } }));
}
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'nudge') e.waitUntil(backgroundNudge());
});

// Tapping a nudge opens the app with the "start 6 minutes" banner.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window' });
    if (open.length) { await open[0].focus(); return open[0].navigate?.('./?nudge=1'); }
    return self.clients.openWindow('./?nudge=1');
  })());
});
