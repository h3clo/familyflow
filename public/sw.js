/* Family Flow — offline shell. Network-first HTML so deploys show up immediately. */
const BUILD_ID = '__BUILD_ID__';
const CACHE = `familyflow-${BUILD_ID}`;

/** Precache only stable icons — never pin index.html (that blocked fresh CSS). */
const PRECACHE = ['./manifest.webmanifest', './favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const stale = keys.filter((k) => k !== CACHE);
      await Promise.all(stale.map((k) => caches.delete(k)));
      await self.clients.claim();
      // iOS home-screen PWAs often reject Client.navigate — ask clients to reload instead.
      if (stale.length) {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
          try {
            client.postMessage({ type: 'familyflow-sw-updated', buildId: BUILD_ID });
          } catch {
            /* ignore */
          }
        }
      }
    })(),
  );
});

function isHtmlRequest(req, url) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/html')) return true;
  const path = url.pathname;
  return path.endsWith('/') || path.endsWith('/index.html');
}

function isHashedAsset(url) {
  return url.pathname.includes('/assets/');
}

function shouldBypassCache(url) {
  const path = url.pathname;
  return path.endsWith('/sw.js') || path.endsWith('/build.json');
}

async function networkFirst(req, { put = true } = {}) {
  try {
    const res = await fetch(req);
    if (put && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
    }
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (shouldBypassCache(url)) {
    event.respondWith(fetch(req));
    return;
  }

  if (isHtmlRequest(req, url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (isHashedAsset(url)) {
    // Content-hashed Vite assets are immutable; cache-first is safe.
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(networkFirst(req));
});
