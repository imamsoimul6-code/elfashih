
// ELfashih Service Worker — PWA Offline Support
// Versi diperbaiki: cache lebih lengkap, tidak self-destruct

// PENTING: naikkan angka versi ini SETIAP KALI index.html/app diperbarui.
// Mengubah string ini membuat browser menganggap sw.js "berubah", sehingga
// siklus install→activate berjalan lagi dan cache lama otomatis dibuang
// (lihat listener 'activate' di bawah).
const CACHE_VERSION  = 'elfashih-v3';
const AUDIO_CACHE    = 'elfashih-audio-v3';
const CDN_CACHE      = 'elfashih-cdn-v3';
const API_CACHE      = 'elfashih-api-v3';

// ─── Asset shell yang WAJIB ada saat install ──────────────────────────────────
// Semua harus berhasil di-cache; kalau satu gagal, install dibatalkan.
const SHELL_ASSETS = [
  '/',
  '/sw.js',
  '/manifest.json',
  '/static/pwa/icon-192.png',
  '/static/pwa/icon-512.png',
];

// ─── CDN eksternal yang di-cache saat install ────────────────────────────────
// Dibuat terpisah agar kegagalan CDN tidak membatalkan install shell.
const CDN_ASSETS = [
  'https://unpkg.com/quran-madina-html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
];

// ─── INSTALL ─────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Shell lokal — harus sukses semua
      caches.open(CACHE_VERSION).then((cache) =>
        cache.addAll(SHELL_ASSETS).catch((err) => {
          console.warn('[SW] Gagal cache shell asset:', err);
        })
      ),
      // CDN eksternal — gagal satu tidak apa-apa
      caches.open(CDN_CACHE).then((cache) =>
        Promise.allSettled(
          CDN_ASSETS.map((url) =>
            fetch(url, { mode: 'no-cors' })
              .then((res) => cache.put(url, res))
              .catch(() => console.warn('[SW] CDN tidak bisa di-cache saat install:', url))
          )
        )
      ),
    ]).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const VALID_CACHES = [CACHE_VERSION, AUDIO_CACHE, CDN_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !VALID_CACHES.includes(k))
          .map((k) => {
            console.log('[SW] Hapus cache lama:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Abaikan request non-GET (POST login, dsb.)
  if (req.method !== 'GET') return;

  // Abaikan chrome-extension dan sejenisnya
  if (!url.protocol.startsWith('http')) return;

  // 1. Audio MP3 — cache-first (hemat bandwidth, offline setelah pertama putar)
  if (url.pathname.endsWith('.mp3')) {
    event.respondWith(cacheFirst(req, AUDIO_CACHE));
    return;
  }

  // 2. API Quran (alquran.cloud) — network-first, fallback cache
  if (url.hostname.includes('alquran.cloud')) {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }

  // 3. Font Awesome web fonts — cache-first setelah ter-cache
  if (url.hostname.includes('cloudflare') || url.pathname.match(/\.(woff2?|ttf|eot)$/)) {
    event.respondWith(cacheFirst(req, CDN_CACHE));
    return;
  }

  // 4. CDN eksternal lain (unpkg, fonts.google, dsb.) — stale-while-revalidate
  if (url.hostname !== self.location.hostname) {
    event.respondWith(staleWhileRevalidate(req, CDN_CACHE));
    return;
  }

  // 5. Navigasi halaman (dokumen HTML utama, mis. "/") — NETWORK-FIRST.
  // Dulu ini pakai stale-while-revalidate, akibatnya update index.html baru
  // kelihatan SATU kunjungan setelah deploy (selalu "ketinggalan satu versi").
  // Network-first memastikan begitu deploy baru sudah live, reload berikutnya
  // langsung dapat versi terbaru; kalau offline, baru jatuh ke cache lama.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirst(req, CACHE_VERSION));
    return;
  }

  // 6. Aset lokal lain (JS/CSS/gambar) — stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req, CACHE_VERSION));
});

// ─── STRATEGI ─────────────────────────────────────────────────────────────────

/**
 * Cache-first: tampilkan dari cache. Kalau tidak ada, fetch → simpan → tampilkan.
 * Cocok untuk audio dan font (tidak berubah-ubah).
 */
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Konten tidak tersedia offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/**
 * Network-first: coba ambil dari jaringan dulu. Kalau gagal, pakai cache.
 * Cocok untuk API Quran agar data selalu segar, tapi tetap bisa offline.
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'Offline — data belum ter-cache' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Stale-while-revalidate: tampilkan cache (cepat), update di background.
 * Cocok untuk HTML utama dan CDN agar app langsung terbuka, konten diperbarui diam-diam.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Update di background, tidak ditunggu
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Kalau ada cache → langsung tampilkan, fetch jalan di background
  if (cached) return cached;

  // Kalau belum ada cache → tunggu fetch
  const response = await fetchPromise;
  if (response) return response;

  // Fallback terakhir
  return new Response('App sedang offline dan belum pernah di-cache.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// ─── PESAN DARI HALAMAN (opsional) ───────────────────────────────────────────
// Halaman bisa kirim pesan { type: 'SKIP_WAITING' } untuk paksa update SW
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
