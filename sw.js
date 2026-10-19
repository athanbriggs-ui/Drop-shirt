// Offline support: everything the app needs is cached on install, so it opens without a connection.
const VERSION = 'dropstudio-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'fonts/anton.woff2',
  'fonts/archivo-black.woff2',
  'fonts/bebas-neue.woff2',
  'fonts/bigshoulders-600.woff2',
  'fonts/bigshoulders-800.woff2',
  'fonts/instrument-400.woff2',
  'fonts/instrument-600.woff2',
  'fonts/pacifico.woff2',
  'fonts/permanent-marker.woff2',
  'fonts/playfair-800i.woff2',
  'fonts/rubik-mono.woff2',
  'fonts/space-mono-700.woff2',
  'fonts/unifraktur.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'js/app.js',
  'js/export.js',
  'js/garments.js',
  'js/mesh.js',
  'js/scene.js',
  'js/store.js',
  'js/textures.js',
  'vendor/delaunator.js',
  'vendor/three/addons/OrbitControls.js',
  'vendor/three/addons/RoomEnvironment.js',
  'vendor/three/three.core.js',
  'vendor/three/three.module.js',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('dropstudio-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit || caches.match('index.html'));
      return hit || net;
    })
  );
});
