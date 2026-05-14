// ELfashih Service Worker — PWA Offline Support
const CACHE_VERSION = 'elfashih-v1';
const AUDIO_CACHE = 'elfashih-audio-v1';

// Asset shell yang di-cache saat install
const SHELL_ASSETS = [
  '/',
  '/static/pwa/icon-192.png',
  '/static/pwa/icon-512.png',
];

// =============================================
// INSTALL — cache shell assets
// =============================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Gagal cache beberapa asset shell:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// =============================================
// ACTIVATE — hapus cache lama
// =============================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_VERSION && k !== AUDIO_CACHE)
            .map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// =============================================
// FETCH — strategi per tipe request
// =============================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // --- File audio MP3: cache-first (setelah pertama diputar, offline tersedia)
  if (url.pathname.startsWith('/audio/') && url.pathname.endsWith('.mp3')) {
    event.respondWith(audioStrategy(event.request));
    return;
  }

  // --- API Quran (alquran.cloud): network-first, fallback ke cache
  if (url.hostname.includes('alquran.cloud')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // --- CDN eksternal (fonts, tailwind, fa): network-first dengan cache fallback
  if (url.hostname !== self.location.hostname) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // --- Aset lokal & halaman utama: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request));
});

// =============================================
// STRATEGI
// =============================================

/** Cache-first untuk audio: hemat bandwidth mobile */
async function audioStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(AUDIO_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Audio tidak tersedia offline', { status: 503 });
  }
}

/** Network-first: utamakan data segar, fallback ke cache */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline — data tidak tersedia', { status: 503 });
  }
}

/** Stale-while-revalidate: tampilkan cache, update di background */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}
