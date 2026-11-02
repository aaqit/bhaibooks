// Minimal app-shell service worker for PWA installability.
// Accounting data always comes from the local BahiBooks server, never from cache.
const SHELL = 'bahibooks-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.startsWith('/api')) return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (url.origin === self.location.origin && fresh.ok) {
        const cache = await caches.open(SHELL);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      return caches.match('/');
    }
  })());
});
