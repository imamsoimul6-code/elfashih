// =============================================
// TAB SCROLL
// =============================================
function scrollTabs(dir) {
    const row = document.getElementById('topbarRow2');
    if (row) row.scrollBy({ left: dir * 120, behavior: 'smooth' });
}
function scrollToActiveTab(juz) {
    const tab = document.getElementById('juzTab' + juz);
    if (tab) tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

// =============================================
// MUSHAF SCALE
// =============================================
function updateMushafScale() {
    const contentW = Math.min(window.innerWidth * 0.98, 600);
    document.documentElement.style.setProperty('--mf-content-w', contentW + 'px');
    // Delay sedikit agar layout settle dulu
    requestAnimationFrame(() => scaleMushafLines());
}
function scaleMushafLines() {
    // Batch: baca semua dulu (read phase), tulis semua kemudian (write phase) — hindari layout thrashing
    const cards = document.querySelectorAll('.mushaf-page-card');
    const reads = [];
    cards.forEach(card => {
        const body = card.querySelector('.mushaf-body');
        if (!body) return;
        const style = getComputedStyle(body);
        const bodyW = body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (bodyW <= 0) return;
        const lines = card.querySelectorAll('quran-madina-html-line');
        lines.forEach(line => {
            line.style.transform = '';  // reset
        });
        // Baca scrollWidth setelah reset (1 reflow per card)
        lines.forEach(line => {
            reads.push({ line, bodyW, nw: line.scrollWidth });
        });
    });
    // Write phase — tidak ada reflow
    reads.forEach(({ line, bodyW, nw }) => {
        if (nw <= 0) return;
        const finalScale = Math.min(bodyW / nw, 1.5);
        line.style.transform = `scaleX(${finalScale})`;
        line.style.transformOrigin = 'right center';
    });
}
window.addEventListener('resize', updateMushafScale);

// =============================================
// STATE
// =============================================
let ayahsData        = [];   // ayat yang sedang aktif ditampilkan
let juzDataCache     = {};   // cache: { 1: [...], 2: [...] }
let activeJuz        = 1;
let viewMode         = 'mushaf';
let isBlindMode      = false;
let isTasmiMode      = false;
let isPlayingAll     = false;
let currentPlayIndex = 0;
let audioPlayer      = null;
// Cache terjemahan per surah: { 1: {1: 'teks...', 2: 'teks...'}, ... }
// Diambil on-demand (baru fetch saat ayat pertama di surah itu diklik untuk
// dilihat terjemahannya), supaya tidak perlu request tambahan di awal load.
let translationCache  = {};
function getAudioPlayer() {
    if (!audioPlayer) audioPlayer = document.getElementById('quranAudio');
    return audioPlayer;
}

// =============================================
// AUDIO ERROR HANDLING (retry + fallback)
// =============================================
// Server everyayah.com kadang membalas 503 (server sedang sibuk/overload).
// Ini murni masalah dari sisi server sumber audio, bukan bug di aplikasi.
// Supaya user tidak mengalami "audio diam saja tanpa keterangan", kita coba
// ulang otomatis beberapa kali dengan jeda sebelum menyerah.
let audioRetryCount = 0;
const AUDIO_MAX_RETRIES = 3;
const AUDIO_RETRY_DELAY_MS = 900;
let recognition      = null;
let ayahElementMap   = {};
let isLoopMode       = false;
let loopStart        = 0;
let loopEnd          = 0;
let loopCount        = 0;
let loopMax          = 3;
let tasmiStartIndex  = 0;
let selectMode       = null;

// Repeat per ayat
let isRepeatAyah     = false;
let repeatAyahCount  = 0;
let repeatAyahMax    = 3;

// Qari
const QARI_LIST = [
    // ── Murattal ──────────────────────────────────────────────
    { id: 'Abdul_Basit_Murattal_64kbps',                name: 'Abdul Basit Abdus Samad',        style: 'Murattal', icon: '🎙️' },
    { id: 'Alafasy_64kbps',                              name: 'Mishary Rashid Alafasy',          style: 'Murattal', icon: '🎙️' },
    { id: 'Husary_64kbps',                               name: 'Mahmoud Khalil Al-Husary',        style: 'Murattal', icon: '🎙️' },
    { id: 'Minshawy_Murattal_128kbps',                  name: 'Mohamed Siddiq Al-Minshawy',      style: 'Murattal', icon: '🎙️' },
    { id: 'Mohammad_al_Tablaway_128kbps',               name: 'Mohammad al-Tablaway',            style: 'Murattal', icon: '🎙️' },
    { id: 'Maher_AlMuaiqly_64kbps',                     name: 'Maher Al-Muaiqly',               style: 'Murattal', icon: '🎙️' },
    { id: 'Ayman_Sowaid_64kbps',                         name: 'Ayman Sowaid',                   style: 'Murattal', icon: '🎙️' },
    { id: 'Ghamadi_40kbps',                              name: 'Saad Al-Ghamdi',                 style: 'Murattal', icon: '🎙️' },
    { id: 'Abu_Bakr_Ash-Shaatree_128kbps',              name: 'Abu Bakr Ash-Shaatree',          style: 'Murattal', icon: '🎙️' },
    { id: 'Abdurrahmaan_As-Sudais_64kbps',              name: 'Abdurrahmaan As-Sudais',         style: 'Murattal', icon: '🎙️' },
    { id: 'Dussary_128kbps',                             name: 'Yasser Ad-Dussary',              style: 'Murattal', icon: '🎙️' },
    { id: 'Nasser_Alqatami_128kbps',                    name: 'Nasser Alqatami',                style: 'Murattal', icon: '🎙️' },
    { id: 'Hani_Rifai_64kbps',                          name: 'Hani Ar-Rifai',                  style: 'Murattal', icon: '🎙️' },
    { id: 'Abdullah_Basfar_192kbps',                    name: 'Abdullah Basfar',                style: 'Murattal', icon: '🎙️' },
    { id: 'Muhammad_Jibreel_128kbps',                   name: 'Muhammad Jibreel',               style: 'Murattal', icon: '🎙️' },
    { id: 'Muhammad_Ayyoub_128kbps',                    name: 'Muhammad Ayyoub',                style: 'Murattal', icon: '🎙️' },
    { id: 'Salah_Al_Budair_128kbps',                    name: 'Salah Al-Budair',                style: 'Murattal', icon: '🎙️' },
    { id: 'Shuraym_128kbps',                             name: 'Saood Ash-Shuraym',              style: 'Murattal', icon: '🎙️' },
    { id: 'Hudhaify_128kbps',                            name: 'Ali Al-Hudhaify',                style: 'Murattal', icon: '🎙️' },
    { id: 'Ibrahim_Akhdar_32kbps',                      name: 'Ibrahim Al-Akhdar',              style: 'Murattal', icon: '🎙️' },
    { id: 'khalefa_al_tunaiji_64kbps',                  name: 'Khalefa Al-Tunaiji',             style: 'Murattal', icon: '🎙️' },
    { id: 'Ali_Hajjaj_AlSuesy_128kbps',                 name: 'Ali Hajjaj Al-Souasy',           style: 'Murattal', icon: '🎙️' },
    { id: 'Akram_AlAlaqimy_128kbps',                    name: 'Akram Al-Alaqimy',               style: 'Murattal', icon: '🎙️' },
    // ── Mujawwad ──────────────────────────────────────────────
    { id: 'Abdul_Basit_Mujawwad_128kbps',              name: 'Abdul Basit Abdus Samad',        style: 'Mujawwad', icon: '✨' },
    { id: 'Husary_128kbps_Mujawwad',                    name: 'Mahmoud Khalil Al-Husary',       style: 'Mujawwad', icon: '✨' },
    { id: 'Minshawy_Mujawwad_192kbps',                  name: 'Mohamed Siddiq Al-Minshawy',    style: 'Mujawwad', icon: '✨' },
];
let selectedQariId = localStorage.getItem('elfashih_qari') || 'Abdul_Basit_Murattal_64kbps';

// =============================================
// DASHBOARD
// =============================================
function showDashboard() {
    document.getElementById('quizView').classList.remove('active');
    document.getElementById('dashboardView').classList.add('active');
    updateDashboard();
}
function hideDashboard() {
    document.getElementById('dashboardView').classList.remove('active');
}
function openJuz(juz) {
    hideDashboard();
    // ── GA4: catat juz yang dibuka ──
    gaEvent('open_juz', { juz_number: juz });
    if (juz !== activeJuz) {
        switchJuz(juz);
    } else {
        // Juz sudah aktif tapi konten perlu dirender ulang (misal dari dashboard)
        renderContent();
        scrollToActiveTab(juz);
    }
}

function updateDashboard() {
    // Date
    const now = new Date();
    const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
    document.getElementById('dashDateDay').textContent = days[now.getDay()];
    document.getElementById('dashDateFull').textContent = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

    // Greeting
    const h = now.getHours();
    const greets = h < 5 ? 'Lailahaillallah 🌙' : h < 11 ? 'Selamat Pagi ☀️' : h < 15 ? 'Selamat Siang 🌤️' : h < 18 ? 'Selamat Sore 🌇' : 'Selamat Malam 🌙';
    document.getElementById('dashGreetTitle').textContent = greets;

    // Progress hafalan global (all juz combined)
    const hafalanData = JSON.parse(localStorage.getItem('elfashih_hafalan') || '{}');
    let totalLancar = 0, totalProses = 0, totalBelum = 0, totalAll = 0;
    const juzAyatCounts = { 1: 149, 2: 111, 3: 112, 4: 176, 5: 124, 6: 110, 7: 149, 8: 148, 9: 154, 10: 128, 11: 151, 12: 170, 13: 154, 14: 227, 15: 185, 16: 243, 17: 170, 18: 202, 19: 179, 20: 184, 21: 178, 22: 169, 23: 357, 24: 175, 25: 200, 26: 195, 27: 399, 28: 137, 29: 431, 30: 564 };
    for (let j = 1; j <= 30; j++) {
        const data = juzDataCache[j] || [];
        const count = data.filter(a => !a._overflow).length || juzAyatCounts[j];
        let jLancar = 0, jProses = 0;
        data.forEach(a => {
            if (a._overflow) return; // ayat pelengkap halaman, bukan bagian juz ini
            const k = `${a.surah.number}:${a.numberInSurah}`;
            const st = hafalanData[k];
            if (st === 'lancar') jLancar++;
            else if (st === 'proses') jProses++;
        });
        const jBelum = count - jLancar - jProses;
        totalLancar += jLancar; totalProses += jProses; totalBelum += (jBelum > 0 ? jBelum : 0);
        totalAll += count;
        const pct = count > 0 ? Math.round(jLancar / count * 100) : 0;
        const bar = document.getElementById(`dashJuz${j}Bar`);
        const pctEl = document.getElementById(`dashJuz${j}Pct`);
        if (bar) bar.style.width = pct + '%';
        if (pctEl) pctEl.textContent = pct + '% lancar';
        const card = document.getElementById(`dashJuz${j}`);
        if (card) card.classList.toggle('active-juz', j === activeJuz);
    }
    document.getElementById('dashStatLancar').textContent = totalLancar;
    document.getElementById('dashStatProses').textContent = totalProses;
    document.getElementById('dashStatBelum').textContent = totalBelum;
    const pct = totalAll > 0 ? Math.round(totalLancar / totalAll * 100) : 0;
    document.getElementById('dashProgressPct').textContent = pct + '%';
    const circumference = 188.5;
    const offset = circumference - (pct / 100) * circumference;
    const ring = document.getElementById('dashRingCircle');
    if (ring) ring.style.strokeDashoffset = offset;

        // Sync juz select dropdown dengan activeJuz
    const sel = document.getElementById('dashJuzSelect');
    if (sel) { sel.value = String(activeJuz); updateJuzSelectInfo(); }

    // Streak (simple: track last active date)
    const streakData = JSON.parse(localStorage.getItem('elfashih_streak') || '{"count":0,"lastDate":""}');
    document.getElementById('dashStreakNum').textContent = streakData.count || 0;

    // Today schedule
    renderDashSchedule();

    // Murojaah badge
    updateDashMurojaah();

    // Cache status
    updateDashCacheStatus();

    // Net status
    updateNetBadge();
}

function renderDashSchedule() {
    const list = document.getElementById('dashScheduleList');
    const todayDay = new Date().getDay();
    const todaySchedules = schedules.filter(s => s.active && s.days.includes(todayDay));
    if (!todaySchedules.length) {
        list.innerHTML = '<div class="dash-sched-empty">Belum ada jadwal untuk hari ini.<br><small>Tambah di menu Jadwal & Pengingat.</small></div>';
        return;
    }
    list.innerHTML = todaySchedules.map(s => `
        <div class="dash-sched-item">
            <div class="dash-sched-time">${s.time}</div>
            <div>
                <div class="dash-sched-type">${typeEmoji[s.type]} ${typeLabel[s.type]}</div>
                <div class="dash-sched-days">${s.days.length === 7 ? 'Setiap hari' : s.days.map(d => dayShort[d]).join(', ')}</div>
            </div>
        </div>
    `).join('');
}

function updateNetBadge() {
    const badge = document.getElementById('dashNetBadge');
    const isCached = localStorage.getItem('elfashih_quran_cached') === '1';
    if (navigator.onLine) {
        badge.className = 'offline-badge online';
        badge.innerHTML = '<span class="badge-dot"></span> Online';
    } else if (isCached) {
        badge.className = 'offline-badge cached';
        badge.innerHTML = '<span class="badge-dot"></span> Offline (cached)';
    } else {
        badge.className = 'offline-badge offline';
        badge.innerHTML = '<span class="badge-dot"></span> Offline';
    }
}

window.addEventListener('online',  updateNetBadge);
window.addEventListener('offline', updateNetBadge);

// Update streak when app is opened
function updateStreak() {
    const today = new Date().toDateString();
    const data = JSON.parse(localStorage.getItem('elfashih_streak') || '{"count":0,"lastDate":""}');
    if (data.lastDate === today) return;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (data.lastDate === yesterday) {
        data.count = (data.count || 0) + 1;
    } else {
        data.count = 1;
    }
    data.lastDate = today;
    localStorage.setItem('elfashih_streak', JSON.stringify(data));
}

// =============================================
// OFFLINE CACHE (IndexedDB)
// =============================================
const DB_NAME = 'elfashih_db';
const DB_VER  = 2;
let db = null;

function openDB() {
    return new Promise((res, rej) => {
        if (db) return res(db);
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = e => {
            const idb = e.target.result;
            if (!idb.objectStoreNames.contains('juz')) {
                idb.createObjectStore('juz', { keyPath: 'id' });
            }
        };
        req.onsuccess = e => { db = e.target.result; res(db); };
        req.onerror   = e => rej(e.target.error);
    });
}

async function saveJuzToIDB(juzNum, ayahs) {
    const idb = await openDB();
    return new Promise((res, rej) => {
        const tx  = idb.transaction('juz', 'readwrite');
        const st  = tx.objectStore('juz');
        st.put({ id: `juz_${juzNum}`, ayahs, savedAt: Date.now() });
        tx.oncomplete = () => res(true);
        tx.onerror    = e => rej(e.target.error);
    });
}

async function loadJuzFromIDB(juzNum) {
    const idb = await openDB();
    return new Promise((res, rej) => {
        const tx  = idb.transaction('juz', 'readonly');
        const st  = tx.objectStore('juz');
        const req = st.get(`juz_${juzNum}`);
        req.onsuccess = e => res(e.target.result ? e.target.result.ayahs : null);
        req.onerror   = e => rej(e.target.error);
    });
}

async function checkAllJuzCached() {
    try {
        for (let j = 1; j <= 25; j++) {
        }
        return true;
    } catch { return false; }
}

async function updateDashCacheStatus() {
    const cached = await checkAllJuzCached();
    const btn = document.getElementById('dashCacheBtn');
    const icon = document.getElementById('dashCacheIcon');
    const title = document.getElementById('dashCacheTitle');
    const desc  = document.getElementById('dashCacheDesc');
    if (cached) {
        icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-teal)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        title.textContent = 'Data Tersedia Offline';
        desc.textContent  = 'Semua juz (1–25) tersimpan di perangkat';
        btn.textContent   = 'Perbarui';
        localStorage.setItem('elfashih_quran_cached', '1');
        updateNetBadge();
    } else {
        icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
        title.textContent = 'Simpan Data Offline';
        desc.textContent  = 'Unduh data Al-Quran agar bisa diakses tanpa internet';
        btn.textContent   = 'Unduh';
        localStorage.removeItem('elfashih_quran_cached');
    }
}

async function startCacheDownload() {
    const btn = document.getElementById('dashCacheBtn');
    btn.disabled = true;
    document.getElementById('cacheOverlay').classList.add('visible');
    const fill   = document.getElementById('cacheBarFill');
    const pctEl  = document.getElementById('cachePctText');
    const statEl = document.getElementById('cacheStatusText');
    const steps  = [
        { juz: 1, url: 'https://api.alquran.cloud/v1/juz/1/quran-simple', label: 'Juz 1 — Al-Fatihah & Al-Baqarah...' },
        { juz: 2, url: 'https://api.alquran.cloud/v1/juz/2/quran-simple', label: 'Juz 2 — Al-Baqarah 142–252...' },
        { juz: 3, url: 'https://api.alquran.cloud/v1/juz/3/quran-simple', label: 'Juz 3 — Al-Baqarah & Ali Imran 1–91...' },
        { juz: 4, url: null, label: 'Juz 4 — Ali Imran 92–200 & An-Nisa 1–23...' },
        { juz: 5, url: null, label: 'Juz 5 — An-Nisa 24–147...' },
    ];
    try {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const basePct = Math.round(i * 100 / steps.length);
            statEl.textContent = step.label;
            fill.style.width   = basePct + '%';
            pctEl.textContent  = basePct + '%';
            let ayahs;
            if (step.juz === 4) {
                const [r3, r4] = await Promise.all([
                    fetchWithRetry('https://api.alquran.cloud/v1/surah/3'),
                    fetchWithRetry('https://api.alquran.cloud/v1/surah/4')
                ]);
                const [d3, d4] = await Promise.all([r3.json(), r4.json()]);
                const sm3 = { number: d3.data.number, name: d3.data.name, englishName: d3.data.englishName, numberOfAyahs: d3.data.numberOfAyahs };
                const sm4 = { number: d4.data.number, name: d4.data.name, englishName: d4.data.englishName, numberOfAyahs: d4.data.numberOfAyahs };
                ayahs = [
                    ...d3.data.ayahs.filter(a => a.numberInSurah >= 92).map(a => ({ ...a, surah: sm3, juz: 4 })),
                    ...d4.data.ayahs.filter(a => a.numberInSurah <= 23).map(a => ({ ...a, surah: sm4, juz: 4 }))
                ];
            } else if (step.juz === 5) {
                const r4 = await fetchWithRetry('https://api.alquran.cloud/v1/surah/4');
                const d4 = await r4.json();
                const sm4 = { number: d4.data.number, name: d4.data.name, englishName: d4.data.englishName, numberOfAyahs: d4.data.numberOfAyahs };
                ayahs = d4.data.ayahs
                    .filter(a => a.numberInSurah >= 24 && a.numberInSurah <= 147)
                    .map(a => ({ ...a, surah: sm4, juz: 5 }));} else {
                const res  = await fetch(step.url);
                const data = await res.json();
                ayahs  = data.data.ayahs;
                if (step.juz === 2) {
                    ayahs = ayahs.filter(a => a.surah.number === 2 && a.numberInSurah >= 142 && a.numberInSurah <= 252);
                } else if (step.juz === 3) {
                    ayahs = ayahs.filter(a => !(a.surah.number === 3 && a.numberInSurah >= 92));
                }
            }
            await saveJuzToIDB(step.juz, ayahs);
            juzDataCache[step.juz] = ayahs;
            const donePct = Math.round((i + 1) * 100 / steps.length);
            fill.style.width  = donePct + '%';
            pctEl.textContent = donePct + '%';
        }
        fill.style.width  = '100%';
        pctEl.textContent = '100%';
        statEl.textContent = 'Selesai! Data tersimpan offline.';
        localStorage.setItem('elfashih_quran_cached', '1');
        setTimeout(() => {
            document.getElementById('cacheOverlay').classList.remove('visible');
            btn.disabled = false;
            updateDashCacheStatus();
            showToast('✅ Data Al-Quran tersimpan offline!');
        }, 1200);
    } catch (err) {
        statEl.textContent = 'Gagal! Periksa koneksi internet.';
        setTimeout(() => {
            document.getElementById('cacheOverlay').classList.remove('visible');
            btn.disabled = false;
        }, 2000);
    }
}

// =============================================
// BOOT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    updateStreak();
    updateMushafScale();
    loadAllData();
    initAudioEvents();
    initSpeechRecognition();
    initScrollPageIndicator();
    registerServiceWorker();
    initPWAInstall();
    // updateDashboard hanya dijalankan saat dashboard dibuka, bukan di boot
    // agar tidak ada side effect pada tampilan awal
});

// =============================================
// PWA
// =============================================
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(r => {
            console.log('[SW] Terdaftar:', r.scope);
            // Cek update SW di background (tidak menghapus cache aktif)
            r.update().catch(() => {});
            // Kalau ada SW baru siap, aktif di reload berikutnya
            r.addEventListener('updatefound', () => {
                const newSW = r.installing;
                newSW.addEventListener('statechange', () => {
                    if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[SW] Versi baru tersedia, aktif di reload berikutnya.');
                    }
                });
            });
        })
        .catch(e => console.warn('[SW] Gagal daftar:', e));
}
window.deferredInstallPrompt = null;
function initPWAInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        window.deferredInstallPrompt = e;
        if (!localStorage.getItem('pwa-dismissed'))
            document.getElementById('installBanner').classList.add('visible');
        const loginBtn = document.getElementById('loginInstallBtn');
        if (loginBtn) loginBtn.classList.remove('hide');
    });
    window.addEventListener('appinstalled', () => {
        document.getElementById('installBanner').classList.remove('visible');
        window.deferredInstallPrompt = null;
        const loginBtn = document.getElementById('loginInstallBtn');
        if (loginBtn) loginBtn.classList.add('hide');
    });
}
function installPWA() {
    if (!window.deferredInstallPrompt) return;
    window.deferredInstallPrompt.prompt();
    window.deferredInstallPrompt.userChoice.then(c => {
        if (c.outcome === 'accepted') document.getElementById('installBanner').classList.remove('visible');
        window.deferredInstallPrompt = null;
    });
}
function dismissInstall() {
    document.getElementById('installBanner').classList.remove('visible');
    localStorage.setItem('pwa-dismissed', '1');
}

// =============================================
// FETCH HELPER — retry otomatis + timeout + cek status HTTP
// Signature-nya sama seperti fetch() bawaan (return Response),
// jadi bisa langsung menggantikan semua fetch() ke api.alquran.cloud
// tanpa mengubah kode res.json() yang sudah ada.
// Tujuannya: tahan terhadap koneksi lambat, rate-limit (429), atau
// error sesaat dari server — bukan langsung gagal & tampil error.
// =============================================
async function fetchWithRetry(url, { retries = 3, timeoutMs = 12000, backoffMs = 800 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            // 429 (rate limit) / 5xx layak di-retry; selain itu langsung kembalikan
            // apa adanya (biar caller yang tangani, mis. 404) tanpa buang-buang retry.
            if (res.status === 429 || res.status >= 500) {
                throw new Error('HTTP ' + res.status);
            }
            return res;
        } catch (err) {
            clearTimeout(timer);
            lastErr = err;
            const isLast = attempt === retries;
            console.warn(`[fetchWithRetry] Percobaan ${attempt + 1}/${retries + 1} gagal untuk ${url}:`, err.message || err);
            if (isLast) break;
            await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt)));
        }
    }
    throw lastErr;
}

// =============================================
// LOAD DATA — with offline IndexedDB fallback
// =============================================
async function loadAllData() {
    try {
        // Try loading from IndexedDB first
        const [cached1, cached2, cached3, cached4, cached5, cached6, cached7, cached8, cached9, cached10, cached11, cached12, cached13, cached14, cached15, cached16, cached17, cached18, cached19, cached20, cached21, cached22, cached23, cached24, cached25, cached26, cached27, cached28, cached29, cached30] = await Promise.all([
            loadJuzFromIDB(1), loadJuzFromIDB(2), loadJuzFromIDB(3), loadJuzFromIDB(4), loadJuzFromIDB(5), loadJuzFromIDB(6), loadJuzFromIDB(7), loadJuzFromIDB(8), loadJuzFromIDB(9), loadJuzFromIDB(10), loadJuzFromIDB(11), loadJuzFromIDB(12), loadJuzFromIDB(13), loadJuzFromIDB(14), loadJuzFromIDB(15), loadJuzFromIDB(16), loadJuzFromIDB(17), loadJuzFromIDB(18), loadJuzFromIDB(19), loadJuzFromIDB(20), loadJuzFromIDB(21), loadJuzFromIDB(22), loadJuzFromIDB(23), loadJuzFromIDB(24), loadJuzFromIDB(25), loadJuzFromIDB(26), loadJuzFromIDB(27), loadJuzFromIDB(28), loadJuzFromIDB(29), loadJuzFromIDB(30)
        ]);

        if (cached1 && cached1.length > 0) {
            juzDataCache[1] = cached1;
            ayahsData = cached1;
            renderContent();
            document.getElementById('loading').style.display = 'none';
        }
        if (cached2 && cached2.length > 0) {
            juzDataCache[2] = cached2;
            const tab2 = document.getElementById('juzTab2');
            if (tab2) tab2.dataset.ready = '1';
        }
        if (cached3 && cached3.length > 0) {
            // Pastikan ayat Ali Imran 92 (awal Juz 4) tidak ikut
            juzDataCache[3] = cached3.filter(a =>
                !(a.surah.number === 3 && a.numberInSurah >= 92)
            );
            const tab3 = document.getElementById('juzTab3');
            if (tab3) tab3.dataset.ready = '1';
        }
        if (cached4 && cached4.length > 0) {
            // Validasi: pastikan ayat 92 Ali Imran ada DAN field surah tersedia
            const first = cached4[0];
            const hasAyat92 = cached4.some(a => a.surah && a.surah.number === 3 && a.numberInSurah === 92);
            if (hasAyat92 && first && first.surah) {
                juzDataCache[4] = cached4;
                const tab4 = document.getElementById('juzTab4');
                if (tab4) tab4.dataset.ready = '1';
            } else {
                console.warn('[Juz4] Cache tidak valid, fetch ulang...');
                loadJuzFour();
            }
        }
        if (cached5 && cached5.length > 0) {
            // Validasi: field surah harus ada dan dimulai dari ayat 24
            const first5 = cached5[0];
            const hasAyat24 = cached5.some(a => a.surah && a.surah.number === 4 && a.numberInSurah === 24);
            if (hasAyat24 && first5 && first5.surah) {
                juzDataCache[5] = cached5;
                const tab5 = document.getElementById('juzTab5');
                if (tab5) tab5.dataset.ready = '1';
            } else {
                console.warn('[Juz5] Cache tidak valid, fetch ulang...');
                loadJuzFive();
            }
        }
        if (cached6 && cached6.length > 0) {
            // Validasi: harus ada An-Nisa 148 sebagai awal Juz 6
            // Boleh ada Al-Maidah 82 (overflow halaman 121), tapi tidak boleh ada ayat > 82
            const hasAyat148 = cached6.some(a => a.surah && a.surah.number === 4 && a.numberInSurah === 148);
            const hasBadOverflow = cached6.some(a => a.surah && a.surah.number === 5 && a.numberInSurah > 82);
            if (hasAyat148 && !hasBadOverflow) {
                juzDataCache[6] = cached6;
                const tab6 = document.getElementById('juzTab6');
                if (tab6) tab6.dataset.ready = '1';
            } else {
                console.warn('[Juz6] Cache tidak valid atau ada overflow berlebih, fetch ulang...');
                loadJuzSix();
            }
        }
        if (cached7 && cached7.length > 0) {
            // Validasi: harus ada Al-Maidah 83 sebagai awal Juz 7
            const hasAyat83 = cached7.some(a => a.surah && a.surah.number === 5 && a.numberInSurah === 83);
            if (hasAyat83) {
                juzDataCache[7] = cached7;
                const tab7 = document.getElementById('juzTab7');
                if (tab7) tab7.dataset.ready = '1';
            } else {
                console.warn('[Juz7] Cache tidak valid, fetch ulang...');
                loadJuzSeven();
            }
        }
        if (cached8 && cached8.length > 0) {
            // Validasi: harus ada Al-An'am 111 sebagai awal Juz 8
            const hasAyat111 = cached8.some(a => a.surah && a.surah.number === 6 && a.numberInSurah === 111);
            if (hasAyat111) {
                juzDataCache[8] = cached8;
                const tab8 = document.getElementById('juzTab8');
                if (tab8) tab8.dataset.ready = '1';
            } else {
                console.warn('[Juz8] Cache tidak valid, fetch ulang...');
                loadJuzEight();
            }
        }
        if (cached9 && cached9.length > 0) {
            // Validasi: harus ada Al-A'raf 88 sebagai awal Juz 9
            const hasAyat88 = cached9.some(a => a.surah && a.surah.number === 7 && a.numberInSurah === 88);
            if (hasAyat88) {
                juzDataCache[9] = cached9;
                const tab9 = document.getElementById('juzTab9');
                if (tab9) tab9.dataset.ready = '1';
            } else {
                console.warn('[Juz9] Cache tidak valid, fetch ulang...');
                loadJuzNine();
            }
        }
        if (cached10 && cached10.length > 0) {
            // Validasi: harus ada Al-Anfal 41 sebagai awal Juz 10
            const hasAyat41 = cached10.some(a => a.surah && a.surah.number === 8 && a.numberInSurah === 41);
            if (hasAyat41) {
                juzDataCache[10] = cached10;
                const tab10 = document.getElementById('juzTab10');
                if (tab10) tab10.dataset.ready = '1';
            } else {
                console.warn('[Juz10] Cache tidak valid, fetch ulang...');
                loadJuzTen();
            }
        }
        if (cached11 && cached11.length > 0) {
            // Validasi: harus ada At-Taubah 94 sebagai awal Juz 11
            const hasAyat94 = cached11.some(a => a.surah && a.surah.number === 9 && a.numberInSurah === 94);
            if (hasAyat94) {
                juzDataCache[11] = cached11;
                const tab11 = document.getElementById('juzTab11');
                if (tab11) tab11.dataset.ready = '1';
            } else {
                console.warn('[Juz11] Cache tidak valid, fetch ulang...');
                loadJuzEleven();
            }
        }
        if (cached12 && cached12.length > 0) {
            // Validasi: harus ada Hud 6 sebagai awal Juz 12
            const hasAyat6 = cached12.some(a => a.surah && a.surah.number === 11 && a.numberInSurah === 6);
            if (hasAyat6) {
                juzDataCache[12] = cached12;
                const tab12 = document.getElementById('juzTab12');
                if (tab12) tab12.dataset.ready = '1';
            } else {
                console.warn('[Juz12] Cache tidak valid, fetch ulang...');
                loadJuzTwelve();
            }
        }
        if (cached13 && cached13.length > 0) {
            // Validasi: harus ada Yusuf 53 sebagai awal Juz 13
            const hasAyat53 = cached13.some(a => a.surah && a.surah.number === 12 && a.numberInSurah === 53);
            if (hasAyat53) {
                juzDataCache[13] = cached13;
                const tab13 = document.getElementById('juzTab13');
                if (tab13) tab13.dataset.ready = '1';
            } else {
                console.warn('[Juz13] Cache tidak valid, fetch ulang...');
                loadJuzThirteen();
            }
        }
        if (cached14 && cached14.length > 0) {
            // Validasi: harus ada Al-Hijr 1 sebagai awal Juz 14
            const hasAyat1 = cached14.some(a => a.surah && a.surah.number === 15 && a.numberInSurah === 1);
            if (hasAyat1) {
                juzDataCache[14] = cached14;
                const tab14 = document.getElementById('juzTab14');
                if (tab14) tab14.dataset.ready = '1';
            } else {
                console.warn('[Juz14] Cache tidak valid, fetch ulang...');
                loadJuzFourteen();
            }
        }
        if (cached15 && cached15.length > 0) {
            // Validasi: harus ada Al-Isra 1 sebagai awal Juz 15
            const hasAyat1Isra = cached15.some(a => a.surah && a.surah.number === 17 && a.numberInSurah === 1);
            if (hasAyat1Isra) {
                juzDataCache[15] = cached15;
                const tab15 = document.getElementById('juzTab15');
                if (tab15) tab15.dataset.ready = '1';
            } else {
                console.warn('[Juz15] Cache tidak valid, fetch ulang...');
                loadJuzFifteen();
            }
        }
        if (cached16 && cached16.length > 0) {
            const hasAyat75Kahfi = cached16.some(a => a.surah && a.surah.number === 18 && a.numberInSurah === 75);
            if (hasAyat75Kahfi) {
                juzDataCache[16] = cached16;
                const tab16 = document.getElementById('juzTab16');
                if (tab16) tab16.dataset.ready = '1';
            } else {
                console.warn('[Juz16] Cache tidak valid, fetch ulang...');
                loadJuzSixteen();
            }
        }
        if (cached17 && cached17.length > 0) {
            const hasAyat1Anbiya = cached17.some(a => a.surah && a.surah.number === 21 && a.numberInSurah === 1);
            if (hasAyat1Anbiya) {
                juzDataCache[17] = cached17;
                const tab17 = document.getElementById('juzTab17');
                if (tab17) tab17.dataset.ready = '1';
            } else {
                console.warn('[Juz17] Cache tidak valid, fetch ulang...');
                loadJuzSeventeen();
            }
        }
        if (cached18 && cached18.length > 0) {
            const hasAyat1Muminun = cached18.some(a => a.surah && a.surah.number === 23 && a.numberInSurah === 1);
            if (hasAyat1Muminun) {
                juzDataCache[18] = cached18;
                const tab18 = document.getElementById('juzTab18');
                if (tab18) tab18.dataset.ready = '1';
            } else {
                console.warn('[Juz18] Cache tidak valid, fetch ulang...');
                loadJuzEighteen();
            }
        }
        if (cached19 && cached19.length > 0) {
            const hasAyat21Furqan = cached19.some(a => a.surah && a.surah.number === 25 && a.numberInSurah === 21);
            if (hasAyat21Furqan) {
                juzDataCache[19] = cached19;
                const tab19 = document.getElementById('juzTab19');
                if (tab19) tab19.dataset.ready = '1';
            } else {
                console.warn('[Juz19] Cache tidak valid, fetch ulang...');
                loadJuzNineteen();
            }
        }
        if (cached20 && cached20.length > 0) {
            const hasAyat56Naml = cached20.some(a => a.surah && a.surah.number === 27 && a.numberInSurah === 56);
            if (hasAyat56Naml) {
                juzDataCache[20] = cached20;
                const tab20 = document.getElementById('juzTab20');
                if (tab20) tab20.dataset.ready = '1';
            } else {
                console.warn('[Juz20] Cache tidak valid, fetch ulang...');
                loadJuzTwenty();
            }
        }
        if (cached21 && cached21.length > 0) {
            const hasAyat46Ankabut = cached21.some(a => a.surah && a.surah.number === 29 && a.numberInSurah === 46);
            if (hasAyat46Ankabut) {
                juzDataCache[21] = cached21;
                const tab21 = document.getElementById('juzTab21');
                if (tab21) tab21.dataset.ready = '1';
            } else {
                console.warn('[Juz21] Cache tidak valid, fetch ulang...');
                loadJuzTwentyOne();
            }
        }
        if (cached22 && cached22.length > 0) {
            const hasAyat31Ahzab = cached22.some(a => a.surah && a.surah.number === 33 && a.numberInSurah === 31);
            if (hasAyat31Ahzab) {
                juzDataCache[22] = cached22;
                const tab22 = document.getElementById('juzTab22');
                if (tab22) tab22.dataset.ready = '1';
            } else {
                console.warn('[Juz22] Cache tidak valid, fetch ulang...');
                loadJuzTwentyTwo();
            }
        } else {
            loadJuzTwentyTwo();
        }
        if (cached23 && cached23.length > 0) {
            const hasAyat28Yasin = cached23.some(a => a.surah && a.surah.number === 36 && a.numberInSurah === 28);
            if (hasAyat28Yasin) {
                juzDataCache[23] = cached23;
                const tab23 = document.getElementById('juzTab23');
                if (tab23) tab23.dataset.ready = '1';
            } else {
                console.warn('[Juz23] Cache tidak valid, fetch ulang...');
                loadJuzTwentyThree();
            }
        } else {
            loadJuzTwentyThree();
        }
        if (cached24 && cached24.length > 0) {
            const hasAyat32Zumar = cached24.some(a => a.surah && a.surah.number === 39 && a.numberInSurah === 32);
            if (hasAyat32Zumar) {
                juzDataCache[24] = cached24;
                const tab24 = document.getElementById('juzTab24');
                if (tab24) tab24.dataset.ready = '1';
            } else {
                console.warn('[Juz24] Cache tidak valid, fetch ulang...');
                loadJuzTwentyFour();
            }
        } else {
            loadJuzTwentyFour();
        }
        if (cached25 && cached25.length > 0) {
            // Validasi: harus ada Fussilat 47 sebagai awal Juz 25
            const hasAyat47Fussilat = cached25.some(a => a.surah && a.surah.number === 41 && a.numberInSurah === 47);
            if (hasAyat47Fussilat) {
                juzDataCache[25] = cached25;
                const tab25 = document.getElementById('juzTab25');
                if (tab25) tab25.dataset.ready = '1';
            } else {
                console.warn('[Juz25] Cache tidak valid, fetch ulang...');
                loadJuzTwentyFive();
            }
        } else {
            loadJuzTwentyFive();
        }
        if (cached26 && cached26.length > 0) {
            // Validasi: harus ada Al-Ahqaf 6 sebagai awal Juz 26
            const hasAyat6Ahqaf = cached26.some(a => a.surah && a.surah.number === 46 && a.numberInSurah === 6);
            if (hasAyat6Ahqaf) {
                juzDataCache[26] = cached26;
                const tab26 = document.getElementById('juzTab26');
                if (tab26) tab26.dataset.ready = '1';
            } else {
                console.warn('[Juz26] Cache tidak valid, fetch ulang...');
                loadJuzTwentySix();
            }
        } else {
            loadJuzTwentySix();
        }
        if (cached27 && cached27.length > 0) {
            // Validasi: harus ada Adz-Dzariyat 31 sebagai awal Juz 27
            const hasAyat31Dzariyat = cached27.some(a => a.surah && a.surah.number === 51 && a.numberInSurah === 31);
            if (hasAyat31Dzariyat) {
                juzDataCache[27] = cached27;
                const tab27 = document.getElementById('juzTab27');
                if (tab27) tab27.dataset.ready = '1';
            } else {
                console.warn('[Juz27] Cache tidak valid, fetch ulang...');
                loadJuzTwentySeven();
            }
        } else {
            loadJuzTwentySeven();
        }
        if (cached28 && cached28.length > 0) {
            // Validasi: harus ada Al-Mujadilah 1 sebagai awal Juz 28
            const hasAyat1Mujadilah = cached28.some(a => a.surah && a.surah.number === 58 && a.numberInSurah === 1);
            if (hasAyat1Mujadilah) {
                juzDataCache[28] = cached28;
                const tab28 = document.getElementById('juzTab28');
                if (tab28) tab28.dataset.ready = '1';
            } else {
                console.warn('[Juz28] Cache tidak valid, fetch ulang...');
                loadJuzTwentyEight();
            }
        } else {
            loadJuzTwentyEight();
        }
        if (cached29 && cached29.length > 0) {
            const hasAyat1Mulk = cached29.some(a => a.surah && a.surah.number === 67 && a.numberInSurah === 1);
            if (hasAyat1Mulk) {
                juzDataCache[29] = cached29;
                const tab29 = document.getElementById('juzTab29');
                if (tab29) tab29.dataset.ready = '1';
            } else {
                console.warn('[Juz29] Cache tidak valid, fetch ulang...');
                loadJuzTwentyNine();
            }
        } else {
            loadJuzTwentyNine();
        }
        if (cached30 && cached30.length > 0) {
            const hasAyat1Naba = cached30.some(a => a.surah && a.surah.number === 78 && a.numberInSurah === 1);
            if (hasAyat1Naba) {
                juzDataCache[30] = cached30;
                const tab30 = document.getElementById('juzTab30');
                if (tab30) tab30.dataset.ready = '1';
            } else {
                console.warn('[Juz30] Cache tidak valid, fetch ulang...');
                loadJuzThirty();
            }
        } else {
            loadJuzThirty();
        }
        // If Juz 1 was from cache, we're done for offline usage
        if (cached1 && cached1.length > 0) {
            updateDashCacheStatus();
            // Still try to refresh from network in background
            if (navigator.onLine) refreshFromNetwork();
            return;
        }

        // No cache — fetch from network
        await fetchFromNetwork();
    } catch (err) {
        // Try network as fallback
        try { await fetchFromNetwork(); } catch(e2) { showLoadError(); }
    }
}

async function fetchFromNetwork() {
    const res1  = await fetchWithRetry('https://api.alquran.cloud/v1/juz/1/quran-simple');
    const data1 = await res1.json();
    juzDataCache[1] = data1.data.ayahs;
    ayahsData = juzDataCache[1];
    renderContent();
    document.getElementById('loading').style.display = 'none';
    // Save to IDB
    saveJuzToIDB(1, juzDataCache[1]).catch(() => {});
    loadJuzTwo();
    loadJuzThree();
    loadJuzFour();
    loadJuzFive();
    loadJuzSix();
    loadJuzSeven();
    loadJuzEight();
    loadJuzNine();
    loadJuzTen();
    loadJuzEleven();
    loadJuzTwelve();
    loadJuzThirteen();
    loadJuzFourteen();
    loadJuzFifteen();
    loadJuzSixteen();
    loadJuzSeventeen();
    loadJuzEighteen();
    loadJuzNineteen();
    loadJuzTwenty();
    loadJuzTwentyOne();
    loadJuzTwentyTwo();
    loadJuzTwentyThree();
    loadJuzTwentyFour();
    loadJuzTwentyFive();
    loadJuzTwentySix();
    loadJuzTwentySeven();
    loadJuzTwentyEight();
    loadJuzTwentyNine();
    loadJuzThirty();
}

async function refreshFromNetwork() {
    if (!navigator.onLine) return;
    try {
        const res1 = await fetchWithRetry('https://api.alquran.cloud/v1/juz/1/quran-simple');
        const d1   = await res1.json();
        juzDataCache[1] = d1.data.ayahs;
        saveJuzToIDB(1, juzDataCache[1]).catch(() => {});
    } catch(e) {}
    loadJuzTwo();
    loadJuzThree();
    loadJuzFour();
    loadJuzFive();
    loadJuzSix();
    loadJuzSeven();
    loadJuzEight();
    loadJuzNine();
    loadJuzTen();
    loadJuzEleven();
    loadJuzTwelve();
    loadJuzThirteen();
    loadJuzFourteen();
    loadJuzFifteen();
    loadJuzSixteen();
    loadJuzSeventeen();
    loadJuzEighteen();
    loadJuzNineteen();
    loadJuzTwenty();
    loadJuzTwentyOne();
    loadJuzTwentyTwo();
    loadJuzTwentyThree();
    loadJuzTwentyFour();
    loadJuzTwentyFive();
    loadJuzTwentySix();
    loadJuzTwentySeven();
    loadJuzTwentyEight();
    loadJuzTwentyNine();
    loadJuzThirty();
}

function showLoadError() {
    document.getElementById('loading').innerHTML = `
        <div style="text-align:center;padding:40px">
            <i class="fa-solid fa-wifi" style="font-size:48px;color:var(--text-muted);margin-bottom:16px;display:block"></i>
            <p style="font-weight:700;color:var(--text-primary)">Gagal memuat data Qur'an</p>
            <p style="font-size:13px;margin-top:6px;color:var(--text-muted)">Server data Qur'an mungkin sedang sibuk/lambat,<br>atau periksa koneksi internet Anda</p>
            <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                <button onclick="retryLoadData()" style="background: linear-gradient(135deg, var(--accent-green), var(--accent-teal));color:#000;border:none;padding:10px 24px;border-radius:50px;font-size:13px;font-weight:700;cursor:pointer">
                    <i class="fa-solid fa-rotate-right"></i> Coba Lagi
                </button>
                <button onclick="showDashboard()" style="background:transparent;color:var(--text-primary);border:1.5px solid var(--border);padding:10px 24px;border-radius:50px;font-size:13px;font-weight:700;cursor:pointer">Ke Dashboard</button>
            </div>
        </div>`;
}

let _retryingLoad = false;
function retryLoadData() {
    if (_retryingLoad) return;
    _retryingLoad = true;
    document.getElementById('loading').innerHTML = `
        <div class="loader"></div>
        <div class="loading-text">MENCOBA LAGI...</div>`;
    loadAllData().finally(() => { _retryingLoad = false; });
}

async function loadJuzTwo() {
    try {
        // Gunakan endpoint juz/2 agar field 'page' tersedia (sama seperti Juz 1)
        const res  = await fetchWithRetry('https://api.alquran.cloud/v1/juz/2/quran-simple');
        const data = await res.json();
        const allJuz2 = data.data.ayahs;
        // Juz 2 = Al-Baqarah 142–252 (filter surah 2, ayat 142-252)
        juzDataCache[2] = allJuz2.filter(a =>
            a.surah.number === 2 && a.numberInSurah >= 142 && a.numberInSurah <= 252
        );
        saveJuzToIDB(2, juzDataCache[2]).catch(() => {});
        // Tandai tab Juz 2 siap
        const tab2 = document.getElementById('juzTab2');
        if (tab2) tab2.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 2:', e);
    }
}

async function loadJuzThree() {
    try {
        // Juz 3 = Al-Baqarah 253–286 + Ali Imran 1–91
        // (Ali Imran 92 adalah awal Juz 4, sehingga dikecualikan)
        // Fetch juz/3 dari API (field 'page' tersedia)
        const res  = await fetchWithRetry('https://api.alquran.cloud/v1/juz/3/quran-simple');
        const data = await res.json();
        juzDataCache[3] = data.data.ayahs.filter(a =>
            !(a.surah.number === 3 && a.numberInSurah >= 92)
        );
        saveJuzToIDB(3, juzDataCache[3]).catch(() => {});
        // Tandai tab Juz 3 siap
        const tab3 = document.getElementById('juzTab3');
        if (tab3) tab3.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 3:', e);
    }
}

async function loadJuzFour() {
    try {
        // Juz 4 = Ali Imran 92–200 + An-Nisa 1–23
        // Fetch langsung dari endpoint surah agar ayat 92 Ali Imran pasti ikut
        const [res3, res4] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/3'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/4')
        ]);
        const [data3, data4] = await Promise.all([res3.json(), res4.json()]);

        // Endpoint /surah tidak menyertakan field 'surah' di tiap ayah.
        // Normalize agar strukturnya sama dengan hasil /juz endpoint.
        const surahMeta3 = {
            number: data3.data.number,
            name:   data3.data.name,
            englishName: data3.data.englishName,
            numberOfAyahs: data3.data.numberOfAyahs
        };
        const surahMeta4 = {
            number: data4.data.number,
            name:   data4.data.name,
            englishName: data4.data.englishName,
            numberOfAyahs: data4.data.numberOfAyahs
        };

        const aliImran = data3.data.ayahs
            .filter(a => a.numberInSurah >= 92)
            .map(a => ({ ...a, surah: surahMeta3, juz: 4 }));

        const anNisa = data4.data.ayahs
            .filter(a => a.numberInSurah <= 23)
            .map(a => ({ ...a, surah: surahMeta4, juz: 4 }));

        juzDataCache[4] = [...aliImran, ...anNisa];
        saveJuzToIDB(4, juzDataCache[4]).catch(() => {});
        const tab4 = document.getElementById('juzTab4');
        if (tab4) tab4.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 4:', e);
    }
}

async function loadJuzFive() {
    try {
        // Juz 5 = An-Nisa 24–147
        // Fetch langsung dari endpoint surah agar struktur ayah konsisten
        const res = await fetchWithRetry('https://api.alquran.cloud/v1/surah/4');
        const data = await res.json();

        const surahMeta = {
            number: data.data.number,
            name:   data.data.name,
            englishName: data.data.englishName,
            numberOfAyahs: data.data.numberOfAyahs
        };

        juzDataCache[5] = data.data.ayahs
            .filter(a => a.numberInSurah >= 24 && a.numberInSurah <= 147)
            .map(a => ({ ...a, surah: surahMeta, juz: 5 }));

        saveJuzToIDB(5, juzDataCache[5]).catch(() => {});
        const tab5 = document.getElementById('juzTab5');
        if (tab5) tab5.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 5:', e);
    }
}

async function loadJuzSix() {
    try {
        // Juz 6 = An-Nisa 148–176 + Al-Maidah 1–81
        // + overflow: Al-Maidah 82–83 (awal Juz 7, untuk konteks halaman)
        const [resNisa, resMaidah] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/4'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/5')
        ]);
        const [dataNisa, dataMaidah] = await Promise.all([resNisa.json(), resMaidah.json()]);

        const nisaMeta = {
            number: dataNisa.data.number,
            name: dataNisa.data.name,
            englishName: dataNisa.data.englishName,
            numberOfAyahs: dataNisa.data.numberOfAyahs
        };
        const maidahMeta = {
            number: dataMaidah.data.number,
            name: dataMaidah.data.name,
            englishName: dataMaidah.data.englishName,
            numberOfAyahs: dataMaidah.data.numberOfAyahs
        };

        const nisaAyahs = dataNisa.data.ayahs
            .filter(a => a.numberInSurah >= 148)
            .map(a => ({ ...a, surah: nisaMeta, juz: 6 }));

        const maidahAyahs = dataMaidah.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 81)
            .map(a => ({ ...a, surah: maidahMeta, juz: 6 }));

        // Overflow: Al-Maidah 82 ikut halaman 121 (lihat mushaf Madinah)
        const overflowAyahs = dataMaidah.data.ayahs
            .filter(a => a.numberInSurah === 82)
            .map(a => ({ ...a, surah: maidahMeta, juz: 7, _overflow: true }));

        juzDataCache[6] = [...nisaAyahs, ...maidahAyahs, ...overflowAyahs];

        saveJuzToIDB(6, juzDataCache[6]).catch(() => {});
        const tab6 = document.getElementById('juzTab6');
        if (tab6) tab6.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 6:', e);
    }
}

async function loadJuzSeven() {
    try {
        // Juz 7 = Al-Maidah 83–176 + Al-An'am 1–110
        const [resMaidah, resAnam] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/5'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/6')
        ]);
        const [dataMaidah, dataAnam] = await Promise.all([resMaidah.json(), resAnam.json()]);

        const maidahMeta = {
            number: dataMaidah.data.number,
            name: dataMaidah.data.name,
            englishName: dataMaidah.data.englishName,
            numberOfAyahs: dataMaidah.data.numberOfAyahs
        };
        const anamMeta = {
            number: dataAnam.data.number,
            name: dataAnam.data.name,
            englishName: dataAnam.data.englishName,
            numberOfAyahs: dataAnam.data.numberOfAyahs
        };

        const maidahAyahs = dataMaidah.data.ayahs
            .filter(a => a.numberInSurah >= 83)
            .map(a => ({ ...a, surah: maidahMeta, juz: 7 }));

        const anamAyahs = dataAnam.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 110)
            .map(a => ({ ...a, surah: anamMeta, juz: 7 }));

        juzDataCache[7] = [...maidahAyahs, ...anamAyahs];

        saveJuzToIDB(7, juzDataCache[7]).catch(() => {});
        const tab7 = document.getElementById('juzTab7');
        if (tab7) tab7.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 7:', e);
    }
}

async function loadJuzEight() {
    try {
        // Juz 8 = Al-An'am 111–176 + Al-A'raf 1–87
        const [resAnam, resAraf] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/6'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/7')
        ]);
        const [dataAnam, dataAraf] = await Promise.all([resAnam.json(), resAraf.json()]);

        const anamMeta = {
            number: dataAnam.data.number,
            name: dataAnam.data.name,
            englishName: dataAnam.data.englishName,
            numberOfAyahs: dataAnam.data.numberOfAyahs
        };
        const arafMeta = {
            number: dataAraf.data.number,
            name: dataAraf.data.name,
            englishName: dataAraf.data.englishName,
            numberOfAyahs: dataAraf.data.numberOfAyahs
        };

        const anamAyahs = dataAnam.data.ayahs
            .filter(a => a.numberInSurah >= 111)
            .map(a => ({ ...a, surah: anamMeta, juz: 8 }));

        const arafAyahs = dataAraf.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 87)
            .map(a => ({ ...a, surah: arafMeta, juz: 8 }));

        juzDataCache[8] = [...anamAyahs, ...arafAyahs];

        saveJuzToIDB(8, juzDataCache[8]).catch(() => {});
        const tab8 = document.getElementById('juzTab8');
        if (tab8) tab8.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 8:', e);
    }
}

async function loadJuzNine() {
    try {
        // Juz 9 = Al-A'raf 88–206 + Al-Anfal 1–40
        // Catatan: Al-A'raf 206 adalah ayat Sajdah (sujud tilawah disunnahkan)
        const [resAraf, resAnfal] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/7'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/8')
        ]);
        const [dataAraf, dataAnfal] = await Promise.all([resAraf.json(), resAnfal.json()]);

        const arafMeta = {
            number: dataAraf.data.number,
            name: dataAraf.data.name,
            englishName: dataAraf.data.englishName,
            numberOfAyahs: dataAraf.data.numberOfAyahs
        };
        const anfalmeta = {
            number: dataAnfal.data.number,
            name: dataAnfal.data.name,
            englishName: dataAnfal.data.englishName,
            numberOfAyahs: dataAnfal.data.numberOfAyahs
        };

        const arafAyahs = dataAraf.data.ayahs
            .filter(a => a.numberInSurah >= 88)
            .map(a => ({ ...a, surah: arafMeta, juz: 9 }));

        const anfaalAyahs = dataAnfal.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 40)
            .map(a => ({ ...a, surah: anfalmeta, juz: 9 }));

        juzDataCache[9] = [...arafAyahs, ...anfaalAyahs];

        saveJuzToIDB(9, juzDataCache[9]).catch(() => {});
        const tab9 = document.getElementById('juzTab9');
        if (tab9) tab9.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 9:', e);
    }
}

async function loadJuzTen() {
    try {
        // Juz 10 = Al-Anfal 41–75 + At-Taubah 1–93
        // Catatan: At-Taubah 92-93 adalah awal Juz 11 tapi ikut di halaman terakhir Juz 10
        const [resAnfal, resTaubah] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/8'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/9')
        ]);
        const [dataAnfal, dataTaubah] = await Promise.all([resAnfal.json(), resTaubah.json()]);

        const anfalmeta = {
            number: dataAnfal.data.number,
            name: dataAnfal.data.name,
            englishName: dataAnfal.data.englishName,
            numberOfAyahs: dataAnfal.data.numberOfAyahs
        };
        const taubahmeta = {
            number: dataTaubah.data.number,
            name: dataTaubah.data.name,
            englishName: dataTaubah.data.englishName,
            numberOfAyahs: dataTaubah.data.numberOfAyahs
        };

        const anfalAyahs = dataAnfal.data.ayahs
            .filter(a => a.numberInSurah >= 41)
            .map(a => ({ ...a, surah: anfalmeta, juz: 10 }));

        const taubahAyahs = dataTaubah.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 93)
            .map(a => ({ 
                ...a, 
                surah: taubahmeta, 
                juz: 10,
                _overflow: a.numberInSurah >= 92 ? true : false  // Ayat 92-93 adalah awal Juz 11 (halaman 201)
            }));

        juzDataCache[10] = [...anfalAyahs, ...taubahAyahs];

        saveJuzToIDB(10, juzDataCache[10]).catch(() => {});
        const tab10 = document.getElementById('juzTab10');
        if (tab10) tab10.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 10:', e);
    }
}

async function loadJuzEleven() {
    try {
        // Juz 11 = At-Taubah 94–129 + Yunus 1–109 + Hud 1–5
        const [resTaubah, resYunus, resHud] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/9'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/10'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/11')
        ]);
        const [dataTaubah, dataYunus, dataHud] = await Promise.all([resTaubah.json(), resYunus.json(), resHud.json()]);

        const taubahmeta = {
            number: dataTaubah.data.number,
            name: dataTaubah.data.name,
            englishName: dataTaubah.data.englishName,
            numberOfAyahs: dataTaubah.data.numberOfAyahs
        };
        const yunusmeta = {
            number: dataYunus.data.number,
            name: dataYunus.data.name,
            englishName: dataYunus.data.englishName,
            numberOfAyahs: dataYunus.data.numberOfAyahs
        };
        const hudmeta = {
            number: dataHud.data.number,
            name: dataHud.data.name,
            englishName: dataHud.data.englishName,
            numberOfAyahs: dataHud.data.numberOfAyahs
        };

        const taubahAyahs = dataTaubah.data.ayahs
            .filter(a => a.numberInSurah >= 94)
            .map(a => ({ ...a, surah: taubahmeta, juz: 11 }));

        const yunusAyahs = dataYunus.data.ayahs
            .map(a => ({ ...a, surah: yunusmeta, juz: 11 }));

        const hudAyahs = dataHud.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 5)
            .map(a => ({ ...a, surah: hudmeta, juz: 11 }));

        juzDataCache[11] = [...taubahAyahs, ...yunusAyahs, ...hudAyahs];

        saveJuzToIDB(11, juzDataCache[11]).catch(() => {});
        const tab11 = document.getElementById('juzTab11');
        if (tab11) tab11.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 11:', e);
    }
}

async function loadJuzTwelve() {
    try {
        // Juz 12 = Hud 6–123 + Yusuf 1–52
        const [resHud, resYusuf] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/11'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/12')
        ]);
        const [dataHud, dataYusuf] = await Promise.all([resHud.json(), resYusuf.json()]);

        const hudmeta = {
            number: dataHud.data.number,
            name: dataHud.data.name,
            englishName: dataHud.data.englishName,
            numberOfAyahs: dataHud.data.numberOfAyahs
        };
        const yusufmeta = {
            number: dataYusuf.data.number,
            name: dataYusuf.data.name,
            englishName: dataYusuf.data.englishName,
            numberOfAyahs: dataYusuf.data.numberOfAyahs
        };

        const hudAyahs = dataHud.data.ayahs
            .filter(a => a.numberInSurah >= 6)
            .map(a => ({ ...a, surah: hudmeta, juz: 12 }));

        const yusufAyahs = dataYusuf.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 52)
            .map(a => ({ ...a, surah: yusufmeta, juz: 12 }));

        juzDataCache[12] = [...hudAyahs, ...yusufAyahs];

        saveJuzToIDB(12, juzDataCache[12]).catch(() => {});
        const tab12 = document.getElementById('juzTab12');
        if (tab12) tab12.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 12:', e);
    }
}

async function loadJuzThirteen() {
    try {
        // Juz 13 = Yusuf 53–111 + Ar-Ra'd 1–43 + Ibrahim 1–52
        const [resYusuf, resRaad, resIbrahim] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/12'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/13'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/14')
        ]);
        const [dataYusuf, dataRaad, dataIbrahim] = await Promise.all([resYusuf.json(), resRaad.json(), resIbrahim.json()]);

        const yusufmeta = {
            number: dataYusuf.data.number,
            name: dataYusuf.data.name,
            englishName: dataYusuf.data.englishName,
            numberOfAyahs: dataYusuf.data.numberOfAyahs
        };
        const raadmeta = {
            number: dataRaad.data.number,
            name: dataRaad.data.name,
            englishName: dataRaad.data.englishName,
            numberOfAyahs: dataRaad.data.numberOfAyahs
        };
        const ibrahimmeta = {
            number: dataIbrahim.data.number,
            name: dataIbrahim.data.name,
            englishName: dataIbrahim.data.englishName,
            numberOfAyahs: dataIbrahim.data.numberOfAyahs
        };

        const yusufAyahs = dataYusuf.data.ayahs
            .filter(a => a.numberInSurah >= 53)
            .map(a => ({ ...a, surah: yusufmeta, juz: 13 }));

        const raadAyahs = dataRaad.data.ayahs
            .map(a => ({ ...a, surah: raadmeta, juz: 13 }));

        const ibrahimAyahs = dataIbrahim.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 52)
            .map(a => ({ ...a, surah: ibrahimmeta, juz: 13 }));

        juzDataCache[13] = [...yusufAyahs, ...raadAyahs, ...ibrahimAyahs];

        saveJuzToIDB(13, juzDataCache[13]).catch(() => {});
        const tab13 = document.getElementById('juzTab13');
        if (tab13) tab13.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 13:', e);
    }
}

async function loadJuzFourteen() {
    try {
        // Juz 14 = Al-Hijr 1–99 (penuh) + An-Nahl 1–128 (penuh)
        const [resHijr, resNahl] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/15'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/16')
        ]);
        const [dataHijr, dataNahl] = await Promise.all([resHijr.json(), resNahl.json()]);

        const hijrmeta = {
            number: dataHijr.data.number,
            name: dataHijr.data.name,
            englishName: dataHijr.data.englishName,
            numberOfAyahs: dataHijr.data.numberOfAyahs
        };
        const nahlmeta = {
            number: dataNahl.data.number,
            name: dataNahl.data.name,
            englishName: dataNahl.data.englishName,
            numberOfAyahs: dataNahl.data.numberOfAyahs
        };

        const hijrAyahs = dataHijr.data.ayahs
            .map(a => ({ ...a, surah: hijrmeta, juz: 14 }));

        const nahlAyahs = dataNahl.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 128)
            .map(a => ({ ...a, surah: nahlmeta, juz: 14 }));

        juzDataCache[14] = [...hijrAyahs, ...nahlAyahs];

        saveJuzToIDB(14, juzDataCache[14]).catch(() => {});
        const tab14 = document.getElementById('juzTab14');
        if (tab14) tab14.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 14:', e);
    }
}


async function loadJuzFifteen() {
    try {
        // Juz 15 = Al-Isra' 1–111 (penuh) + Al-Kahfi 1–74
        const [resIsra, resKahfi] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/17'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/18')
        ]);
        const [dataIsra, dataKahfi] = await Promise.all([resIsra.json(), resKahfi.json()]);

        const isrameta = {
            number: dataIsra.data.number,
            name: dataIsra.data.name,
            englishName: dataIsra.data.englishName,
            numberOfAyahs: dataIsra.data.numberOfAyahs
        };
        const kahfimeta = {
            number: dataKahfi.data.number,
            name: dataKahfi.data.name,
            englishName: dataKahfi.data.englishName,
            numberOfAyahs: dataKahfi.data.numberOfAyahs
        };

        const israAyahs = dataIsra.data.ayahs
            .map(a => ({ ...a, surah: isrameta, juz: 15 }));

        const kahfiAyahs = dataKahfi.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 74)
            .map(a => ({ ...a, surah: kahfimeta, juz: 15 }));

        juzDataCache[15] = [...israAyahs, ...kahfiAyahs];

        saveJuzToIDB(15, juzDataCache[15]).catch(() => {});
        const tab15 = document.getElementById('juzTab15');
        if (tab15) tab15.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 15:', e);
    }
}

async function loadJuzSixteen() {
    try {
        // Juz 16 = Al-Kahfi 75–110 + Maryam 1–98 (penuh) + Taha 1–135
        const [resKahfi, resMaryam, resTaha] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/18'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/19'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/20')
        ]);
        const [dataKahfi, dataMaryam, dataTaha] = await Promise.all([resKahfi.json(), resMaryam.json(), resTaha.json()]);

        const kahfimeta = {
            number: dataKahfi.data.number, name: dataKahfi.data.name,
            englishName: dataKahfi.data.englishName, numberOfAyahs: dataKahfi.data.numberOfAyahs
        };
        const maryammeta = {
            number: dataMaryam.data.number, name: dataMaryam.data.name,
            englishName: dataMaryam.data.englishName, numberOfAyahs: dataMaryam.data.numberOfAyahs
        };
        const tahameta = {
            number: dataTaha.data.number, name: dataTaha.data.name,
            englishName: dataTaha.data.englishName, numberOfAyahs: dataTaha.data.numberOfAyahs
        };

        const kahfiAyahs = dataKahfi.data.ayahs
            .filter(a => a.numberInSurah >= 75 && a.numberInSurah <= 110)
            .map(a => ({ ...a, surah: kahfimeta, juz: 16 }));
        const maryamAyahs = dataMaryam.data.ayahs
            .map(a => ({ ...a, surah: maryammeta, juz: 16 }));
        const tahaAyahs = dataTaha.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 135)
            .map(a => ({ ...a, surah: tahameta, juz: 16 }));

        juzDataCache[16] = [...kahfiAyahs, ...maryamAyahs, ...tahaAyahs];
        saveJuzToIDB(16, juzDataCache[16]).catch(() => {});
        const tab16 = document.getElementById('juzTab16');
        if (tab16) tab16.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 16:', e);
    }
}


async function loadJuzSeventeen() {
    try {
        // Juz 17 = Al-Anbiya 1–112 (penuh) + Al-Hajj 1–78
        const [resAnbiya, resHajj] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/21'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/22')
        ]);
        const [dataAnbiya, dataHajj] = await Promise.all([resAnbiya.json(), resHajj.json()]);

        const anbiyameta = {
            number: dataAnbiya.data.number, name: dataAnbiya.data.name,
            englishName: dataAnbiya.data.englishName, numberOfAyahs: dataAnbiya.data.numberOfAyahs
        };
        const hajjmeta = {
            number: dataHajj.data.number, name: dataHajj.data.name,
            englishName: dataHajj.data.englishName, numberOfAyahs: dataHajj.data.numberOfAyahs
        };

        const anbiyaAyahs = dataAnbiya.data.ayahs
            .map(a => ({ ...a, surah: anbiyameta, juz: 17 }));
        const hajjAyahs = dataHajj.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 78)
            .map(a => ({ ...a, surah: hajjmeta, juz: 17 }));

        juzDataCache[17] = [...anbiyaAyahs, ...hajjAyahs];
        saveJuzToIDB(17, juzDataCache[17]).catch(() => {});
        const tab17 = document.getElementById('juzTab17');
        if (tab17) tab17.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 17:', e);
    }
}


async function loadJuzEighteen() {
    try {
        // Juz 18 = Al-Mu'minun 1–118 (penuh) + An-Nur 1–64 (penuh) + Al-Furqan 1–20
        const [resMuminun, resNur, resFurqan] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/23'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/24'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/25')
        ]);
        const [dataMuminun, dataNur, dataFurqan] = await Promise.all([resMuminun.json(), resNur.json(), resFurqan.json()]);

        const muminunmeta = {
            number: dataMuminun.data.number, name: dataMuminun.data.name,
            englishName: dataMuminun.data.englishName, numberOfAyahs: dataMuminun.data.numberOfAyahs
        };
        const nurmeta = {
            number: dataNur.data.number, name: dataNur.data.name,
            englishName: dataNur.data.englishName, numberOfAyahs: dataNur.data.numberOfAyahs
        };
        const furqanmeta = {
            number: dataFurqan.data.number, name: dataFurqan.data.name,
            englishName: dataFurqan.data.englishName, numberOfAyahs: dataFurqan.data.numberOfAyahs
        };

        const muminunAyahs = dataMuminun.data.ayahs
            .map(a => ({ ...a, surah: muminunmeta, juz: 18 }));
        const nurAyahs = dataNur.data.ayahs
            .map(a => ({ ...a, surah: nurmeta, juz: 18 }));
        const furqanAyahs = dataFurqan.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 20)
            .map(a => ({ ...a, surah: furqanmeta, juz: 18 }));

        juzDataCache[18] = [...muminunAyahs, ...nurAyahs, ...furqanAyahs];
        saveJuzToIDB(18, juzDataCache[18]).catch(() => {});
        const tab18 = document.getElementById('juzTab18');
        if (tab18) tab18.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 18:', e);
    }
}


async function loadJuzNineteen() {
    try {
        // Juz 19 = Al-Furqan 21–77 + Asy-Syu'ara 1–227 (penuh) + An-Naml 1–55
        const [resFurqan, resSyuara, resNaml] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/25'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/26'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/27')
        ]);
        const [dataFurqan, dataSyuara, dataNaml] = await Promise.all([resFurqan.json(), resSyuara.json(), resNaml.json()]);

        const furqanmeta = {
            number: dataFurqan.data.number, name: dataFurqan.data.name,
            englishName: dataFurqan.data.englishName, numberOfAyahs: dataFurqan.data.numberOfAyahs
        };
        const syuarameta = {
            number: dataSyuara.data.number, name: dataSyuara.data.name,
            englishName: dataSyuara.data.englishName, numberOfAyahs: dataSyuara.data.numberOfAyahs
        };
        const namlmeta = {
            number: dataNaml.data.number, name: dataNaml.data.name,
            englishName: dataNaml.data.englishName, numberOfAyahs: dataNaml.data.numberOfAyahs
        };

        const furqanAyahs = dataFurqan.data.ayahs
            .filter(a => a.numberInSurah >= 21 && a.numberInSurah <= 77)
            .map(a => ({ ...a, surah: furqanmeta, juz: 19 }));
        const syuaraAyahs = dataSyuara.data.ayahs
            .map(a => ({ ...a, surah: syuarameta, juz: 19 }));
        const namlAyahs = dataNaml.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 55)
            .map(a => ({ ...a, surah: namlmeta, juz: 19 }));

        juzDataCache[19] = [...furqanAyahs, ...syuaraAyahs, ...namlAyahs];
        saveJuzToIDB(19, juzDataCache[19]).catch(() => {});
        const tab19 = document.getElementById('juzTab19');
        if (tab19) tab19.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 19:', e);
    }
}


async function loadJuzTwenty() {
    try {
        // Juz 20 = An-Naml 56–93 + Al-Qasas 1–88 (penuh) + Al-Ankabut 1–45
        const [resNaml, resQasas, resAnkabut] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/27'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/28'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/29')
        ]);
        const [dataNaml, dataQasas, dataAnkabut] = await Promise.all([resNaml.json(), resQasas.json(), resAnkabut.json()]);

        const namlmeta = {
            number: dataNaml.data.number, name: dataNaml.data.name,
            englishName: dataNaml.data.englishName, numberOfAyahs: dataNaml.data.numberOfAyahs
        };
        const qasasmeta = {
            number: dataQasas.data.number, name: dataQasas.data.name,
            englishName: dataQasas.data.englishName, numberOfAyahs: dataQasas.data.numberOfAyahs
        };
        const ankabutmeta = {
            number: dataAnkabut.data.number, name: dataAnkabut.data.name,
            englishName: dataAnkabut.data.englishName, numberOfAyahs: dataAnkabut.data.numberOfAyahs
        };

        const namlAyahs = dataNaml.data.ayahs
            .filter(a => a.numberInSurah >= 56 && a.numberInSurah <= 93)
            .map(a => ({ ...a, surah: namlmeta, juz: 20 }));
        const qasasAyahs = dataQasas.data.ayahs
            .map(a => ({ ...a, surah: qasasmeta, juz: 20 }));
        const ankabutAyahs = dataAnkabut.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 45)
            .map(a => ({ ...a, surah: ankabutmeta, juz: 20 }));

        juzDataCache[20] = [...namlAyahs, ...qasasAyahs, ...ankabutAyahs];
        saveJuzToIDB(20, juzDataCache[20]).catch(() => {});
        const tab20 = document.getElementById('juzTab20');
        if (tab20) tab20.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 20:', e);
    }
}

async function loadJuzTwentyOne() {
    try {
        // Juz 21 = Al-Ankabut 46–69 + Ar-Rum 1–60 (penuh) + Luqman 1–34 (penuh) + As-Sajdah 1–30 (penuh) + Al-Ahzab 1–30
        const [resAnkabut, resRum, resLuqman, resSajdah, resAhzab] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/29'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/30'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/31'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/32'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/33')
        ]);
        const [dataAnkabut, dataRum, dataLuqman, dataSajdah, dataAhzab] = await Promise.all([
            resAnkabut.json(), resRum.json(), resLuqman.json(), resSajdah.json(), resAhzab.json()
        ]);

        const mkMeta = d => ({ number: d.data.number, name: d.data.name, englishName: d.data.englishName, numberOfAyahs: d.data.numberOfAyahs, revelationType: d.data.revelationType });
        const ankabutMeta = mkMeta(dataAnkabut);
        const rumMeta     = mkMeta(dataRum);
        const luqmanMeta  = mkMeta(dataLuqman);
        const sajdahMeta  = mkMeta(dataSajdah);
        const ahzabMeta   = mkMeta(dataAhzab);

        const ankabutAyahs = dataAnkabut.data.ayahs
            .filter(a => a.numberInSurah >= 46)
            .map(a => ({ ...a, surah: ankabutMeta, juz: 21 }));
        const rumAyahs = dataRum.data.ayahs
            .map(a => ({ ...a, surah: rumMeta, juz: 21 }));
        const luqmanAyahs = dataLuqman.data.ayahs
            .map(a => ({ ...a, surah: luqmanMeta, juz: 21 }));
        const sajdahAyahs = dataSajdah.data.ayahs
            .map(a => ({ ...a, surah: sajdahMeta, juz: 21 }));
        const ahzabAyahs = dataAhzab.data.ayahs
            .filter(a => a.numberInSurah <= 30)
            .map(a => ({ ...a, surah: ahzabMeta, juz: 21 }));

        juzDataCache[21] = [...ankabutAyahs, ...rumAyahs, ...luqmanAyahs, ...sajdahAyahs, ...ahzabAyahs];
        saveJuzToIDB(21, juzDataCache[21]).catch(() => {});
        const tab21 = document.getElementById('juzTab21');
        if (tab21) tab21.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 21:', e);
    }
}

async function loadJuzTwentyTwo() {
    try {
        // Juz 22 = Al-Ahzab 31–73 + Saba' 1–54 (penuh) + Fatir 1–45 (penuh) + Yasin 1–27
        const [resAhzab, resSaba, resFatir, resYasin] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/33'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/34'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/35'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/36')
        ]);
        const [dataAhzab, dataSaba, dataFatir, dataYasin] = await Promise.all([
            resAhzab.json(), resSaba.json(), resFatir.json(), resYasin.json()
        ]);

        const mkMeta = d => ({ number: d.data.number, name: d.data.name, englishName: d.data.englishName, numberOfAyahs: d.data.numberOfAyahs, revelationType: d.data.revelationType });
        const ahzabMeta = mkMeta(dataAhzab);
        const sabaMeta  = mkMeta(dataSaba);
        const fatirMeta = mkMeta(dataFatir);
        const yasinMeta = mkMeta(dataYasin);

        const ahzabAyahs = dataAhzab.data.ayahs
            .filter(a => a.numberInSurah >= 31)
            .map(a => ({ ...a, surah: ahzabMeta, juz: 22 }));
        const sabaAyahs = dataSaba.data.ayahs
            .map(a => ({ ...a, surah: sabaMeta, juz: 22 }));
        const fatirAyahs = dataFatir.data.ayahs
            .map(a => ({ ...a, surah: fatirMeta, juz: 22 }));
        const yasinAyahs = dataYasin.data.ayahs
            .filter(a => a.numberInSurah <= 27)
            .map(a => ({ ...a, surah: yasinMeta, juz: 22 }));

        juzDataCache[22] = [...ahzabAyahs, ...sabaAyahs, ...fatirAyahs, ...yasinAyahs];
        saveJuzToIDB(22, juzDataCache[22]).catch(() => {});
        const tab22 = document.getElementById('juzTab22');
        if (tab22) tab22.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 22:', e);
    }
}

async function loadJuzTwentyThree() {
    try {
        // Juz 23 = Yasin 28–83 + As-Saffat 1–182 (penuh) + Sad 1–88 (penuh) + Az-Zumar 1–31
        const [resYasin, resSaffat, resSad, resZumar] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/36'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/37'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/38'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/39')
        ]);
        const [dataYasin, dataSaffat, dataSad, dataZumar] = await Promise.all([
            resYasin.json(), resSaffat.json(), resSad.json(), resZumar.json()
        ]);

        const mkMeta = d => ({ number: d.data.number, name: d.data.name, englishName: d.data.englishName, numberOfAyahs: d.data.numberOfAyahs, revelationType: d.data.revelationType });
        const yasinMeta  = mkMeta(dataYasin);
        const saffatMeta = mkMeta(dataSaffat);
        const sadMeta    = mkMeta(dataSad);
        const zumarMeta  = mkMeta(dataZumar);

        const yasinAyahs = dataYasin.data.ayahs
            .filter(a => a.numberInSurah >= 28)
            .map(a => ({ ...a, surah: yasinMeta, juz: 23 }));
        const saffatAyahs = dataSaffat.data.ayahs
            .map(a => ({ ...a, surah: saffatMeta, juz: 23 }));
        const sadAyahs = dataSad.data.ayahs
            .map(a => ({ ...a, surah: sadMeta, juz: 23 }));
        const zumarAyahs = dataZumar.data.ayahs
            .filter(a => a.numberInSurah <= 31)
            .map(a => ({ ...a, surah: zumarMeta, juz: 23 }));

        juzDataCache[23] = [...yasinAyahs, ...saffatAyahs, ...sadAyahs, ...zumarAyahs];
        saveJuzToIDB(23, juzDataCache[23]).catch(() => {});
        const tab23 = document.getElementById('juzTab23');
        if (tab23) tab23.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 23:', e);
    }
}

async function loadJuzTwentyFour() {
    try {
        // Juz 24 = Az-Zumar 32–75 + Ghafir 1–85 (penuh) + Fussilat 1–46
        const [resZumar, resGhafir, resFussilat] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/39'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/40'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/41')
        ]);
        const [dataZumar, dataGhafir, dataFussilat] = await Promise.all([
            resZumar.json(), resGhafir.json(), resFussilat.json()
        ]);

        const mkMeta = d => ({ number: d.data.number, name: d.data.name, englishName: d.data.englishName, numberOfAyahs: d.data.numberOfAyahs, revelationType: d.data.revelationType });
        const zumarMeta   = mkMeta(dataZumar);
        const ghafirMeta  = mkMeta(dataGhafir);
        const fussilatMeta = mkMeta(dataFussilat);

        const zumarAyahs = dataZumar.data.ayahs
            .filter(a => a.numberInSurah >= 32)
            .map(a => ({ ...a, surah: zumarMeta, juz: 24 }));
        const ghafirAyahs = dataGhafir.data.ayahs
            .map(a => ({ ...a, surah: ghafirMeta, juz: 24 }));
        const fussilatAyahs = dataFussilat.data.ayahs
            .filter(a => a.numberInSurah <= 46)
            .map(a => ({ ...a, surah: fussilatMeta, juz: 24 }));

        juzDataCache[24] = [...zumarAyahs, ...ghafirAyahs, ...fussilatAyahs];
        saveJuzToIDB(24, juzDataCache[24]).catch(() => {});
        const tab24 = document.getElementById('juzTab24');
        if (tab24) tab24.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 24:', e);
    }
}


async function loadJuzTwentyFive() {
    try {
        // Juz 25 = Fussilat 47–54 + Az-Zukhruf 1–89 (penuh) + Ad-Dukhan 1–59 (penuh) + Al-Jatsiyah 1–37 (penuh)
        // + Al-Ahqaf 1–5 (_overflow juz 26, diikutkan agar halaman rapi)
        const [resFussilat, resZukhruf, resDukhan, resJatsiyah, resAhqaf] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/41'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/43'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/44'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/45'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/46')
        ]);
        const [dataFussilat, dataZukhruf, dataDukhan, dataJatsiyah, dataAhqaf] = await Promise.all([
            resFussilat.json(), resZukhruf.json(), resDukhan.json(), resJatsiyah.json(), resAhqaf.json()
        ]);

        const mkMeta = d => ({ number: d.data.number, name: d.data.name, englishName: d.data.englishName, numberOfAyahs: d.data.numberOfAyahs, revelationType: d.data.revelationType });
        const fussilatMeta  = mkMeta(dataFussilat);
        const zukhrufMeta   = mkMeta(dataZukhruf);
        const dukhanMeta    = mkMeta(dataDukhan);
        const jatsiyahMeta  = mkMeta(dataJatsiyah);
        const ahqafMeta     = mkMeta(dataAhqaf);

        // Fussilat 47–54 (sisa dari Juz 24 yang berakhir di ayat 46)
        const fussilatAyahs = dataFussilat.data.ayahs
            .filter(a => a.numberInSurah >= 47)
            .map(a => ({ ...a, surah: fussilatMeta, juz: 25 }));

        // Az-Zukhruf seluruhnya (89 ayat) — Surah 43
        const zukhrufAyahs = dataZukhruf.data.ayahs
            .map(a => ({ ...a, surah: zukhrufMeta, juz: 25 }));

        // Ad-Dukhan seluruhnya (59 ayat) — Surah 44
        const dukhanAyahs = dataDukhan.data.ayahs
            .map(a => ({ ...a, surah: dukhanMeta, juz: 25 }));

        // Al-Jatsiyah seluruhnya (37 ayat) — Surah 45
        const jatsiyahAyahs = dataJatsiyah.data.ayahs
            .map(a => ({ ...a, surah: jatsiyahMeta, juz: 25 }));

        // Al-Ahqaf 1–5 — masuk Juz 26, tapi diikutkan agar halaman rapi (ditandai _overflow & _juz26)
        const ahqafOverflow = dataAhqaf.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 5)
            .map(a => ({ ...a, surah: ahqafMeta, juz: 26, _overflow: true, _juz26: true }));

        juzDataCache[25] = [...fussilatAyahs, ...zukhrufAyahs, ...dukhanAyahs, ...jatsiyahAyahs, ...ahqafOverflow];
        saveJuzToIDB(25, juzDataCache[25]).catch(() => {});
        const tab25 = document.getElementById('juzTab25');
        if (tab25) tab25.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 25:', e);
    }
}

async function loadJuzTwentySix() {
    try {
        // Juz 26 = Al-Ahqaf 6–35 + Muhammad 1–38 (penuh) + Al-Fath 1–29 (penuh)
        // + Al-Hujurat 1–18 (penuh) + Qaf 1–45 (penuh) + Adz-Dzariyat 1–30
        const [resAhqaf, resMuhammad, resFath, resHujurat, resQaf, resDzariyat] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/46'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/47'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/48'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/49'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/50'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/51')
        ]);
        const [dataAhqaf, dataMuhammad, dataFath, dataHujurat, dataQaf, dataDzariyat] = await Promise.all([
            resAhqaf.json(), resMuhammad.json(), resFath.json(), resHujurat.json(), resQaf.json(), resDzariyat.json()
        ]);

        const mkMeta = d => ({ number: d.data.number, name: d.data.name, englishName: d.data.englishName, numberOfAyahs: d.data.numberOfAyahs, revelationType: d.data.revelationType });
        const ahqafMeta     = mkMeta(dataAhqaf);
        const muhammadMeta  = mkMeta(dataMuhammad);
        const fathMeta      = mkMeta(dataFath);
        const hujuratMeta   = mkMeta(dataHujurat);
        const qafMeta       = mkMeta(dataQaf);
        const dzariyatMeta  = mkMeta(dataDzariyat);

        // Al-Ahqaf 6–35 (ayat 1–5 sudah ada di Juz 25 sebagai overflow)
        const ahqafAyahs = dataAhqaf.data.ayahs
            .filter(a => a.numberInSurah >= 6)
            .map(a => ({ ...a, surah: ahqafMeta, juz: 26 }));

        // Muhammad seluruhnya (38 ayat) — Surah 47
        const muhammadAyahs = dataMuhammad.data.ayahs
            .map(a => ({ ...a, surah: muhammadMeta, juz: 26 }));

        // Al-Fath seluruhnya (29 ayat) — Surah 48
        const fathAyahs = dataFath.data.ayahs
            .map(a => ({ ...a, surah: fathMeta, juz: 26 }));

        // Al-Hujurat seluruhnya (18 ayat) — Surah 49
        const hujuratAyahs = dataHujurat.data.ayahs
            .map(a => ({ ...a, surah: hujuratMeta, juz: 26 }));

        // Qaf seluruhnya (45 ayat) — Surah 50
        const qafAyahs = dataQaf.data.ayahs
            .map(a => ({ ...a, surah: qafMeta, juz: 26 }));

        // Adz-Dzariyat 1–30 (ayat 31 dst masuk Juz 27)
        const dzariyatAyahs = dataDzariyat.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 30)
            .map(a => ({ ...a, surah: dzariyatMeta, juz: 26 }));

        juzDataCache[26] = [...ahqafAyahs, ...muhammadAyahs, ...fathAyahs, ...hujuratAyahs, ...qafAyahs, ...dzariyatAyahs];
        saveJuzToIDB(26, juzDataCache[26]).catch(() => {});
        const tab26 = document.getElementById('juzTab26');
        if (tab26) tab26.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 26:', e);
    }
}

async function loadJuzTwentySeven() {
    try {
        // Juz 27 = Adz-Dzariyat 31–60 + At-Tur 1–49 (penuh) + An-Najm 1–62 (penuh)
        // + Al-Qamar 1–55 (penuh) + Ar-Rahman 1–78 (penuh) + Al-Waqi'ah 1–96 (penuh)
        // + Al-Hadid 1–29
        const [resDzariyat, resTur, resNajm, resQamar, resRahman, resWaqiah, resHadid] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/51'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/52'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/53'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/54'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/55'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/56'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/57')
        ]);
        const [dataDzariyat, dataTur, dataNajm, dataQamar, dataRahman, dataWaqiah, dataHadid] = await Promise.all([
            resDzariyat.json(), resTur.json(), resNajm.json(), resQamar.json(), resRahman.json(), resWaqiah.json(), resHadid.json()
        ]);

        const mkMeta = d => ({ number: d.data.number, name: d.data.name, englishName: d.data.englishName, numberOfAyahs: d.data.numberOfAyahs, revelationType: d.data.revelationType });
        const dzariyatMeta = mkMeta(dataDzariyat);
        const turMeta      = mkMeta(dataTur);
        const najmMeta     = mkMeta(dataNajm);
        const qamarMeta    = mkMeta(dataQamar);
        const rahmanMeta   = mkMeta(dataRahman);
        const waqiahMeta   = mkMeta(dataWaqiah);
        const hadidMeta    = mkMeta(dataHadid);

        // Adz-Dzariyat 31–60 (ayat 1–30 sudah ada di Juz 26)
        const dzariyatAyahs = dataDzariyat.data.ayahs
            .filter(a => a.numberInSurah >= 31)
            .map(a => ({ ...a, surah: dzariyatMeta, juz: 27 }));

        // At-Tur seluruhnya (49 ayat) — Surah 52
        const turAyahs = dataTur.data.ayahs
            .map(a => ({ ...a, surah: turMeta, juz: 27 }));

        // An-Najm seluruhnya (62 ayat) — Surah 53
        const najmAyahs = dataNajm.data.ayahs
            .map(a => ({ ...a, surah: najmMeta, juz: 27 }));

        // Al-Qamar seluruhnya (55 ayat) — Surah 54
        const qamarAyahs = dataQamar.data.ayahs
            .map(a => ({ ...a, surah: qamarMeta, juz: 27 }));

        // Ar-Rahman seluruhnya (78 ayat) — Surah 55
        const rahmanAyahs = dataRahman.data.ayahs
            .map(a => ({ ...a, surah: rahmanMeta, juz: 27 }));

        // Al-Waqi'ah seluruhnya (96 ayat) — Surah 56
        const waqiahAyahs = dataWaqiah.data.ayahs
            .map(a => ({ ...a, surah: waqiahMeta, juz: 27 }));

        // Al-Hadid 1–29 (ayat 30 dst masuk Juz 28 — Al-Hadid hanya 29 ayat, jadi penuh)
        const hadidAyahs = dataHadid.data.ayahs
            .filter(a => a.numberInSurah >= 1 && a.numberInSurah <= 29)
            .map(a => ({ ...a, surah: hadidMeta, juz: 27 }));

        juzDataCache[27] = [...dzariyatAyahs, ...turAyahs, ...najmAyahs, ...qamarAyahs, ...rahmanAyahs, ...waqiahAyahs, ...hadidAyahs];
        saveJuzToIDB(27, juzDataCache[27]).catch(() => {});
        const tab27 = document.getElementById('juzTab27');
        if (tab27) tab27.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 27:', e);
    }
}

async function loadJuzTwentyEight() {
    try {
        // Juz 28 = Al-Mujadilah 1–22 + Al-Hasyr 1–24 + Al-Mumtahanah 1–13
        // + As-Saff 1–14 + Al-Jumu'ah 1–11 + Al-Munafiqun 1–11
        // + At-Taghabun 1–18 + At-Talaq 1–12 + At-Tahrim 1–12
        const [resMujadilah, resHasyr, resMumtahanah, resSaff, resJumuah, resMunafiqun, resTaghabun, resTalaq, resTahrim] = await Promise.all([
            fetchWithRetry('https://api.alquran.cloud/v1/surah/58'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/59'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/60'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/61'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/62'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/63'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/64'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/65'),
            fetchWithRetry('https://api.alquran.cloud/v1/surah/66')
        ]);
        const [dataMujadilah, dataHasyr, dataMumtahanah, dataSaff, dataJumuah, dataMunafiqun, dataTaghabun, dataTalaq, dataTahrim] = await Promise.all([
            resMujadilah.json(), resHasyr.json(), resMumtahanah.json(), resSaff.json(),
            resJumuah.json(), resMunafiqun.json(), resTaghabun.json(), resTalaq.json(), resTahrim.json()
        ]);

        const mkMeta = d => ({ number: d.data.number, name: d.data.name, englishName: d.data.englishName, numberOfAyahs: d.data.numberOfAyahs, revelationType: d.data.revelationType });
        const mujadilahMeta  = mkMeta(dataMujadilah);
        const hasyrMeta      = mkMeta(dataHasyr);
        const mumtahanahMeta = mkMeta(dataMumtahanah);
        const saffMeta       = mkMeta(dataSaff);
        const jumuahMeta     = mkMeta(dataJumuah);
        const munafiqunMeta  = mkMeta(dataMunafiqun);
        const taghabunMeta   = mkMeta(dataTaghabun);
        const talaqMeta      = mkMeta(dataTalaq);
        const tahrimMeta     = mkMeta(dataTahrim);

        // Al-Mujadilah seluruhnya (22 ayat) — Surah 58
        const mujadilahAyahs = dataMujadilah.data.ayahs
            .map(a => ({ ...a, surah: mujadilahMeta, juz: 28 }));

        // Al-Hasyr seluruhnya (24 ayat) — Surah 59
        const hasyrAyahs = dataHasyr.data.ayahs
            .map(a => ({ ...a, surah: hasyrMeta, juz: 28 }));

        // Al-Mumtahanah seluruhnya (13 ayat) — Surah 60
        const mumtahanahAyahs = dataMumtahanah.data.ayahs
            .map(a => ({ ...a, surah: mumtahanahMeta, juz: 28 }));

        // As-Saff seluruhnya (14 ayat) — Surah 61
        const saffAyahs = dataSaff.data.ayahs
            .map(a => ({ ...a, surah: saffMeta, juz: 28 }));

        // Al-Jumu'ah seluruhnya (11 ayat) — Surah 62
        const jumuahAyahs = dataJumuah.data.ayahs
            .map(a => ({ ...a, surah: jumuahMeta, juz: 28 }));

        // Al-Munafiqun seluruhnya (11 ayat) — Surah 63
        const munafiqunAyahs = dataMunafiqun.data.ayahs
            .map(a => ({ ...a, surah: munafiqunMeta, juz: 28 }));

        // At-Taghabun seluruhnya (18 ayat) — Surah 64
        const taghabunAyahs = dataTaghabun.data.ayahs
            .map(a => ({ ...a, surah: taghabunMeta, juz: 28 }));

        // At-Talaq seluruhnya (12 ayat) — Surah 65
        const talaqAyahs = dataTalaq.data.ayahs
            .map(a => ({ ...a, surah: talaqMeta, juz: 28 }));

        // At-Tahrim seluruhnya (12 ayat) — Surah 66
        const tahrimAyahs = dataTahrim.data.ayahs
            .map(a => ({ ...a, surah: tahrimMeta, juz: 28 }));

        juzDataCache[28] = [
            ...mujadilahAyahs, ...hasyrAyahs, ...mumtahanahAyahs, ...saffAyahs,
            ...jumuahAyahs, ...munafiqunAyahs, ...taghabunAyahs, ...talaqAyahs, ...tahrimAyahs
        ];
        saveJuzToIDB(28, juzDataCache[28]).catch(() => {});
        const tab28 = document.getElementById('juzTab28');
        if (tab28) tab28.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 28:', e);
    }
}

async function loadJuzTwentyNine() {
    try {
        // Juz 29 = Al-Mulk s.d. Al-Mursalat (surah 67–77) — gunakan endpoint /juz/29
        const res = await fetchWithRetry('https://api.alquran.cloud/v1/juz/29/quran-simple');
        const data = await res.json();
        if (!data.data || !data.data.ayahs) throw new Error('Data tidak valid');
        const surahMetaMap = {};
        data.data.ayahs.forEach(a => {
            if (!surahMetaMap[a.surah.number]) {
                surahMetaMap[a.surah.number] = {
                    number: a.surah.number,
                    name: a.surah.name,
                    englishName: a.surah.englishName,
                    numberOfAyahs: a.surah.numberOfAyahs,
                    revelationType: a.surah.revelationType
                };
            }
        });
        const ayahs = data.data.ayahs.map(a => ({
            ...a,
            surah: surahMetaMap[a.surah.number],
            juz: 29
        }));
        juzDataCache[29] = ayahs;
        saveJuzToIDB(29, juzDataCache[29]).catch(() => {});
        const tab29 = document.getElementById('juzTab29');
        if (tab29) tab29.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 29:', e);
    }
}

async function loadJuzThirty() {
    try {
        // Juz 30 = An-Naba s.d. An-Nas (surah 78–114) — gunakan endpoint /juz/30 agar 1 request
        const res = await fetchWithRetry('https://api.alquran.cloud/v1/juz/30/quran-simple');
        const data = await res.json();
        if (!data.data || !data.data.ayahs) throw new Error('Data tidak valid');
        // Bangun surahMeta dari field surah yang sudah ada di tiap ayat
        const surahMetaMap = {};
        data.data.ayahs.forEach(a => {
            if (!surahMetaMap[a.surah.number]) {
                surahMetaMap[a.surah.number] = {
                    number: a.surah.number,
                    name: a.surah.name,
                    englishName: a.surah.englishName,
                    numberOfAyahs: a.surah.numberOfAyahs,
                    revelationType: a.surah.revelationType
                };
            }
        });
        const ayahs = data.data.ayahs.map(a => ({
            ...a,
            surah: surahMetaMap[a.surah.number],
            juz: 30
        }));
        juzDataCache[30] = ayahs;
        saveJuzToIDB(30, juzDataCache[30]).catch(() => {});
        const tab30 = document.getElementById('juzTab30');
        if (tab30) tab30.dataset.ready = '1';
    } catch(e) {
        console.warn('Gagal memuat Juz 30:', e);
    }
}

function switchJuz(juz) {
    if (juz === activeJuz) return;

    // Juz belum siap?
    if (!juzDataCache[juz]) {
        showToast(`⏳ Juz ${juz} sedang dimuat...`);
        const check = setInterval(() => {
            if (juzDataCache[juz]) {
                clearInterval(check);
                switchJuz(juz);
            }
        }, 500);
        return;
    }

    // Stop audio & reset state
    stopAudio();
    currentPlayIndex = 0;
    tasmiStartIndex  = 0;

    activeJuz = juz;
    ayahsData = juzDataCache[juz] || [];

    // Update tab UI
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].forEach(j => {
        const tab = document.getElementById(`juzTab${j}`);
        if (tab) tab.classList.toggle('active', j === juz);
    });

    // Reset render cache agar re-render
    const dig = document.getElementById('digitalView');
    const mus = document.getElementById('mushafView');
    delete dig.dataset.rendered;
    delete mus.dataset.rendered;
    dig.innerHTML = '';
    mus.innerHTML = '';
    ayahElementMap = {};

    // Update topbar surah name
    const surahNames = {
        1: 'الْفَاتِحَة',
        2: 'الْبَقَرَة',
        3: 'الْبَقَرَة — آل عِمْرَان',
        4: 'آل عِمْرَان — النِّسَاء',
        5: 'النِّسَاء',
        6: 'النِّسَاء — الْمَائِدَة',
        7: 'الْمَائِدَة — الْأَنْعَام',
        8: 'الْأَنْعَام — الْأَعْرَاف',
        9: 'الْأَعْرَاف — الْأَنْفَال',
        10: 'الْأَنْفَال — التَّوْبَة',
        11: 'التَّوْبَة — يُونُس — هُود',
        12: 'هُود — يُوسُف',
        13: 'يُوسُف — الرَّعْد — إِبْرَاهِيم',
        14: 'الْحِجْر — النَّحْل',
        15: 'الْإِسْرَاء — الْكَهْف',
        16: 'الْكَهْف — مَرْيَم — طه',
        17: 'الْأَنبِيَاء — الْحَج',
        18: 'الْمُؤْمِنُون — النُّور — الْفُرْقَان',
        19: 'الْفُرْقَان — الشُّعَرَاء — النَّمْل',
        20: 'النَّمْل — الْقَصَص — الْعَنكَبُوت',
        21: 'الْعَنكَبُوت — الرُّوم — لُقْمَان — السَّجْدَة — الْأَحْزَاب',
        22: 'الْأَحْزَاب — سَبَأ — فَاطِر — يس',
        23: 'يس — الصَّافَّات — ص — الزُّمَر',
        24: 'الزُّمَر — غَافِر — فُصِّلَت',
        25: 'فُصِّلَت — الزُّخْرُف — الدُّخَان — الْجَاثِيَة — الْأَحْقَاف',
        26: 'الْأَحْقَاف — مُحَمَّد — الْفَتْح — الْحُجُرَات — ق — الذَّارِيَات',
        27: 'الذَّارِيَات — الطُّور — النَّجْم — الْقَمَر — الرَّحْمَـٰن — الْوَاقِعَة — الْحَدِيد',
        28: 'الْمُجَادَلَة — الْحَشْر — الْمُمْتَحَنَة — الصَّف — الْجُمُعَة — الْمُنَافِقُون — التَّغَابُن — الطَّلَاق — التَّحْرِيم',
        29: 'الْمُلْك — الْقَلَم — الْحَاقَّة — الْمَعَارِج — نُوح — الْجِن — الْمُزَّمِّل — الْمُدَّثِّر — الْقِيَامَة — الْإِنسَان — الْمُرْسَلَات',
        30: 'النَّبَأ — النَّازِعَات — عَبَسَ — التَّكْوِير — الِانفِطَار — الْمُطَفِّفِين — الِانشِقَاق — الْبُرُوج — الطَّارِق — الْأَعْلَى — الْغَاشِيَة — الْفَجْر — الْبَلَد — الشَّمْس — اللَّيْل — الضُّحَى — الشَّرْح — التِّين — الْعَلَق — الْقَدْر — الْبَيِّنَة — الزَّلْزَلَة — الْعَادِيَات — الْقَارِعَة — التَّكَاثُر — الْعَصْر — الْهُمَزَة — الْفِيل — قُرَيْش — الْمَاعُون — الْكَوْثَر — الْكَافِرُون — النَّصْر — الْمَسَد — الْإِخْلَاص — الْفَلَق — النَّاس',
    };
    document.getElementById('topbarSurahName').textContent = surahNames[juz] || '';

    const toastLabels = {
        1: '📖 Juz 1 — Al-Fatihah & Al-Baqarah',
        2: '📖 Juz 2 — Al-Baqarah 142–252',
        3: '📖 Juz 3 — Al-Baqarah 253–286 & Ali Imran 1–91',
        4: '📖 Juz 4 — Ali Imran 92–200 & An-Nisa 1–23',
        5: '📖 Juz 5 — An-Nisa 24–147',
        6: '📖 Juz 6 — An-Nisa 148–176 & Al-Maidah 1–81',
        7: '📖 Juz 7 — Al-Maidah 83–120 & Al-An\'am 1–110',
        8: '📖 Juz 8 — Al-An\'am 111–165 & Al-A\'raf 1–87',
        9: '📖 Juz 9 — Al-A\'raf 88–206 & Al-Anfal 1–40',
        10: '📖 Juz 10 — Al-Anfal 41–75 & At-Taubah 1–93',
        11: '📖 Juz 11 — At-Taubah 94–129, Yunus 1–109 & Hud 1–5',
        12: '📖 Juz 12 — Hud 6–123 & Yusuf 1–52',
        13: '📖 Juz 13 — Yusuf 53–111, Ar-Ra\'d 1–43 & Ibrahim 1–52',
        14: '📖 Juz 14 — Al-Hijr 1–99 & An-Nahl 1–128',
        15: '📖 Juz 15 — Al-Isra\' 1–111 & Al-Kahfi 1–74',
        16: '📖 Juz 16 — Al-Kahfi 75–110, Maryam 1–98 & Taha 1–135',
        17: '📖 Juz 17 — Al-Anbiya\' 1–112 & Al-Hajj 1–78',
        18: '📖 Juz 18 — Al-Mu\'minun 1–118, An-Nur 1–64 & Al-Furqan 1–20',
        19: '📖 Juz 19 — Al-Furqan 21–77, Asy-Syu\'ara 1–227 & An-Naml 1–55',
        20: '📖 Juz 20 — An-Naml 56–93, Al-Qasas 1–88 & Al-Ankabut 1–45',
        21: '📖 Juz 21 — Al-Ankabut 46–69, Ar-Rum, Luqman, As-Sajdah & Al-Ahzab 1–30',
        22: '📖 Juz 22 — Al-Ahzab 31–73, Saba\' 1–54, Fatir 1–45 & Yasin 1–27',
        23: '📖 Juz 23 — Yasin 28–83, As-Saffat 1–182, Sad 1–88 & Az-Zumar 1–31',
        24: '📖 Juz 24 — Az-Zumar 32–75, Ghafir 1–85 & Fussilat 1–46',
        25: '📖 Juz 25 — Fussilat 47–54, Az-Zukhruf, Ad-Dukhan, Al-Jatsiyah & Al-Ahqaf 1–5',
        26: '📖 Juz 26 — Al-Ahqaf 6–35, Muhammad, Al-Fath, Al-Hujurat, Qaf & Adz-Dzariyat 1–30',
        27: '📖 Juz 27 — Adz-Dzariyat 31–60, At-Tur, An-Najm, Al-Qamar, Ar-Rahman, Al-Waqi\'ah & Al-Hadid 1–29',
        28: '📖 Juz 28 — Al-Mujadilah, Al-Hasyr, Al-Mumtahanah, As-Saff, Al-Jumu\'ah, Al-Munafiqun, At-Taghabun, At-Talaq & At-Tahrim',
        29: '📖 Juz 29 — Al-Mulk, Al-Qalam, Al-Haqqah, Al-Ma\'arij, Nuh, Al-Jinn, Al-Muzzammil, Al-Muddatstsir, Al-Qiyamah, Al-Insan & Al-Mursalat',
        30: '📖 Juz 30 — An-Naba s.d. An-Nas (Surah 78–114)',
    };
    renderContent();
    showToast(toastLabels[juz] || `📖 Juz ${juz}`);
    scrollToActiveTab(juz);
}
function getLocalAudioPath(ayah) {
    const s = String(ayah.surah.number).padStart(3, '0');
    const a = String(ayah.numberInSurah).padStart(3, '0');
    return `https://everyayah.com/data/${selectedQariId}/${s}${a}.mp3`;
}

// =============================================
// VIEW MODE
// =============================================
function setViewMode(mode) {
    viewMode = mode;
    // Tutup dashboard dan quiz jika sedang terbuka
    hideDashboard();
    document.getElementById('quizView').classList.remove('active');
    // Topbar buttons
    document.getElementById('viewMushafBtn').classList.toggle('active', mode === 'mushaf');
    document.getElementById('viewDigitalBtn').classList.toggle('active', mode === 'digital');
    renderContent();
}

function renderContent() {
    const dig = document.getElementById('digitalView');
    const mus = document.getElementById('mushafView');
    if (viewMode === 'digital') {
        if (!dig.dataset.rendered) { renderDigital(); dig.dataset.rendered = '1'; }
        dig.classList.add('active'); mus.classList.remove('active');
        dig.style.display = 'block'; mus.style.display = 'none';
    } else {
        if (!mus.dataset.rendered) { renderMushaf(); mus.dataset.rendered = '1'; }
        mus.classList.add('active'); dig.classList.remove('active');
        mus.style.display = 'flex'; dig.style.display = 'none';
    }
}

// =============================================
// SURAH HEADER BOX builder
// =============================================

// Data tambahan: kategori & jumlah ayat per surah
const SURAH_META = {
    1:  { type: 'Makkiyyah', ayat: 7 },
    2:  { type: 'Madaniyyah', ayat: 286 },
    3:  { type: 'Madaniyyah', ayat: 200 },
    4:  { type: 'Madaniyyah', ayat: 176 },
    5:  { type: 'Madaniyyah', ayat: 120 },
    6:  { type: 'Makkiyyah', ayat: 165 },
    7:  { type: 'Makkiyyah', ayat: 206 },
    8:  { type: 'Madaniyyah', ayat: 75 },
    9:  { type: 'Madaniyyah', ayat: 129 },
    10: { type: 'Makkiyyah', ayat: 109 },
    11: { type: 'Makkiyyah', ayat: 123 },
    12: { type: 'Makkiyyah', ayat: 111 },
    13: { type: 'Madaniyyah', ayat: 43 },
    14: { type: 'Makkiyyah', ayat: 52 },
    15: { type: 'Makkiyyah', ayat: 99 },
    16: { type: 'Makkiyyah', ayat: 128 },
    17: { type: 'Makkiyyah', ayat: 111 },
    18: { type: 'Makkiyyah', ayat: 110 },
    19: { type: 'Makkiyyah', ayat: 98 },
    20: { type: 'Makkiyyah', ayat: 135 },
    21: { type: 'Makkiyyah', ayat: 112 },
    22: { type: 'Madaniyyah', ayat: 78 },
    23: { type: 'Makkiyyah', ayat: 118 },
    24: { type: 'Madaniyyah', ayat: 64 },
    25: { type: 'Makkiyyah', ayat: 77 },
    26: { type: 'Makkiyyah', ayat: 227 },
    27: { type: 'Makkiyyah', ayat: 93 },
    28: { type: 'Makkiyyah', ayat: 88 },
    29: { type: 'Makkiyyah', ayat: 69 },
    30: { type: 'Makkiyyah', ayat: 60 },
    31: { type: 'Makkiyyah', ayat: 34 },
    32: { type: 'Makkiyyah', ayat: 30 },
    33: { type: 'Madaniyyah', ayat: 73 },
    34: { type: 'Makkiyyah', ayat: 54 },
    35: { type: 'Makkiyyah', ayat: 45 },
    36: { type: 'Makkiyyah', ayat: 83 },
    37: { type: 'Makkiyyah', ayat: 182 },
    38: { type: 'Makkiyyah', ayat: 88 },
    39: { type: 'Makkiyyah', ayat: 75 },
    40: { type: 'Makkiyyah', ayat: 85 },
    41: { type: 'Makkiyyah', ayat: 54 },
    42: { type: 'Makkiyyah', ayat: 53 },
    43: { type: 'Makkiyyah', ayat: 89 },
    44: { type: 'Makkiyyah', ayat: 59 },
    45: { type: 'Makkiyyah', ayat: 37 },
    46: { type: 'Makkiyyah', ayat: 35 },
    47: { type: 'Madaniyyah', ayat: 38 },
    48: { type: 'Madaniyyah', ayat: 29 },
    49: { type: 'Madaniyyah', ayat: 18 },
    50: { type: 'Makkiyyah', ayat: 45 },
    51: { type: 'Makkiyyah', ayat: 60 },
    52: { type: 'Makkiyyah', ayat: 49 },
    53: { type: 'Makkiyyah', ayat: 62 },
    54: { type: 'Makkiyyah', ayat: 55 },
    55: { type: 'Madaniyyah', ayat: 78 },
    56: { type: 'Makkiyyah', ayat: 96 },
    57: { type: 'Madaniyyah', ayat: 29 },
    58: { type: 'Madaniyyah', ayat: 22 },
    59: { type: 'Madaniyyah', ayat: 24 },
    60: { type: 'Madaniyyah', ayat: 13 },
    61: { type: 'Madaniyyah', ayat: 14 },
    62: { type: 'Madaniyyah', ayat: 11 },
    63: { type: 'Madaniyyah', ayat: 11 },
    64: { type: 'Madaniyyah', ayat: 18 },
    65: { type: 'Madaniyyah', ayat: 12 },
    66: { type: 'Madaniyyah', ayat: 12 },
    67: { type: 'Makkiyyah', ayat: 30 },
    68: { type: 'Makkiyyah', ayat: 52 },
    69: { type: 'Makkiyyah', ayat: 52 },
    70: { type: 'Makkiyyah', ayat: 44 },
    71: { type: 'Makkiyyah', ayat: 28 },
    72: { type: 'Makkiyyah', ayat: 28 },
    73: { type: 'Makkiyyah', ayat: 20 },
    74: { type: 'Makkiyyah', ayat: 56 },
    75: { type: 'Makkiyyah', ayat: 40 },
    76: { type: 'Madaniyyah', ayat: 31 },
    77: { type: 'Makkiyyah', ayat: 50 },
    78: { type: 'Makkiyyah', ayat: 40 },
    79: { type: 'Makkiyyah', ayat: 46 },
    80: { type: 'Makkiyyah', ayat: 42 },
    81: { type: 'Makkiyyah', ayat: 29 },
    82: { type: 'Makkiyyah', ayat: 19 },
    83: { type: 'Makkiyyah', ayat: 36 },
    84: { type: 'Makkiyyah', ayat: 25 },
    85: { type: 'Makkiyyah', ayat: 22 },
    86: { type: 'Makkiyyah', ayat: 17 },
    87: { type: 'Makkiyyah', ayat: 19 },
    88: { type: 'Makkiyyah', ayat: 26 },
    89: { type: 'Makkiyyah', ayat: 30 },
    90: { type: 'Makkiyyah', ayat: 20 },
    91: { type: 'Makkiyyah', ayat: 15 },
    92: { type: 'Makkiyyah', ayat: 21 },
    93: { type: 'Makkiyyah', ayat: 11 },
    94: { type: 'Makkiyyah', ayat: 8 },
    95: { type: 'Makkiyyah', ayat: 8 },
    96: { type: 'Makkiyyah', ayat: 19 },
    97: { type: 'Makkiyyah', ayat: 5 },
    98: { type: 'Madaniyyah', ayat: 8 },
    99: { type: 'Madaniyyah', ayat: 8 },
    100: { type: 'Makkiyyah', ayat: 11 },
    101: { type: 'Makkiyyah', ayat: 11 },
    102: { type: 'Makkiyyah', ayat: 8 },
    103: { type: 'Makkiyyah', ayat: 3 },
    104: { type: 'Makkiyyah', ayat: 9 },
    105: { type: 'Makkiyyah', ayat: 5 },
    106: { type: 'Makkiyyah', ayat: 4 },
    107: { type: 'Makkiyyah', ayat: 7 },
    108: { type: 'Makkiyyah', ayat: 3 },
    109: { type: 'Makkiyyah', ayat: 6 },
    110: { type: 'Madaniyyah', ayat: 3 },
    111: { type: 'Makkiyyah', ayat: 5 },
    112: { type: 'Makkiyyah', ayat: 4 },
    113: { type: 'Makkiyyah', ayat: 5 },
    114: { type: 'Makkiyyah', ayat: 6 },
};
// Fallback: gunakan data dari API (surah.revelationType & surah.numberOfAyahs)
function getSurahMeta(surahObj) {
    const m = SURAH_META[surahObj.number];
    const type = m ? m.type : (surahObj.revelationType === 'Meccan' ? 'Makkiyyah' : 'Madaniyyah');
    const ayat = m ? m.ayat : (surahObj.numberOfAyahs || '—');
    return { type, ayat };
}

// Konversi nama revelationType ke Arab
function typeToArab(type) {
    return type === 'Makkiyyah' || type === 'Meccan' ? 'مَكِّيَّة' : 'مَدَنِيَّة';
}

// Hias angka dengan ornamen arabik
const ARAB_ORNAMENTS = ['❧', '﴾', '﴿', '❦'];

function buildSurahHeaderBox(surahObj) {
    const meta = getSurahMeta(surahObj);
    const typeArab = typeToArab(meta.type);
    const ayatArab = toArabicNum(meta.ayat);
    const numArab  = toArabicNum(surahObj.number);

    const wrap = document.createElement('div');
    wrap.className = 'surah-header-box';
    wrap.innerHTML = `
        <span class="surah-hb-corner tl"></span>
        <span class="surah-hb-corner tr"></span>
        <span class="surah-hb-corner bl"></span>
        <span class="surah-hb-corner br"></span>
        <div class="surah-hb-top">❧ ✦ ❧</div>
        <div class="surah-hb-cols">
            <!-- Kanan: kategori -->
            <div class="surah-hb-col col-type">
                <div class="surah-hb-col-label">النوع</div>
                <div class="surah-hb-col-val">${typeArab}</div>
            </div>
            <div class="surah-hb-divider"></div>
            <!-- Tengah: nama surah -->
            <div class="surah-hb-col col-name">
                <div class="surah-hb-num">${numArab}</div>
                <div class="surah-hb-col-val">${surahObj.name}</div>
                <div class="surah-hb-col-label" style="direction:ltr">${surahObj.englishName || ''}</div>
            </div>
            <div class="surah-hb-divider"></div>
            <!-- Kiri: jumlah ayat -->
            <div class="surah-hb-col col-ayat">
                <div class="surah-hb-col-label">الآيات</div>
                <div class="surah-hb-col-val">${ayatArab} آية</div>
            </div>
        </div>
        <div class="surah-hb-bottom">❧ ✦ ❧</div>
    `;
    return wrap;
}

// =============================================
// DIGITAL VIEW
// =============================================
function verseCircleSVG(num) {
    return `<div class="verse-circle">
        <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="22" cy="22" r="20" stroke="rgba(46,204,113,0.25)" stroke-width="1"/>
            <circle cx="22" cy="22" r="16" stroke="rgba(46,204,113,0.12)" stroke-width="0.5"/>
            <path d="M22 4 A18 18 0 1 1 21.99 4" stroke="rgba(46,204,113,0.5)" stroke-width="1.5" stroke-linecap="round" fill="none" stroke-dasharray="2 6"/>
        </svg>
        <div class="verse-circle-num">${num}</div>
    </div>`;
}

// =============================================
// JUZ START LOOKUP — surah:ayat → nomor juz
// =============================================
const JUZ_START = {
    '1:1':1, '2:142':2, '2:253':3, '3:93':4, '4:24':5,
    '4:148':6, '5:83':7, '6:111':8, '7:88':9, '8:41':10,
    '9:93':11, '11:6':12, '12:53':13, '15:1':14, '17:1':15,
    '18:75':16, '21:1':17, '23:1':18, '25:21':19, '27:56':20,
    '29:46':21, '33:31':22, '36:28':23, '39:32':24, '41:47':25,
    '46:1':26, '51:31':27, '58:1':28, '67:1':29, '78:1':30
};
function isJuzStart(surahNum, ayahNum) {
    return JUZ_START[`${surahNum}:${ayahNum}`] !== undefined;
}
function getJuzNumFromStart(surahNum, ayahNum) {
    return JUZ_START[`${surahNum}:${ayahNum}`];
}

// =============================================
// TERJEMAHAN PER AYAT — lazy fetch per surah + toggle tampil/sembunyi
// =============================================
async function ensureSurahTranslation(surahNumber) {
    if (translationCache[surahNumber]) return translationCache[surahNumber];
    const res = await fetchWithRetry(`https://api.alquran.cloud/v1/surah/${surahNumber}/id.indonesian`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const map = {};
    (data.data?.ayahs || []).forEach(a => { map[a.numberInSurah] = a.text; });
    translationCache[surahNumber] = map;
    return map;
}

async function toggleTranslation(idx, btnEl) {
    const ayah = ayahsData[idx];
    if (!ayah) return;
    const wrap = document.getElementById(`translation-${idx}`);
    if (!wrap) return;
    const isShown = wrap.classList.contains('show');
    if (isShown) {
        wrap.classList.remove('show');
        if (btnEl) btnEl.classList.remove('active');
        return;
    }
    wrap.classList.add('show');
    if (btnEl) btnEl.classList.add('active');
    // Sudah pernah di-fetch sebelumnya untuk surah ini → langsung tampilkan
    const cached = translationCache[ayah.surah.number];
    if (cached) {
        wrap.textContent = cached[ayah.numberInSurah] || 'Terjemahan tidak tersedia untuk ayat ini.';
        return;
    }
    wrap.innerHTML = `<span class="translation-loading">Memuat terjemahan...</span>`;
    try {
        const map = await ensureSurahTranslation(ayah.surah.number);
        // Cek lagi user belum menutupnya sebelum fetch selesai
        if (!wrap.classList.contains('show')) return;
        wrap.textContent = map[ayah.numberInSurah] || 'Terjemahan tidak tersedia untuk ayat ini.';
    } catch (e) {
        wrap.innerHTML = `<span class="translation-loading">Gagal memuat terjemahan. <a href="#" onclick="retryTranslation(event, ${idx})" style="color:var(--accent-teal)">Coba lagi</a></span>`;
    }
}
function retryTranslation(e, idx) {
    e.preventDefault();
    const ayah = ayahsData[idx];
    const wrap = document.getElementById(`translation-${idx}`);
    if (!ayah || !wrap) return;
    delete translationCache[ayah.surah.number]; // paksa fetch ulang
    wrap.innerHTML = `<span class="translation-loading">Memuat terjemahan...</span>`;
    ensureSurahTranslation(ayah.surah.number).then(map => {
        if (!wrap.classList.contains('show')) return;
        wrap.textContent = map[ayah.numberInSurah] || 'Terjemahan tidak tersedia untuk ayat ini.';
    }).catch(() => {
        wrap.innerHTML = `<span class="translation-loading">Gagal memuat terjemahan. <a href="#" onclick="retryTranslation(event, ${idx})" style="color:var(--accent-teal)">Coba lagi</a></span>`;
    });
}

function renderDigital() {
    const container = document.getElementById('digitalView');
    container.innerHTML = '';
    let lastSurahNum = null;
    let juz26MarkerInserted = false;
    ayahsData.forEach((ayah, idx) => {
        if (ayah._overflow && !ayah._juz26) return; // ayat pelengkap halaman mushaf, tidak tampil di digital view
        // Tanda batas Juz 26 sebelum Al-Ahqaf ayat 1
        if (ayah._juz26 && !juz26MarkerInserted) {
            juz26MarkerInserted = true;
            const marker = document.createElement('div');
            marker.className = 'juz26-marker';
            marker.innerHTML = '<i class="fa-solid fa-bookmark"></i> Mulai Juz 26 (Al-Ahqaf 1–5 diikutkan untuk kelengkapan halaman)';
            container.appendChild(marker);
        }
        if (ayah.numberInSurah === 1 && ayah.surah.number !== lastSurahNum) {
            lastSurahNum = ayah.surah.number;
            const hdr = buildSurahHeaderBox(ayah.surah);
            container.appendChild(hdr);
            // Bismillah (kecuali Al-Fatihah=1 dan At-Taubah=9)
            if (ayah.surah.number !== 1 && ayah.surah.number !== 9) {
                const bism = document.createElement('div');
                bism.className = 'surah-bismillah-row';
                bism.textContent = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
                container.appendChild(bism);
            }
        }
        const card = document.createElement('div');
        const juzStartNum = getJuzNumFromStart(ayah.surah.number, ayah.numberInSurah);
        card.className = 'digital-ayah-card' + (juzStartNum ? ' juz-start-card' : '');
        // Tambah banner "Awal Juz X" sebelum card
        if (juzStartNum) {
            const banner = document.createElement('div');
            banner.className = 'juz-start-banner';
            banner.innerHTML = `<i class="fa-solid fa-flag"></i> Awal Juz ${juzStartNum}`;
            container.appendChild(banner);
        }
        let wordsHtml = ayah.text.split(' ')
            .map(w => `<span class="digital-word" data-idx="${idx}" onclick="handleDigitalAyahClick(${idx})">${w}</span>`)
            .join(' ');
        card.innerHTML = `
            <div class="digital-card-header">
                <div class="verse-badge">
                    ${verseCircleSVG(ayah.numberInSurah)}
                    <div>
                        <div class="verse-label">${ayah.surah.name} : ${ayah.numberInSurah}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                    <button class="translate-btn" title="Lihat/sembunyikan terjemahan"
                        onclick="event.stopPropagation(); toggleTranslation(${idx}, this)">
                        <i class="fa-solid fa-language"></i>
                    </button>
                    <button class="hafalan-btn ${getHafalanStatus(ayah.surah.number, ayah.numberInSurah)}"
                        data-surah="${ayah.surah.number}" data-ayah="${ayah.numberInSurah}"
                        onclick="handleHafalanBtnClick(event,${ayah.surah.number},${ayah.numberInSurah})"
                        title="Klik untuk ubah status hafalan">
                        <span class="hbtn-text">${HAFALAN_LABELS[getHafalanStatus(ayah.surah.number, ayah.numberInSurah)]}</span>
                    </button>
                    <div class="card-page">Hal. ${ayah.page}</div>
                </div>
            </div>
            <div class="digital-ayah-text" dir="rtl">
                ${wordsHtml}
                <span class="ayah-marker" onclick="handleDigitalAyahClick(${idx})">${toArabicNum(ayah.numberInSurah)}</span>
            </div>
            <div class="digital-ayah-translation" id="translation-${idx}"></div>`;
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            setTasmiStartFromClick(idx);
            showToast(`Titik mulai setoran: ${ayah.surah.name} ${ayah.numberInSurah}`);
        });
        container.appendChild(card);
    });
}

// =============================================
// MUSHAF VIEW
// =============================================
function renderMushaf() {
    const container = document.getElementById('mushafView');
    container.innerHTML = '';
    ayahElementMap = {};
    const pages = {};
    ayahsData.forEach((ayah, idx) => {
        const p = ayah.page || 0;
        if (!pages[p]) pages[p] = [];
        pages[p].push({ ...ayah, gIdx: idx });
    });

    // Helper: render satu segmen ayat ke dalam elemen body
    function renderSegmentToBody(body, seg) {
        const surahNum = seg[0].surah.number;
        const startAya = seg[0].numberInSurah;

        if (startAya === 1) {
            // Tanda batas Juz 26 sebelum Al-Ahqaf (surah 46) di Juz 25
            if (seg[0].surah.number === 46 && seg[0]._juz26) {
                const juz26div = document.createElement('div');
                juz26div.style.cssText = 'padding:4px 8px 0;';
                const juz26marker = document.createElement('div');
                juz26marker.className = 'juz26-marker';
                juz26marker.innerHTML = '<i class="fa-solid fa-bookmark"></i> Mulai Juz 26 (Al-Ahqaf 1–5 diikutkan untuk kelengkapan halaman)';
                juz26div.appendChild(juz26marker);
                body.appendChild(juz26div);
            }
            const hdrWrap = document.createElement('div');
            hdrWrap.style.cssText = 'padding:4px 8px 0;';
            hdrWrap.appendChild(buildSurahHeaderBox(seg[0].surah));
            if (surahNum !== 1 && surahNum !== 9) {
                const bism = document.createElement('div');
                bism.className = 'surah-bismillah-row';
                bism.textContent = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
                hdrWrap.appendChild(bism);
            }
            body.appendChild(hdrWrap);
        }

        // Split segmen menjadi sub-segmen yang berurutan (tidak ada gap antar nomor ayat)
        const subSegs = [];
        let cur = [seg[0]];
        for (let i = 1; i < seg.length; i++) {
            if (seg[i].numberInSurah === seg[i-1].numberInSurah + 1) {
                cur.push(seg[i]);
            } else {
                subSegs.push(cur);
                cur = [seg[i]];
            }
        }
        subSegs.push(cur);

        subSegs.forEach(subSeg => {
            const sStart = subSeg[0].numberInSurah;
            const sEnd   = subSeg[subSeg.length - 1].numberInSurah;
            const comp = document.createElement('quran-madina-html');
            comp.setAttribute('sura', surahNum);
            comp.setAttribute('aya', sStart === sEnd ? `${sStart}` : `${sStart}-${sEnd}`);
            subSeg.forEach(ayah => {
                ayahElementMap[ayah.gIdx] = {
                    comp, surahNum,
                    ayahNum: ayah.numberInSurah,
                    className: `quran-madina-html-${String(surahNum).padStart(3,'0')}-${String(ayah.numberInSurah).padStart(3,'0')}`
                };
            });
            // BUG FIX (klik ayat tidak memutar audio): resolusi gIdx dari titik
            // klik dilakukan bertahap — dari elemen yang diklik, lalu dari posisi
            // klik di layar, dan sebagai jaring pengaman terakhir memakai ayat
            // pertama dari subSeg ini (comp ini hanya merender ayat sStart..sEnd,
            // jadi klik pada teksnya tetap harus memutar salah satu ayat tsb,
            // bukan diam tanpa aksi).
            const resolveClickGIdx = (e) => {
                const clickedEl = e.target.closest('.quran-madina-html-part') || e.target;
                let gIdx = getGIdxFromPart(clickedEl);
                if (gIdx === null && typeof e.clientX === 'number') {
                    gIdx = getGIdxNearPoint(e.clientX, e.clientY);
                }
                if (gIdx === null) {
                    // Fallback terakhir: pakai ayat pertama pada subSeg yang dirender
                    // komponen ini, supaya klik tetap terasa responsif.
                    gIdx = subSeg[0].gIdx;
                }
                return gIdx;
            };
            // BUG FIX (klik ayat tidak memutar audio, lanjutan): library
            // <quran-madina-html> punya popup copy/translate bawaan yang
            // "menangkap" klik pada teks ayat untuk dirinya sendiri (lihat
            // dokumentasi resminya). Karena listener ini sebelumnya dipasang
            // di fase bubble (default), event klik keburu ditangani lebih
            // dulu oleh handler internal library sebelum sempat memicu
            // playAyah() di sini. Solusinya: pasang listener di FASE CAPTURE
            // (useCapture = true) supaya kode kita jalan LEBIH DULU, sebelum
            // event turun ke elemen dalam library — lalu stopPropagation()
            // supaya popup bawaan library tidak ikut muncul setelahnya.
            comp.addEventListener('click', (e) => {
                const gIdx = resolveClickGIdx(e);
                if (gIdx === null || gIdx === undefined) return;
                e.stopPropagation();
                if (handleSelectModeClick(gIdx)) return;
                if (isLoopMode && gIdx >= loopStart && gIdx <= loopEnd) {
                    loopCount = 0; currentPlayIndex = gIdx; playAyah(gIdx, true); return;
                }
                playAyah(gIdx);
            }, true);
            comp.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const gIdx = resolveClickGIdx(e);
                if (gIdx !== null && gIdx !== undefined) {
                    setTasmiStartFromClick(gIdx);
                    const a = ayahsData[gIdx];
                    showToast(`Titik mulai setoran: ${a.surah.name} ${a.numberInSurah}`);
                }
            }, true);
            body.appendChild(comp);
        });
    }

    const sortedPageEntries = Object.entries(pages).sort((a,b) => parseInt(a[0]) - parseInt(b[0]));
    let lastCardBody = null; // body elemen dari card terakhir yang di-render

    sortedPageEntries.forEach(([page, ayahs]) => {
        const pageNum = parseInt(page);

        const specialClass = (activeJuz === 1 && pageNum === 1) ? ' special-fatihah'
            : (activeJuz === 1 && pageNum === 2) ? ' special-baqarah' : '';
        const card = document.createElement('div');
        card.className = `mushaf-page-card${specialClass}`;
        card.dataset.page = page;
        const mainAyahs  = ayahs.filter(a => !a._overflow);
        const firstSurah = (mainAyahs[0] || ayahs[0]).surah;
        const lastSurah  = (mainAyahs[mainAyahs.length - 1] || ayahs[ayahs.length - 1]).surah;
        const surahLabel = firstSurah.number === lastSurah.number
            ? firstSurah.name : `${firstSurah.name} – ${lastSurah.name}`;
        const header = document.createElement('div');
        header.className = 'mushaf-header';
        header.innerHTML = `<span>${surahLabel}</span><span>Halaman ${page}</span><span>Juz ${activeJuz}</span>`;
        card.appendChild(header);
        const body = document.createElement('div');
        body.className = 'mushaf-body';
        groupBySurah(ayahs).forEach(seg => renderSegmentToBody(body, seg));

        card.appendChild(body);
            const footer = document.createElement('div');
            footer.className = 'mushaf-footer';
            footer.textContent = 'بِسْمِ ٱللَّهِ';
            card.appendChild(footer);
        
        container.appendChild(card);
        lastCardBody = body; // simpan referensi body untuk kemungkinan append overflow
    });
    const musContainer = document.getElementById('mushafView');
    let _scaleScheduled = false;
    function scheduleScale() {
        if (_scaleScheduled) return;
        _scaleScheduled = true;
        requestAnimationFrame(() => {
            _scaleScheduled = false;
            scaleMushafLines();
            // Update spanEl cache once
            Object.entries(ayahElementMap).forEach(([idx, info]) => {
                if (!info.spanEl) {
                    const span = document.querySelector(`.${info.className}`);
                    if (span) info.spanEl = span;
                }
            });
            injectMushafHafalanDots();
        });
    }
    const observer = new MutationObserver(() => {
        clearTimeout(observer._t);
        observer._t = setTimeout(scheduleScale, 150);
    });
    observer.observe(musContainer, { childList: true, subtree: true });
    // Single fallback after web components likely rendered
    setTimeout(scheduleScale, 800);
    setTimeout(scheduleScale, 2000);
}

function groupBySurah(ayahs) {
    const groups = [];
    let current = null;
    ayahs.forEach(ayah => {
        if (!current || current[0].surah.number !== ayah.surah.number) {
            current = [ayah]; groups.push(current);
        } else { current.push(ayah); }
    });
    return groups;
}
function getGIdxFromPart(el) {
    // 1) Coba baca langsung dari class elemen yang diklik (kasus ideal:
    //    elemen ini sendiri sudah membawa class quran-madina-html-XXX-YYY)
    const fromClassList = (classList) => {
        for (const cls of classList) {
            const m = cls.match(/^quran-madina-html-(\d{3})-(\d{3})$/);
            if (m) {
                const sura = parseInt(m[1]), aya = parseInt(m[2]);
                for (const [idx, info] of Object.entries(ayahElementMap)) {
                    if (info.surahNum === sura && info.ayahNum === aya) return parseInt(idx);
                }
            }
        }
        return null;
    };
    let direct = fromClassList(el.classList);
    if (direct !== null) return direct;

    // 2) BUG FIX: class penanda surah:ayat (quran-madina-html-XXX-YYY) biasanya
    //    hanya menempel di badge nomor ayat (.quran-madina-html-ayah-num), BUKAN
    //    di elemen kata/huruf (.quran-madina-html-part) yang sebenarnya diklik
    //    pengguna. Maka kita naik ke elemen-elemen leluhur terdekat dulu.
    let node = el.parentElement;
    let hops = 0;
    while (node && hops < 8 && node.tagName !== 'QURAN-MADINA-HTML') {
        const r = fromClassList(node.classList);
        if (r !== null) return r;
        node = node.parentElement;
        hops++;
    }
    return null;
}

// Fallback tambahan: cari gIdx berdasarkan badge nomor ayat terdekat dari
// posisi klik (menangani kasus badge nomor ayat tidak berada di jalur
// leluhur elemen yang diklik, misalnya diposisikan absolut/mengambang).
function getGIdxNearPoint(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (const node of stack) {
        if (node.classList && node.classList.contains('quran-madina-html-ayah-num')) {
            const g = getGIdxFromPart(node);
            if (g !== null) return g;
        }
    }
    return null;
}

// =============================================
// AUDIO
// =============================================
function handleDigitalAyahClick(idx) {
    if (handleSelectModeClick(idx)) return;
    if (isLoopMode && idx >= loopStart && idx <= loopEnd) {
        loopCount = 0; currentPlayIndex = idx; playAyah(idx, true); return;
    }
    playAyah(idx);
}
function playAyah(index, continuous = false) {
    if (isTasmiMode) return;
    if (!continuous) { isPlayingAll = false; repeatAyahCount = 0; }
    if (continuous && currentPlayIndex !== index) repeatAyahCount = 0;
    currentPlayIndex = index;
    audioRetryCount = 0; // ayat baru → reset percobaan ulang
    highlightWords(index);
    const mainEl = document.getElementById('mainContainer');
    const savedScroll = mainEl.scrollTop;
    getAudioPlayer().src = getLocalAudioPath(ayahsData[index]);
    // Restore scroll if audio src assignment caused a reset
    if (mainEl.scrollTop !== savedScroll) mainEl.scrollTop = savedScroll;
    requestAnimationFrame(() => {
        if (mainEl.scrollTop !== savedScroll) mainEl.scrollTop = savedScroll;
    });
    getAudioPlayer().play().catch(() => { if (continuous) skipToNext(); });
    scrollToAyah(index);
    // Update player info
    const a = ayahsData[index];
    document.getElementById('playerSurahName').textContent = a.surah.englishName || a.surah.name;
    document.getElementById('playerAyatNum').textContent = `Ayat ${a.numberInSurah}`;
    // Update topbar surah name
    const topbarName = document.getElementById('topbarSurahName');
    if (topbarName) topbarName.textContent = a.surah.name;
    updatePlayerPlayIcon(true);
}
function scrollToAyah(index) {
    let attempts = 0;
    function doScroll() {
        let el = null;
        if (viewMode === 'digital') {
            const cards = document.querySelectorAll('.digital-ayah-card');
            el = cards[index] || null;
        } else {
            const info = ayahElementMap[index];
            if (info) el = info.spanEl || info.comp || null;
        }
        if (!el) {
            if (++attempts < 3) setTimeout(doScroll, 400);
            return;
        }
        const container = document.getElementById('mainContainer');
        const topbarH   = document.getElementById('topbar')?.offsetHeight || 0;
        const playerH   = document.querySelector('.audio-player')?.offsetHeight || 0;
        const cRect     = container.getBoundingClientRect();
        const eRect     = el.getBoundingClientRect();
        const elOffsetTop = eRect.top - cRect.top + container.scrollTop;
        const visibleH    = container.clientHeight - topbarH - playerH;
        const target      = elOffsetTop - topbarH - (visibleH / 2) + (el.offsetHeight / 2);
        container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
    requestAnimationFrame(doScroll);
}

function togglePlayAll() {
    isPlayingAll = !isPlayingAll;
    const btn = document.getElementById('playAllBtn');
    if (isPlayingAll) {
        btn.innerHTML = `<i class="fa-solid fa-pause"></i><span class="btn-label-long"> Jeda</span>`;
        btn.classList.add('paused');
        playAyah(currentPlayIndex, true);
    } else {
        btn.innerHTML = `<i class="fa-solid fa-play"></i><span class="btn-label-long"> Putar Semua</span>`;
        btn.classList.remove('paused');
        getAudioPlayer().pause();
        updatePlayerPlayIcon(false);
    }
}

// Player bar buttons
function togglePlayerPlay() {
    if (getAudioPlayer().paused) {
        if (!getAudioPlayer().src) {
            playAyah(currentPlayIndex, false);
        } else {
            getAudioPlayer().play().then(()=>updatePlayerPlayIcon(true)).catch(()=>{});
        }
    } else {
        getAudioPlayer().pause();
        updatePlayerPlayIcon(false);
    }
}
function updatePlayerPlayIcon(playing) {
    const icon = document.getElementById('playerPlayIcon');
    if (icon) icon.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
}
function jumpPrev() {
    if (currentPlayIndex > 0) playAyah(currentPlayIndex - 1, isPlayingAll);
}
function jumpNext() {
    if (currentPlayIndex < ayahsData.length - 1) playAyah(currentPlayIndex + 1, isPlayingAll);
}
function seekTo(e) {
    const bar = e.currentTarget;
    const pct = e.offsetX / bar.offsetWidth;
    if (getAudioPlayer().duration) getAudioPlayer().currentTime = pct * getAudioPlayer().duration;
}
function fmtTime(s) {
    if (isNaN(s)) return '0:00';
    const m = Math.floor(s/60), sec = Math.floor(s%60);
    return `${m}:${String(sec).padStart(2,'0')}`;
}

function initAudioEvents() {
    getAudioPlayer().addEventListener('ended', () => {
        updatePlayerPlayIcon(false);
        // Repeat per ayat (prioritas tertinggi, kecuali loop mode)
        if (isRepeatAyah && !isLoopMode) {
            repeatAyahCount++;
            if (repeatAyahCount < repeatAyahMax) {
                // BUG FIX (Ulangi Ayat berputar tanpa henti): sebelumnya
                // dipanggil dengan `isPlayingAll` sebagai continuous. Kalau
                // ayat diputar dari klik biasa (bukan mode Putar Semua),
                // isPlayingAll = false → playAyah() ikut me-reset
                // repeatAyahCount ke 0 tiap kali diputar ulang, sehingga
                // hitungan repeat tidak pernah mencapai repeatAyahMax dan
                // ayat terus berputar tanpa henti. continuous harus `true`
                // di sini karena ini murni replay internal, bukan klik baru
                // dari pengguna — isPlayingAll tetap dijaga apa adanya.
                playAyah(currentPlayIndex, true);
            } else {
                repeatAyahCount = 0;
                if (isPlayingAll) skipToNext();
            }
            return;
        }
        if (isLoopMode) {
            loopCount++;
            if (loopCount < loopMax) {
                playAyah(currentPlayIndex, true);
            } else {
                loopCount = 0;
                if (currentPlayIndex < loopEnd) {
                    playAyah(currentPlayIndex + 1, true);
                } else {
                    currentPlayIndex = loopStart;
                    playAyah(currentPlayIndex, true);
                }
            }
        } else if (isPlayingAll) { skipToNext(); }
    });
    let _tuPending = false;
    getAudioPlayer().addEventListener('timeupdate', () => {
        if (_tuPending) return;
        _tuPending = true;
        requestAnimationFrame(() => {
            _tuPending = false;
            const audio = getAudioPlayer();
            const pct = audio.duration ? (audio.currentTime / audio.duration * 100) : 0;
            const pf = document.getElementById('progressFill');
            if (pf) pf.style.width = pct + '%';
            const ct = document.getElementById('currentTime');
            const tt = document.getElementById('totalTime');
            if (ct) ct.textContent = fmtTime(audio.currentTime);
            if (tt) tt.textContent = fmtTime(audio.duration);
        });
    });
    getAudioPlayer().addEventListener('play', () => updatePlayerPlayIcon(true));
    getAudioPlayer().addEventListener('pause', () => updatePlayerPlayIcon(false));

    // BUG FIX (audio diam tanpa keterangan saat everyayah.com balas 503):
    // sebelumnya tidak ada penanganan event 'error' pada elemen <audio>,
    // jadi kalau server sumber audio sedang overload/503, audio hanya diam
    // tanpa retry maupun pemberitahuan. 503 biasanya bersifat sementara,
    // jadi kita coba ulang otomatis beberapa kali sebelum menyerah.
    getAudioPlayer().addEventListener('error', () => {
        const audio = getAudioPlayer();
        if (!audio.src) return; // src kosong (mis. saat reset), abaikan
        if (audioRetryCount < AUDIO_MAX_RETRIES) {
            audioRetryCount++;
            const retryingIndex = currentPlayIndex;
            setTimeout(() => {
                // Pastikan user belum pindah ke ayat lain selagi menunggu
                if (currentPlayIndex !== retryingIndex) return;
                const src = audio.src;
                audio.src = ''; // paksa reload bersih
                audio.src = src;
                audio.play().catch(() => {});
            }, AUDIO_RETRY_DELAY_MS);
        } else {
            audioRetryCount = 0;
            updatePlayerPlayIcon(false);
            showToast('⚠️ Audio gagal dimuat (server sedang sibuk). Coba lagi sebentar lagi.');
            // Kalau sedang mode Putar Semua/Loop, jangan macet diam —
            // lanjut ke ayat berikutnya supaya sesi hafalan tidak terhenti.
            if (isPlayingAll || isLoopMode) skipToNext();
        }
    });
}
function skipToNext() {
    currentPlayIndex++;
    if (currentPlayIndex < ayahsData.length) playAyah(currentPlayIndex, true);
    else stopAudio();
}
function stopAudio() {
    if (!audioPlayer) return;
    getAudioPlayer().pause();
    isPlayingAll = false;
    isLoopMode = false;
    loopCount = 0;
    repeatAyahCount = 0;
    const btn = document.getElementById('playAllBtn');
    if (btn) { btn.innerHTML = `<i class="fa-solid fa-play"></i><span class="btn-label-long"> Putar Semua</span>`; btn.classList.remove('paused'); }
    const loopBtn = document.getElementById('loopBtn');
    if (loopBtn) { loopBtn.innerHTML = `<i class="fa-solid fa-repeat"></i><span class="btn-label-long"> Loop</span>`; loopBtn.classList.remove('active'); }
    updatePlayerPlayIcon(false);
    removeHighlight();
}

// =============================================
// HIGHLIGHT — cached, no full DOM scan
// =============================================
let _activeHighlightEls = []; // cache elemen yang sedang di-highlight

function highlightWords(index) {
    removeHighlight();
    const newActive = [];
    // Digital words
    document.querySelectorAll(`.digital-word[data-idx="${index}"]`).forEach(el => {
        el.classList.add('char-active');
        newActive.push(el);
    });
    // Digital card
    const cards = document.querySelectorAll('.digital-ayah-card');
    if (cards[index]) { cards[index].classList.add('card-active'); newActive.push(cards[index]); }
    // Mushaf span (cached dari ayahElementMap)
    const info = ayahElementMap[index];
    if (info) {
        const addMushafHL = () => {
            if (info.spanEl) {
                // spanEl adalah satu elemen — highlight bagian ayahnya
                const parts = info.comp
                    ? info.comp.querySelectorAll(`.${info.className}`)
                    : document.querySelectorAll(`.${info.className}`);
                parts.forEach(p => { p.classList.add('char-active'); newActive.push(p); });
            } else {
                const parts = document.querySelectorAll(`.${info.className}`);
                parts.forEach(p => { p.classList.add('char-active'); newActive.push(p); info.spanEl = p; });
            }
        };
        if (info.spanEl || info.comp) addMushafHL();
        else setTimeout(addMushafHL, 80);
    }
    _activeHighlightEls = newActive;
}

function removeHighlight() {
    // Hanya hapus dari elemen yang tahu aktif — tidak scan seluruh DOM
    _activeHighlightEls.forEach(el => el.classList.remove('char-active', 'card-active', 'tasmi-error', 'tasmi-nudge'));
    _activeHighlightEls = [];
    // Fallback ringan: hanya scan jika ada yang tertinggal (jarang terjadi)
    if (document.querySelector('.char-active')) {
        document.querySelectorAll('.char-active').forEach(el => el.classList.remove('char-active', 'tasmi-error'));
    }
    if (document.querySelector('.card-active')) {
        document.querySelectorAll('.card-active').forEach(el => el.classList.remove('card-active'));
    }
}

// =============================================
// BLIND MODE
// =============================================

// ---- Tap-and-Hold Reveal (Blind Mode) ----
// Saat blind mode aktif: tekan & tahan → ayat terbuka, lepas → tertutup lagi
let _blindHoldTimer = null;
let _blindRevealedEl = null;   // elemen yang sedang di-reveal (digital: .digital-ayah-text, mushaf: .mushaf-page-card)

function _blindReveal(el) {
    if (_blindRevealedEl && _blindRevealedEl !== el) {
        _blindRevealedEl.classList.remove('blind-revealed');
    }
    _blindRevealedEl = el;
    el.classList.add('blind-revealed');
}
function _blindHide() {
    clearTimeout(_blindHoldTimer);
    _blindHoldTimer = null;
    if (_blindRevealedEl) {
        _blindRevealedEl.classList.remove('blind-revealed');
        _blindRevealedEl = null;
    }
}

// Pasang listener tap-and-hold ke elemen (digital card text atau mushaf page card)
function _attachBlindHold(el, isMushaCard) {
    // Hindari duplikasi
    if (el._blindHoldAttached) return;
    el._blindHoldAttached = true;

    function onStart(e) {
        if (!isBlindMode) return;
        // Jangan consume event agar scroll tetap jalan
        clearTimeout(_blindHoldTimer);
        // Delay singkat sebelum reveal agar tidak konflik dengan scroll
        _blindHoldTimer = setTimeout(() => _blindReveal(el), 120);
    }
    function onEnd(e) {
        _blindHide();
    }

    el.addEventListener('pointerdown',  onStart, { passive: true });
    el.addEventListener('pointerup',    onEnd,   { passive: true });
    el.addEventListener('pointercancel',onEnd,   { passive: true });
    el.addEventListener('pointerleave', onEnd,   { passive: true });
}

// Pasang ke semua digital ayah cards (digital-ayah-text) & mushaf page cards
function initBlindHoldListeners() {
    // Digital cards — reveal per ayat
    document.querySelectorAll('.digital-ayah-text').forEach(el => _attachBlindHold(el, false));
    // Mushaf cards — reveal per halaman
    document.querySelectorAll('.mushaf-page-card').forEach(el => _attachBlindHold(el, true));
}

// Panggil setelah render
const _origRenderDigital = window.renderDigital;
const _origRenderMushaf  = window.renderMushaf;
document.addEventListener('DOMContentLoaded', () => {
    // Hook after render via MutationObserver agar tidak perlu patch fungsi
    const obs = new MutationObserver(() => initBlindHoldListeners());
    const mc = document.getElementById('mainContainer');
    if (mc) obs.observe(mc, { childList: true, subtree: true });
    initBlindHoldListeners();
});

function toggleBlindMode() {
    isBlindMode = !isBlindMode;
    // Reset reveal saat mode dimatikan
    if (!isBlindMode) _blindHide();
    document.getElementById('mainContainer').classList.toggle('blind-mode', isBlindMode);
    const btn = document.getElementById('blindModeBtn');
    btn.innerHTML = isBlindMode ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
    btn.classList.toggle('active', isBlindMode);
    if (isBlindMode) {
        showToast('👁 Blind mode aktif — tahan ayat untuk lihat');
        // Pastikan semua elemen baru sudah terpasang listener
        setTimeout(initBlindHoldListeners, 300);
    }
}

// =============================================
// SPEECH RECOGNITION
// =============================================
let _tasmiAccum = '';
let _tasmiEvalTimer = null;
let tasmiSpeedMode = false;   // Mode cepat: hafidz membaca tanpa jeda panjang
let _lastAlarmTime = 0;       // Cooldown alarm — cegah alarm bertubi-tubi di mode cepat
let _silenceTimer  = null;    // Timer jeda napas/waqof panjang — evaluasi setelah benar-benar diam
let _tasmiAudioCtx = null;    // AudioContext shared — dibuat saat user gesture (activateTasmi)

// =============================================
// NORMALISASI ARAB — dipakai di semua evaluasi
// =============================================
// Huruf muqatta'at yang diucapkan secara individual oleh STT
// STT akan mengembalikan "الم" atau "ا ل م" atau "الف لام ميم" — kita handle semuanya
const MUQATTAAT_MAP = {
    // nama huruf → huruf Arab tunggal
    // PENTING: jangan masukkan kata biasa Arab seperti 'لم' (= "tidak/belum")
    'الف':  'ا',  'أَلِفٌ': 'ا', 'ألف': 'ا', 'آلف': 'ا',
    'لام':  'ل',  'لَامٌ':  'ل',  // dihapus: 'لم':'ل' → merusak kata biasa
    'ميم':  'م',  'مِيمٌ':  'م', 'ميّم': 'م',
    'نون':  'ن',  'نُونٌ':  'ن',
    'قاف':  'ق',  'قَافٌ':  'ق',
    'صاد':  'ص',  'صَادٌ':  'ص', 'صآد': 'ص',
    'طاء':  'ط',  'طَاءٌ':  'ط', 'طا':  'ط',
    'كاف':  'ك',  'كَافٌ':  'ك',
    'عين':  'ع',  'عَيْنٌ': 'ع',
    'سين':  'س',  'سِينٌ':  'س',
    'حاء':  'ح',  'حَاءٌ':  'ح',
    'ياء':  'ي',  'يَاءٌ':  'ي',
    'راء':  'ر',  'رَاءٌ':  'ر',
    'هاء':  'ه',  'هَاءٌ':  'ه',
};

// Beberapa surah yang dimulai dengan huruf muqatta'at — bentuk tulisan mushaf-nya
// Misal: الم → ['ا','ل','م'], يس → ['ي','س'], dst
// Juga termasuk varian STT — misal: STT sering transkripsi يس sebagai "ياسين"
const MUQATTAAT_WORDS = {
    'الم':   ['ا','ل','م'],
    'المص':  ['ا','ل','م','ص'],
    'الر':   ['ا','ل','ر'],
    'المر':  ['ا','ل','م','ر'],
    'كهيعص': ['ك','ه','ي','ع','ص'],
    'طه':    ['ط','ه'],
    'طاها':  ['ط','ه'],   // varian STT untuk طه
    'طسم':   ['ط','س','م'],
    'طس':    ['ط','س'],
    'يس':    ['ي','س'],
    'ياسين': ['ي','س'],   // varian STT — STT sering baca يس sebagai nama ياسين
    'يسن':   ['ي','س'],   // varian lain STT
    'ص':     ['ص'],
    'حم':    ['ح','م'],
    'عسق':   ['ع','س','ق'],
    'ق':     ['ق'],
    'ن':     ['ن'],
};

function normalizeArabic(s) {
    if (!s) return '';
    let t = s;

    // 1. Hapus tashkil / harakat & tatweel & tanda baca Quran lainnya
    t = t.replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06FF\u0670\u0640]/g, '');
    // Hapus juga tanda Quran tambahan yang mungkin ada di teks mushaf
    t = t.replace(/[\u0615\u0653\u0654\u0655\u0656\u0657\u0658\u0659\u065A\u065B\u065C\u065D\u065E\u065F]/g, '');

    // 2. Standarisasi alef & huruf umum DULU (sebelum map muqatta'at)
    // PENTING: U+0671 (ٱ Wasla) dipakai di teks mushaf Utsmani (quran-madina-html)
    //          harus dinormalisasi ke alef biasa agar MUQATTAAT_WORDS bisa match
    t = t.replace(/[\u0622\u0623\u0625\u0627\u0671]/g, '\u0627'); // ا semua varian + ٱ wasla → ا
    t = t.replace(/\u0629/g, '\u0647');                             // ة → ه
    t = t.replace(/\u0649/g, '\u064A');                             // ى → ي
    t = t.replace(/\u0624/g, '\u0648');                             // ؤ → و
    t = t.replace(/\u0626/g, '\u064A');                             // ئ → ي

    // 3. Ganti nama huruf yang dieja STT → huruf tunggal
    //    (STT kadang mengembalikan "الف لام ميم" untuk "الم")
    //    Urutan: kata lebih panjang dulu agar tidak salah potong
    for (const [name, letter] of Object.entries(MUQATTAAT_MAP)) {
        t = t.replace(new RegExp(name, 'g'), letter);
    }

    // 4. Hapus non-Arab
    t = t.replace(/[^\u0600-\u06FF\s]/g, '');

    // 5. Normalisasi spasi
    t = t.replace(/\s+/g, ' ').trim();

    return t;
}

// Perluas kata muqatta'at dalam teks:
//   "الم" → "ا ل م" agar bisa dicocokkan kata per kata dengan STT
// Berlaku untuk KEDUA sisi: ekspektasi mushaf maupun hasil STT
function expandMuqattaat(text) {
    const words = text.split(' ');
    const out = [];
    for (const w of words) {
        if (MUQATTAAT_WORDS[w]) {
            out.push(...MUQATTAAT_WORDS[w]);
        } else {
            // Coba match parsial: huruf tunggal pendek (1-2 char) yang merupakan huruf muqatta'at
            // STT kadang memecah "الم" menjadi "ا", "ل", "م" terpisah — biarkan saja (sudah 1 char)
            out.push(w);
        }
    }
    return out.join(' ');
}

// Levenshtein distance (shared, tidak duplikat)
function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const dp = Array.from({length: a.length + 1}, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
            dp[i][j] = a[i-1] === b[j-1]
                ? dp[i-1][j-1]
                : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[a.length][b.length];
}
function wordSim(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const m = Math.max(a.length, b.length);
    return m ? 1 - levenshtein(a, b) / m : 1;
}

// Cocokkan got-words ke exp-words, kembalikan {matched, totalSim}
function matchWords(expWords, gotWords, threshold = 0.60) {
    let matched = 0, totalSim = 0;
    const usedGot = new Set();
    for (const expW of expWords) {
        let best = 0, bIdx = -1;
        for (let gi = 0; gi < gotWords.length; gi++) {
            if (usedGot.has(gi)) continue;
            const s = wordSim(expW, gotWords[gi]);
            if (s > best) { best = s; bIdx = gi; }
        }
        if (best >= threshold && bIdx !== -1) {
            usedGot.add(bIdx);
            matched++;
            totalSim += best;
        }
    }
    return { matched, totalSim };
}

function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    recognition = new SR();
    recognition.lang = 'ar-SA';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;  // lebih banyak kandidat agar coverage lebih baik

    recognition.onresult = (e) => {
        let finalText = '';
        let hasInterim = false;
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
                // Ambil SEMUA alternatif, gabung, agar tidak ada kata yang luput
                for (let k = 0; k < e.results[i].length; k++) {
                    finalText += e.results[i][k].transcript + ' ';
                }
            } else {
                hasInterim = true;
            }
        }

        // Jika ada interim (user sedang bicara aktif), reset silence timer segera
        // agar tidak ada alarm saat user masih membaca
        if (hasInterim && !finalText.trim()) {
            clearTimeout(_silenceTimer);
            clearTimeout(_tasmiEvalTimer);
            return;
        }

        if (!finalText.trim()) return;
        _tasmiAccum = (_tasmiAccum + ' ' + finalText).trim();

        // Reset semua timer setiap kali ada input baru
        clearTimeout(_silenceTimer);
        clearTimeout(_tasmiEvalTimer);

        if (tasmiSpeedMode) {
            // ── MODE CEPAT ─────────────────────────────────────────────────────────
            // Evaluasi 400ms setelah kata terakhir masuk.
            _tasmiEvalTimer = setTimeout(() => {
                if (!isTasmiMode || !_tasmiAccum) return;
                const result = _accumulationSufficient(_tasmiAccum);
                if (result === 'pass') {
                    _tasmiAccum = '';
                    triggerCorrect();
                    setTimeout(() => advanceTasmi(), 150);
                } else if (result === 'fail') {
                    // Coverage cukup tapi kata salah → tunggu 1.5 detik self-correct, lalu alarm
                    _silenceTimer = setTimeout(() => {
                        if (!isTasmiMode) return;
                        const r2 = _accumulationSufficient(_tasmiAccum);
                        if (r2 === 'pass') {
                            _tasmiAccum = '';
                            triggerCorrect();
                            setTimeout(() => advanceTasmi(), 150);
                            return;
                        }
                        const now = Date.now();
                        if (!_lastAlarmTime || now - _lastAlarmTime > 3000) {
                            _lastAlarmTime = now;
                            _tasmiAccum = '';
                            triggerError();
                        }
                    }, 1500);
                } else {
                    // partial → user masih membaca. Pasang silence timer 3s → nudge halus
                    _silenceTimer = setTimeout(() => {
                        if (!isTasmiMode || !_tasmiAccum) return;
                        const r2 = _accumulationSufficient(_tasmiAccum);
                        if (r2 === 'pass') {
                            _tasmiAccum = '';
                            triggerCorrect();
                            setTimeout(() => advanceTasmi(), 150);
                        } else {
                            const now = Date.now();
                            if (!_lastAlarmTime || now - _lastAlarmTime > 3000) {
                                _lastAlarmTime = now;
                                triggerNudge(); // beep lembut — jangan clear akumulasi
                            }
                        }
                    }, 3000);
                }
            }, 400);

        } else {
            // ── MODE NORMAL — 3-Tier Logic ─────────────────────────────────────────
            //
            // TIER 1 — pass:    coverage cukup → konfirmasi 500ms, lalu advance.
            // TIER 2 — partial: user masih membaca → pasang silence timer 4 detik.
            //                   Jika 4 detik tidak ada input dan masih stuck → nudge.
            // TIER 3 — fail:    coverage cukup tapi kata tidak cocok → tunggu 2.5 detik
            //                   (self-correct window), lalu alarm dengan cooldown 4 detik.
            //
            // Tujuan: TIDAK MUDAH ALARM (ada grace period), TIDAK MUDAH DIBIARKAN
            //         (silence timer memastikan ada feedback setelah diam lama).

            const result = _accumulationSufficient(_tasmiAccum);

            if (result === 'pass') {
                // Coverage sudah bagus — konfirmasi 300ms agar responsif tapi tidak prematur
                _tasmiEvalTimer = setTimeout(() => {
                    if (!isTasmiMode || !_tasmiAccum) return;
                    const r2 = _accumulationSufficient(_tasmiAccum);
                    if (r2 === 'pass') {
                        _tasmiAccum = '';
                        triggerCorrect();
                        setTimeout(() => advanceTasmi(), 150);
                    } else {
                        // Coverage turun setelah kata baru masuk — evaluasi penuh
                        const now = Date.now();
                        if (!_lastAlarmTime || now - _lastAlarmTime > 3000) {
                            _lastAlarmTime = now;
                            handleTasmiResult(_tasmiAccum);
                            _tasmiAccum = '';
                        }
                    }
                }, 300);

            } else if (result === 'partial') {
                // User masih membaca / akumulasi belum cukup.
                // Pasang silence timer 3.5 detik — cukup sabar tapi tidak terlalu lama
                _silenceTimer = setTimeout(() => {
                    if (!isTasmiMode || !_tasmiAccum) return;
                    const r2 = _accumulationSufficient(_tasmiAccum);
                    if (r2 === 'pass') {
                        _tasmiAccum = '';
                        triggerCorrect();
                        setTimeout(() => advanceTasmi(), 150);
                    } else {
                        // Masih partial/fail setelah diam → nudge halus
                        const now = Date.now();
                        if (!_lastAlarmTime || now - _lastAlarmTime > 3000) {
                            _lastAlarmTime = now;
                            triggerNudge();
                        }
                    }
                }, 3500);

            } else {
                // result === 'fail' — coverage cukup tapi kata tidak cocok.
                // Beri 2 detik window untuk self-correct sebelum alarm.
                _tasmiEvalTimer = setTimeout(() => {
                    if (!isTasmiMode || !_tasmiAccum) return;
                    const r2 = _accumulationSufficient(_tasmiAccum);
                    if (r2 === 'pass') {
                        // Berhasil self-correct
                        _tasmiAccum = '';
                        triggerCorrect();
                        setTimeout(() => advanceTasmi(), 150);
                        return;
                    }
                    // Masih fail → alarm dengan cooldown 3 detik
                    const now = Date.now();
                    if (!_lastAlarmTime || now - _lastAlarmTime > 3000) {
                        _lastAlarmTime = now;
                        _tasmiAccum = '';
                        triggerError();
                    }
                }, 2000);
            }
        }
    };

    recognition.onend = () => {
        if (!isTasmiMode) return;
        // onend = recognition berhenti (waqof lama, jeda napas, atau browser cut).
        // JANGAN evaluasi di sini — timer yang akan menentukan.
        // Restart recognition segera agar tidak ada gap perekaman.
        try { recognition.start(); } catch(e) {}
    };
}

const BISMILLAH_TEXT = 'بسم الله الرحمن الرحيم'; // sudah tanpa harakat

// Helper: kembalikan kata ekspektasi ayat saat ini (normalize + expand muqatta'at)
function getExpWords() {
    const a = ayahsData[currentPlayIndex];
    if (!a) return [];
    return expandMuqattaat(normalizeArabic(a.text)).split(' ').filter(Boolean);
}

// Helper: kembalikan kata got dari transcript (normalize + expand muqatta'at di sisi STT juga)
function getGotWords(transcript) {
    return expandMuqattaat(normalizeArabic(transcript)).split(' ').filter(Boolean);
}

// Cek apakah ayat ini adalah ayat 1 surah yang perlu bismillah (semua kecuali Al-Fatihah ayat 1 dan At-Taubah)
// Al-Fatihah ayat 1 adalah bismillah itu sendiri, At-Taubah tidak punya bismillah
function isBismillahAyah() {
    const a = ayahsData[currentPlayIndex];
    if (!a) return false;
    if (a.numberInSurah !== 1) return false;
    if (a.surah.number === 1) return false;  // Al-Fatihah: ayat 1 sudah bismillah
    if (a.surah.number === 9) return false;  // At-Taubah: tidak ada bismillah
    return true;
}

// =============================================
// TASMI MODE
// =============================================
function toggleTasmiMode() {
    isTasmiMode ? deactivateTasmi() : activateTasmi();
}
function activateTasmi() {
    if (!recognition) { showToast('Browser tidak mendukung Speech Recognition'); return; }
    isTasmiMode = true;
    currentPlayIndex = tasmiStartIndex;
    highlightWords(tasmiStartIndex);
    const statusBar = document.getElementById('tasmiStatus');
    statusBar.style.display = 'block';
    recognition.start();
    stopAudio();
    updateTasmiProgressUI();
    // Buat AudioContext di sini (saat ada user gesture) agar tidak diblokir browser
    try {
        if (!_tasmiAudioCtx || _tasmiAudioCtx.state === 'closed') {
            _tasmiAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (_tasmiAudioCtx.state === 'suspended') _tasmiAudioCtx.resume();
    } catch(e) {}
}
function deactivateTasmi() {
    isTasmiMode = false;
    clearTimeout(_tasmiEvalTimer);
    clearTimeout(_silenceTimer);
    _tasmiAccum = '';
    _lastAlarmTime = 0;
    tasmiSpeedMode = false;
    try { recognition.stop(); } catch(e) {}
    document.getElementById('tasmiStatus').style.display = 'none';
    document.getElementById('transcriptDisplay').textContent = 'Menunggu suara...';
    removeHighlight();
}
function updateTasmiProgressUI() {
    const a = ayahsData[currentPlayIndex];
    if (a) document.getElementById('tasmiProgress').textContent = `${a.surah.name} ${a.numberInSurah}`;
}
// Cek apakah akumulasi sudah cukup mewakili ayat saat ini.
// Return: 'pass' | 'fail' | 'partial'
function _accumulationSufficient(transcript) {
    const expWords = getExpWords();
    if (!expWords.length) return 'pass';

    let gotWords = getGotWords(transcript);
    if (!gotWords.length) return 'partial';

    // Strip bismillah dari got jika ini awal surah
    if (isBismillahAyah()) {
        const bismWords = expandMuqattaat(normalizeArabic(BISMILLAH_TEXT)).split(' ').filter(Boolean);
        const { matched: bMatch } = matchWords(bismWords, gotWords.slice(0, bismWords.length + 2));
        if (bMatch >= Math.ceil(bismWords.length * 0.6)) gotWords = gotWords.slice(bMatch);
        if (!gotWords.length) return 'partial';
    }

    const { matched } = matchWords(expWords, gotWords);
    const coverage = matched / expWords.length;

    // Balanced: < 0.55 belum cukup kata, >= 0.65 sudah cukup benar,
    // 0.55-0.65 = grey zone (fail) → beri window self-correct
    if (coverage < 0.55) return 'partial';
    if (coverage >= 0.65) return 'pass';
    return 'fail';
}

// Helper: tampilkan info debug di panel bawah status bar
function showTasmiDebug(heard, expWords, gotWords, matched, ratio, avgSim, passed, isMuq) {
    const el = document.getElementById('tasmiDebug');
    if (!el) return;
    el.style.display = 'block';
    const pct = Math.round(ratio * 100);
    const simPct = Math.round(avgSim * 100);
    const statusIcon = passed ? '✅' : '❌';
    const heardClean = heard.trim().slice(0, 80) + (heard.trim().length > 80 ? '…' : '');
    el.innerHTML = `
        <div style="direction:rtl;text-align:right">
            <span style="color:#888">🎤 Didengar:</span>
            <span style="color:#333;font-size:11px;font-family:'Amiri Quran',serif"> ${heardClean || '—'}</span>
        </div>
        <div style="direction:ltr;text-align:left;margin-top:2px">
            <span style="color:#888">Cocok: </span>
            <b style="color:${passed?'#16a34a':'#dc2626'}">${matched}/${expWords.length} kata (${pct}%)</b>
            &nbsp;·&nbsp; sim: ${simPct}%
            ${isMuq ? '&nbsp;·&nbsp;<span style="color:#8b5cf6">muqatta\'at</span>' : ''}
            &nbsp;·&nbsp; ${statusIcon} ${passed ? '<b style="color:#16a34a">LULUS</b>' : '<b style="color:#dc2626">GAGAL</b>'}
        </div>
    `;
    // Auto-hide setelah 4 detik
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// Cek apakah ayat saat ini adalah SELURUHNYA muqatta'at (misal: الم، يس، طه، حم، ص، ق، ن)
function isMuqattaatOnlyAyah() {
    const a = ayahsData[currentPlayIndex];
    if (!a) return false;
    const norm = normalizeArabic(a.text).trim();
    return Object.keys(MUQATTAAT_WORDS).includes(norm);
}

function handleTasmiResult(transcript) {
    const a = ayahsData[currentPlayIndex];
    if (!a) return;

    const expWords = getExpWords();
    if (!expWords.length) { advanceTasmi(); return; }

    let gotWords = getGotWords(transcript);
    if (!gotWords.length) return;

    // ── Bismillah opsional di awal surah ──────────────────────────────────────
    if (isBismillahAyah()) {
        const bismWords = expandMuqattaat(normalizeArabic(BISMILLAH_TEXT)).split(' ').filter(Boolean);
        const { matched: bMatch } = matchWords(bismWords, gotWords.slice(0, bismWords.length + 2));
        if (bMatch >= Math.ceil(bismWords.length * 0.6)) {
            gotWords = gotWords.slice(bMatch);
        }
        if (!gotWords.length) return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Jalur khusus: ayat muqatta'at (الم، يس، طه، حم، ص، ق، ن, dll) ────────
    if (isMuqattaatOnlyAyah()) {
        const rawNorm = normalizeArabic(transcript);
        const ayahNorm = normalizeArabic(a.text).trim();
        const directMatch = Object.keys(MUQATTAAT_WORDS).some(variant => {
            const varLetters = MUQATTAAT_WORDS[variant];
            if (JSON.stringify(varLetters) !== JSON.stringify(expWords)) return false;
            return rawNorm.includes(normalizeArabic(variant));
        });
        const { matched, totalSim } = matchWords(expWords, gotWords, 0.55);
        const ratio  = expWords.length ? matched / expWords.length : 0;
        const avgSim = matched ? totalSim / matched : 0;
        const wordMatch = ratio >= 0.45 && avgSim >= 0.55;
        const passed = directMatch || wordMatch;
        showTasmiDebug(normalizeArabic(transcript), expWords, gotWords, matched, ratio, avgSim, passed, true);
        if (passed) {
            triggerCorrect();
            setTimeout(() => advanceTasmi(), 150);
        } else {
            triggerError();
        }
        return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    const { matched, totalSim } = matchWords(expWords, gotWords);
    const matchRatio = matched / expWords.length;
    const shortAyah  = expWords.length <= 5;
    const avgSim     = matched ? totalSim / matched : 0;

    // Threshold: ayat pendek (≤5 kata) → ≥65% & avgSim ≥62%;
    //            ayat panjang          → ≥60% & avgSim ≥60%
    // Seimbang: tidak mudah alarm tapi kesalahan nyata tetap terdeteksi
    const passed = shortAyah
        ? (matchRatio >= 0.65 && avgSim >= 0.62)
        : (matchRatio >= 0.60 && avgSim >= 0.60);

    showTasmiDebug(normalizeArabic(transcript), expWords, gotWords, matched, matchRatio * expWords.length | 0, avgSim, passed, false);

    if (passed) {
        triggerCorrect();
        setTimeout(() => advanceTasmi(), 150);
    } else {
        // Alarm hanya jika cooldown sudah lewat (3 detik) agar tidak bertubi-tubi
        const now = Date.now();
        if (!_lastAlarmTime || now - _lastAlarmTime > 3000) {
            _lastAlarmTime = now;
            triggerError();
        }
    }
}

function advanceTasmi() {
    currentPlayIndex++;
    if (currentPlayIndex < ayahsData.length) {
        highlightWords(currentPlayIndex);
        scrollToAyah(currentPlayIndex);
        updateTasmiProgressUI();
    } else {
        toggleTasmiMode();
    }
}
function triggerCorrect() {
    // Flash hijau pada elemen ayat yang sedang aktif
    document.querySelectorAll('.char-active').forEach(el => el.classList.add('tasmi-correct'));
    setTimeout(() => document.querySelectorAll('.tasmi-correct').forEach(el => el.classList.remove('tasmi-correct')), 1100);
}
function triggerError() {
    document.querySelectorAll('.char-active').forEach(el => el.classList.add('tasmi-error'));
    // Alarm — gunakan AudioContext yang sudah dibuat saat user gesture
    try {
        const ctx = _tasmiAudioCtx;
        if (!ctx) throw new Error('no ctx');
        if (ctx.state === 'suspended') ctx.resume();
        function beep(startTime, freq, dur) {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0.0, startTime);
            gain.gain.linearRampToValueAtTime(1.0, startTime + 0.01);
            gain.gain.setValueAtTime(1.0, startTime + dur - 0.02);
            gain.gain.linearRampToValueAtTime(0.0, startTime + dur);
            osc.start(startTime);
            osc.stop(startTime + dur);
        }
        const t = ctx.currentTime;
        beep(t + 0.00, 1200, 0.12);
        beep(t + 0.18, 1400, 0.12);
        beep(t + 0.36, 1600, 0.16);
    } catch(e) {
        // Fallback: Audio element dengan data URI
        try {
            const a = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAA"
                + "AAAQABAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAA");
            a.play().catch(()=>{});
        } catch(e2) {}
    }
    setTimeout(() => document.querySelectorAll('.tasmi-error').forEach(el => el.classList.remove('tasmi-error')), 1500);
}

// Nudge halus — satu beep lembut (sine, volume rendah).
// Dipakai saat user "stuck" (partial terlalu lama diam) agar ada feedback
// tanpa membuat panik seperti triggerError.
function triggerNudge() {
    document.querySelectorAll('.char-active').forEach(el => el.classList.add('tasmi-nudge'));
    setTimeout(() => document.querySelectorAll('.tasmi-nudge').forEach(el => el.classList.remove('tasmi-nudge')), 900);
    try {
        const ctx = _tasmiAudioCtx;
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.30, ctx.currentTime + 0.02);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.45);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.45);
    } catch(e) {}
}

// =============================================
// MODAL LOOP
// =============================================
function openLoopModal() {
    if (!ayahsData.length) return;
    const startSel = document.getElementById('loopStartSel');
    const endSel   = document.getElementById('loopEndSel');
    const prevStart = startSel.value;
    const prevEnd   = endSel.value;
    const opts = ayahsData.map((a, i) =>
        a._overflow ? '' : `<option value="${i}">${a.surah.name} ${a.numberInSurah} (Hal.${a.page})</option>`
    ).join('');
    startSel.innerHTML = opts;
    endSel.innerHTML   = opts;
    if (prevStart !== '') {
        startSel.value = prevStart;
        endSel.value   = prevEnd;
    } else {
        startSel.value = currentPlayIndex;
        endSel.value   = Math.min(currentPlayIndex + 4, ayahsData.length - 1);
    }
    document.getElementById('loopModal').classList.add('visible');
}
function closeLoopModal() {
    document.getElementById('loopModal').classList.remove('visible');
}
function startLoop() {
    loopStart = parseInt(document.getElementById('loopStartSel').value);
    loopEnd   = parseInt(document.getElementById('loopEndSel').value);
    loopMax   = parseInt(document.getElementById('loopMaxRange').value);
    if (loopStart > loopEnd) [loopStart, loopEnd] = [loopEnd, loopStart];
    loopCount  = 0; isLoopMode = true; isPlayingAll = false;
    closeLoopModal();
    const aS = ayahsData[loopStart];
    const aE = ayahsData[loopEnd];
    const rangeLabel = loopStart === loopEnd ? `${aS.surah.name} ${aS.numberInSurah}` : `${aS.surah.name} ${aS.numberInSurah}–${aE.numberInSurah}`;
    const btn = document.getElementById('loopBtn');
    btn.innerHTML = `<i class="fa-solid fa-repeat"></i><span class="btn-label-long"> ${rangeLabel}</span>`;
    btn.classList.add('active');
    currentPlayIndex = loopStart;
    playAyah(currentPlayIndex, true);
}
function stopLoop() {
    isLoopMode = false; loopCount = 0;
    closeLoopModal(); stopAudio();
    const btn = document.getElementById('loopBtn');
    btn.innerHTML = `<i class="fa-solid fa-repeat"></i><span class="btn-label-long"> Loop</span>`;
    btn.classList.remove('active');
}

// =============================================
// MODAL SETOR HAFALAN
// =============================================
function openTasmiModal() {
    if (isTasmiMode) { toggleTasmiMode(); return; }
    if (!ayahsData.length) return;
    // Populate surah selector based on active juz
    const surahSel = document.getElementById('tasmiSurahSel');
    const uniqueSurahs = [...new Map(ayahsData.map(a => [a.surah.number, a.surah])).values()];
    surahSel.innerHTML = uniqueSurahs.map(s =>
        `<option value="${s.number}">${s.englishName || s.name} (${s.number})</option>`
    ).join('');
    const pages = [...new Set(ayahsData.map(a => a.page))].sort((a,b)=>a-b);
    const pageSel = document.getElementById('tasmiPageSel');
    pageSel.innerHTML = pages.map(p => `<option value="${p}">Halaman ${p}</option>`).join('');
    updateTasmiAyahOptions();
    updateTasmiSelectedInfo();
    document.getElementById('tasmiModal').classList.add('visible');
}
function closeTasmiModal() {
    document.getElementById('tasmiModal').classList.remove('visible');
}
function updateTasmiAyahOptions() {
    const surahNum = parseInt(document.getElementById('tasmiSurahSel').value);
    const ayahsInSurah = ayahsData.filter(a => a.surah.number === surahNum);
    const sel = document.getElementById('tasmiAyahSel');
    sel.innerHTML = ayahsInSurah.map(a =>
        `<option value="${ayahsData.indexOf(a)}">Ayat ${a.numberInSurah}</option>`
    ).join('');
    syncTasmiFromSurahAyah();
}
function syncTasmiFromSurahAyah() {
    const idx = parseInt(document.getElementById('tasmiAyahSel').value);
    if (!isNaN(idx)) { tasmiStartIndex = idx; updateTasmiSelectedInfo(); }
}
function syncTasmiFromPage() {
    const page = parseInt(document.getElementById('tasmiPageSel').value);
    const idx = ayahsData.findIndex(a => a.page === page);
    if (idx >= 0) {
        tasmiStartIndex = idx;
        const a = ayahsData[idx];
        document.getElementById('tasmiSurahSel').value = a.surah.number;
        updateTasmiAyahOptions();
        document.getElementById('tasmiAyahSel').value = idx;
        updateTasmiSelectedInfo();
    }
}
function updateTasmiSelectedInfo() {
    const box  = document.getElementById('tasmiSelectedInfo');
    const text = document.getElementById('tasmiSelectedText');
    if (tasmiStartIndex >= 0 && ayahsData[tasmiStartIndex]) {
        const a = ayahsData[tasmiStartIndex];
        text.textContent = `Mulai dari ${a.surah.name} Ayat ${a.numberInSurah} (Hal. ${a.page})`;
        box.classList.add('visible');
    }
}
function startTasmiFromModal() {
    const selIdx = parseInt(document.getElementById('tasmiAyahSel').value);
    if (!isNaN(selIdx)) tasmiStartIndex = selIdx;
    tasmiSpeedMode = document.getElementById('tasmiSpeedToggle')?.checked || false;
    closeTasmiModal();
    activateTasmi();
}
// Animasi knob toggle mode cepat
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('tasmiSpeedToggle');
    const knob   = document.getElementById('tasmiSpeedKnob');
    const track  = document.getElementById('tasmiSpeedTrack');
    if (toggle && knob && track) {
        toggle.addEventListener('change', () => {
            knob.style.transform = toggle.checked ? 'translateX(18px)' : 'translateX(0)';
            track.style.background = toggle.checked ? 'var(--accent-teal)' : 'rgba(0,0,0,0.15)';
        });
    }
});
function setTasmiStartFromClick(gIdx) {
    tasmiStartIndex = gIdx;
    const a = ayahsData[gIdx];
    if (document.getElementById('tasmiModal').classList.contains('visible')) {
        document.getElementById('tasmiSurahSel').value = a.surah.number;
        updateTasmiAyahOptions();
        document.getElementById('tasmiAyahSel').value = gIdx;
        tasmiStartIndex = gIdx;
        updateTasmiSelectedInfo();
    }
}

// =============================================
// MODAL LOOP — SELECT MODE
// =============================================
function activateSelectMode(target) {
    selectMode = target;
    document.getElementById('loopModal').classList.remove('visible');
    document.getElementById('tasmiModal').classList.remove('visible');
    const banner = document.getElementById('selectModeBanner');
    const bannerText = document.getElementById('selectModeBannerText');
    const labels = {
        'loop-start': '⟳ Ketuk ayat sebagai AWAL loop',
        'loop-end':   '⟳ Ketuk ayat sebagai AKHIR loop',
        'tasmi':      '🎤 Ketuk ayat pertama yang akan disetorkan',
    };
    bannerText.textContent = labels[target] || 'Ketuk ayat...';
    banner.classList.add('visible');
    document.body.classList.add('select-mode');
}
function cancelSelectMode() {
    selectMode = null;
    document.getElementById('selectModeBanner').classList.remove('visible');
    document.body.classList.remove('select-mode');
}
function handleSelectModeClick(gIdx) {
    if (!selectMode) return false;
    const target = selectMode;
    const a = ayahsData[gIdx];
    cancelSelectMode();
    if (target === 'loop-start' || target === 'loop-end') {
        openLoopModal();
        if (target === 'loop-start') {
            document.getElementById('loopStartSel').value = gIdx;
            showToast(`⟳ Awal loop: ${a.surah.name} ${a.numberInSurah}`);
        } else {
            document.getElementById('loopEndSel').value = gIdx;
            showToast(`⟳ Akhir loop: ${a.surah.name} ${a.numberInSurah}`);
        }
    } else if (target === 'tasmi') {
        openTasmiModal();
        setTasmiStartFromClick(gIdx);
        showToast(`🎤 Mulai dari: ${a.surah.name} ${a.numberInSurah}`);
    }
    return true;
}

// =============================================
// PROGRESS HAFALAN
// =============================================
const HAFALAN_KEY      = 'elfashih_hafalan';
const HAFALAN_STATUSES = ['belum', 'proses', 'lancar'];
const HAFALAN_LABELS   = { belum: '⬜ Belum', proses: '🔶 Proses', lancar: '✅ Lancar' };

function getHafalanAll() {
    try { return JSON.parse(localStorage.getItem(HAFALAN_KEY) || '{}'); } catch { return {}; }
}
function hafalanKey(surah, ayah) { return `${surah}:${ayah}`; }
function getHafalanStatus(surah, ayah) {
    return getHafalanAll()[hafalanKey(surah, ayah)] || 'belum';
}
function setHafalanStatus(surah, ayah, status) {
    const all = getHafalanAll();
    if (status === 'belum') delete all[hafalanKey(surah, ayah)];
    else all[hafalanKey(surah, ayah)] = status;
    localStorage.setItem(HAFALAN_KEY, JSON.stringify(all));

    // Auto-sync ke Leitner (murojaah) — digabung langsung di sini,
    // BUKAN via wrapper redeclare nama fungsi yang sama (itu penyebab
    // bug infinite recursion / Maximum call stack size exceeded).
    if (typeof leitnerKey === 'function' && typeof getLeitnerAll === 'function') {
        const k = leitnerKey(surah, ayah);
        const leitner = getLeitnerAll();
        if ((status === 'proses' || status === 'lancar') && !leitner[k]) {
            leitner[k] = { box: 1, lastReview: null };
            saveLeitnerAll(leitner);
            if (typeof updateMurojaahTopBadge === 'function') updateMurojaahTopBadge();
            if (typeof updateDashMurojaah === 'function') updateDashMurojaah();
        } else if (status === 'belum' && leitner[k]) {
            // Optionally remove from Leitner when reset to belum
            delete leitner[k];
            saveLeitnerAll(leitner);
            if (typeof updateMurojaahTopBadge === 'function') updateMurojaahTopBadge();
            if (typeof updateDashMurojaah === 'function') updateDashMurojaah();
        }
    }
}
function cycleHafalanStatus(surah, ayah) {
    const cur = getHafalanStatus(surah, ayah);
    const next = HAFALAN_STATUSES[(HAFALAN_STATUSES.indexOf(cur) + 1) % HAFALAN_STATUSES.length];
    setHafalanStatus(surah, ayah, next);
    return next;
}

// Hitung stats dari array ayat
function calcStats(ayats) {
    let nL = 0, nP = 0;
    ayats.forEach(a => {
        const s = getHafalanStatus(a.surah.number, a.numberInSurah);
        if (s === 'lancar') nL++;
        else if (s === 'proses') nP++;
    });
    return { lancar: nL, proses: nP, belum: ayats.length - nL - nP, total: ayats.length };
}

function handleHafalanBtnClick(e, surah, ayah) {
    e.stopPropagation();
    const next = cycleHafalanStatus(surah, ayah);
    document.querySelectorAll(`.hafalan-btn[data-surah="${surah}"][data-ayah="${ayah}"]`).forEach(btn => {
        btn.className = `hafalan-btn ${next}`;
        const txt = btn.querySelector('.hbtn-text');
        if (txt) txt.textContent = HAFALAN_LABELS[next];
    });
    updateMushafHafalanDot(surah, ayah, next);
    const msgs = { belum: `⬜ Ayat ${ayah}: Belum dihafal`, proses: `🔶 Ayat ${ayah}: Sedang proses`, lancar: `✅ Ayat ${ayah}: Sudah lancar` };
    showToast(msgs[next]);
}

function injectMushafHafalanDots() {
    document.querySelectorAll('.quran-madina-html-ayah-num').forEach(numEl => {
        for (const cls of numEl.classList) {
            const m = cls.match(/^quran-madina-html-(\d{3})-(\d{3})$/);
            if (m) {
                const s = parseInt(m[1]), a = parseInt(m[2]);
                const st = getHafalanStatus(s, a);
                if (st !== 'belum') numEl.setAttribute('data-hafalan', st);
                else numEl.removeAttribute('data-hafalan');
                // Tandai awal juz
                if (isJuzStart(s, a)) {
                    numEl.setAttribute('data-juz-start', getJuzNumFromStart(s, a));
                    numEl.title = `Awal Juz ${getJuzNumFromStart(s, a)}`;
                } else {
                    numEl.removeAttribute('data-juz-start');
                }
                break;
            }
        }
    });
}

// Observer global — pantau terus kemunculan ayah-num baru dari web component
(function startJuzStartObserver() {
    const globalObs = new MutationObserver(mutations => {
        mutations.forEach(mut => {
            mut.addedNodes.forEach(node => {
                if (!node.querySelectorAll) return;
                node.querySelectorAll('.quran-madina-html-ayah-num').forEach(numEl => {
                    for (const cls of numEl.classList) {
                        const m = cls.match(/^quran-madina-html-(\d{3})-(\d{3})$/);
                        if (m) {
                            const s = parseInt(m[1]), a = parseInt(m[2]);
                            if (isJuzStart(s, a)) {
                                numEl.setAttribute('data-juz-start', getJuzNumFromStart(s, a));
                                numEl.title = `Awal Juz ${getJuzNumFromStart(s, a)}`;
                            }
                            break;
                        }
                    }
                });
                if (node.classList && node.classList.contains('quran-madina-html-ayah-num')) {
                    for (const cls of node.classList) {
                        const m = cls.match(/^quran-madina-html-(\d{3})-(\d{3})$/);
                        if (m) {
                            const s = parseInt(m[1]), a = parseInt(m[2]);
                            if (isJuzStart(s, a)) {
                                node.setAttribute('data-juz-start', getJuzNumFromStart(s, a));
                                node.title = `Awal Juz ${getJuzNumFromStart(s, a)}`;
                            }
                            break;
                        }
                    }
                }
            });
        });
    });
    // Scope ke mushafView saja — bukan seluruh document.body
    function attachGlobalObs() {
        const target = document.getElementById('mushafView') || document.body;
        globalObs.observe(target, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachGlobalObs);
    } else {
        attachGlobalObs();
    }
}());

function updateMushafHafalanDot(surah, ayah, status) {
    document.querySelectorAll('.quran-madina-html-ayah-num').forEach(numEl => {
        for (const c of numEl.classList) {
            const m = c.match(/^quran-madina-html-(\d{3})-(\d{3})$/);
            if (m && parseInt(m[1]) === surah && parseInt(m[2]) === ayah) {
                if (status !== 'belum') numEl.setAttribute('data-hafalan', status);
                else numEl.removeAttribute('data-hafalan');
                break;
            }
        }
    });
}

// ---- PROGRESS MODAL STATE ----
let progressGroupBy = 'ayat';   // 'ayat' | 'surah' | 'juz' | 'halaman'
let progressFilter  = 'all';    // 'all' | 'belum' | 'proses' | 'lancar'

function openProgressModal() {
    refreshProgressStats();
    renderProgressList();
    document.getElementById('progressModal').classList.add('visible');
}
function closeProgressModal() {
    document.getElementById('progressModal').classList.remove('visible');
}

function refreshProgressStats() {
    const st = calcStats(ayahsData);
    const T = st.total || 1;
    document.getElementById('pstatLancar').textContent = st.lancar;
    document.getElementById('pstatProses').textContent = st.proses;
    document.getElementById('pstatBelum').textContent  = st.belum;
    document.getElementById('barLancar').style.width = (st.lancar / T * 100).toFixed(1) + '%';
    document.getElementById('barProses').style.width = (st.proses / T * 100).toFixed(1) + '%';
    document.getElementById('barBelum').style.width  = (st.belum  / T * 100).toFixed(1) + '%';
    document.getElementById('barLabelLancar').textContent = `✅ Lancar: ${st.lancar}`;
    document.getElementById('barLabelProses').textContent = `🔶 Proses: ${st.proses}`;
    document.getElementById('barLabelBelum').textContent  = `⬜ Belum: ${st.belum}`;
}

function setProgressGroup(g) {
    progressGroupBy = g;
    ['ayat','surah','juz','halaman'].forEach(k => {
        document.getElementById(`pgtab-${k}`).classList.toggle('active', k === g);
    });
    document.getElementById('progressFilterRow').style.display = (g === 'ayat') ? 'flex' : 'none';
    renderProgressList();
}

function setProgressFilter(f) {
    progressFilter = f;
    ['all','belum','proses','lancar'].forEach(k => {
        document.getElementById(`pf-${k}`).classList.toggle('active', k === f);
    });
    renderProgressList();
}

function renderProgressList() {
    const area = document.getElementById('progressListArea');
    if (progressGroupBy === 'ayat')         area.innerHTML = renderByAyat();
    else if (progressGroupBy === 'surah')   area.innerHTML = renderByGroup('surah');
    else if (progressGroupBy === 'juz')     area.innerHTML = renderByGroup('juz');
    else if (progressGroupBy === 'halaman') area.innerHTML = renderByGroup('halaman');
}

// --- PER AYAT ---
function renderByAyat() {
    const base = ayahsData.filter(a => !a._overflow);
    const list = progressFilter === 'all'
        ? base
        : base.filter(a => getHafalanStatus(a.surah.number, a.numberInSurah) === progressFilter);
    if (!list.length) return '<div class="progress-empty">Tidak ada ayat dengan status ini.</div>';
    return list.map(a => {
        const s = a.surah.number, ay = a.numberInSurah;
        const st = getHafalanStatus(s, ay);
        return `<div class="progress-ayah-item">
            <div class="pai-dot ${st}"></div>
            <div class="pai-label">${a.surah.name} : ${ay} <span style="color:var(--text-muted);font-size:10px"> Hal.${a.page}</span></div>
            <button class="pai-btn ${st}" onclick="cycleFromList(${s},${ay},this,'pai-btn','pai-dot')">${HAFALAN_LABELS[st]}</button>
        </div>`;
    }).join('');
}

// --- PER SURAH / JUZ / HALAMAN ---
function renderByGroup(mode) {
    const groupMap = {};
    ayahsData.forEach(a => {
        if (a._overflow) return; // skip ayat pelengkap halaman
        let key, label, sub;
        if (mode === 'surah') {
            key = a.surah.number;
            label = a.surah.name;
            sub = a.surah.englishName + ' · ' + a.surah.numberOfAyahs + ' ayat';
        } else if (mode === 'juz') {
            key = a.juz || activeJuz;
            label = 'Juz ' + key;
            sub = '';
        } else {
            key = a.page;
            label = 'Halaman ' + a.page;
            sub = 'Juz ' + (a.juz || activeJuz);
        }
        if (!groupMap[key]) groupMap[key] = { key, label, sub, ayats: [] };
        groupMap[key].ayats.push(a);
    });

    const groups = Object.values(groupMap).sort((a,b) => a.key - b.key);
    if (!groups.length) return '<div class="progress-empty">Tidak ada data.</div>';

    return groups.map(g => {
        const st = calcStats(g.ayats);
        const T  = st.total || 1;
        const pctDone = Math.round((st.lancar + st.proses) / T * 100);

        const subItems = g.ayats.map(a => {
            const s2 = a.surah.number, ay2 = a.numberInSurah;
            const st2 = getHafalanStatus(s2, ay2);
            const sublabel = mode === 'surah' ? ('Ayat ' + ay2) : (a.surah.name + ' : ' + ay2);
            return `<div class="pgroup-sub-item">
                <div class="pai-dot ${st2}" style="width:7px;height:7px;flex-shrink:0"></div>
                <div class="pgroup-sub-label">${sublabel}</div>
                <button class="pgroup-sub-btn ${st2}" onclick="cycleFromList(${s2},${ay2},this,'pgroup-sub-btn','pai-dot')">${HAFALAN_LABELS[st2]}</button>
            </div>`;
        }).join('');

        return `<div class="pgroup-card" data-gkey="${g.key}" data-gmode="${mode}" onclick="toggleGroupCard(event,this)">
            <div class="pgroup-card-header">
                <div>
                    <div class="pgroup-card-title">${g.label}</div>
                    ${g.sub ? '<div class="pgroup-card-sub">' + g.sub + '</div>' : ''}
                </div>
                <div style="text-align:right">
                    <div class="pgroup-card-pct">${pctDone}%</div>
                    <div style="font-size:9px;color:var(--text-muted)">${st.total} ayat</div>
                </div>
            </div>
            <div class="mini-bar">
                <div class="mb-lancar" style="flex:${st.lancar || 0}"></div>
                <div class="mb-proses" style="flex:${st.proses || 0}"></div>
                <div class="mb-belum"  style="flex:${st.belum  || 1}"></div>
            </div>
            <div class="pgroup-card-counts">
                <span class="pgcc lancar">✅ ${st.lancar}</span>
                <span class="pgcc proses">🔶 ${st.proses}</span>
                <span class="pgcc belum">⬜ ${st.belum}</span>
            </div>
            <div class="pgroup-expanded">${subItems}</div>
        </div>`;
    }).join('');
}

function toggleGroupCard(e, card) {
    if (e.target.closest('button') && !e.target.closest('.pgroup-card-header') && !e.target.closest('.mini-bar') && !e.target.closest('.pgroup-card-counts')) return;
    card.classList.toggle('open');
}

function cycleFromList(surah, ayah, btn, btnClass, dotClass) {
    const next = cycleHafalanStatus(surah, ayah);
    btn.className = btnClass + ' ' + next;
    btn.textContent = HAFALAN_LABELS[next];
    const row = btn.closest('.progress-ayah-item, .pgroup-sub-item');
    if (row) { const dot = row.querySelector('.' + dotClass); if (dot) dot.className = dotClass + ' ' + next; }
    document.querySelectorAll(`.hafalan-btn[data-surah="${surah}"][data-ayah="${ayah}"]`).forEach(b => {
        b.className = `hafalan-btn ${next}`;
        const t = b.querySelector('.hbtn-text'); if (t) t.textContent = HAFALAN_LABELS[next];
    });
    updateMushafHafalanDot(surah, ayah, next);
    refreshProgressStats();
    if (progressGroupBy === 'ayat' && progressFilter !== 'all' && next !== progressFilter) {
        row && row.remove();
        const area = document.getElementById('progressListArea');
        if (area && !area.querySelector('.progress-ayah-item'))
            area.innerHTML = '<div class="progress-empty">Tidak ada ayat dengan status ini.</div>';
    }
    if (progressGroupBy !== 'ayat') {
        const card = btn.closest('.pgroup-card');
        if (card) refreshGroupCard(card);
    }
}

function refreshGroupCard(card) {
    const mode = card.dataset.gmode;
    const key  = parseInt(card.dataset.gkey);
    const grpAyats = ayahsData.filter(a => {
        if (mode === 'surah')   return a.surah.number === key;
        if (mode === 'juz')     return (a.juz || activeJuz) === key;
        if (mode === 'halaman') return a.page === key;
        return false;
    });
    const st = calcStats(grpAyats);
    const T  = st.total || 1;
    const pctDone = Math.round((st.lancar + st.proses) / T * 100);
    const pct = card.querySelector('.pgroup-card-pct');
    if (pct) pct.textContent = pctDone + '%';
    const counts = card.querySelector('.pgroup-card-counts');
    if (counts) counts.innerHTML =
        '<span class="pgcc lancar">✅ ' + st.lancar + '</span>' +
        '<span class="pgcc proses">🔶 ' + st.proses + '</span>' +
        '<span class="pgcc belum">⬜ ' + st.belum + '</span>';
    const bar = card.querySelector('.mini-bar');
    if (bar) bar.innerHTML =
        '<div class="mb-lancar" style="flex:' + (st.lancar||0) + '"></div>' +
        '<div class="mb-proses" style="flex:' + (st.proses||0) + '"></div>' +
        '<div class="mb-belum"  style="flex:' + (st.belum||1)  + '"></div>';
}

function resetProgressHafalan() {
    if (!confirm('Reset semua progress hafalan? Data tidak dapat dikembalikan.')) return;
    localStorage.removeItem(HAFALAN_KEY);
    document.querySelectorAll('.hafalan-btn').forEach(btn => {
        btn.className = 'hafalan-btn belum';
        const txt = btn.querySelector('.hbtn-text');
        if (txt) txt.textContent = HAFALAN_LABELS['belum'];
    });
    document.querySelectorAll('.quran-madina-html-ayah-num[data-hafalan]').forEach(el => el.removeAttribute('data-hafalan'));
    refreshProgressStats();
    renderProgressList();
    showToast('🔄 Progress hafalan direset');
}
// =============================================
// TOAST
// =============================================
let toastTimer = null;
function showToast(msg) {
    const el = document.getElementById('toastEl');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// =============================================
// PAGE INDICATOR
// =============================================
function initScrollPageIndicator() {
    const container = document.getElementById('mainContainer');
    const indicator = document.getElementById('pageIndicator');
    let hideTimer;
    container.addEventListener('scroll', () => {
        if (viewMode !== 'mushaf') return;
        let visiblePage = null;
        document.querySelectorAll('.mushaf-page-card').forEach(p => {
            const rect = p.getBoundingClientRect();
            if (rect.top < window.innerHeight * 0.6 && rect.bottom > 0) visiblePage = p.dataset.page;
        });
        if (visiblePage) {
            indicator.textContent = `Halaman ${visiblePage}`;
            indicator.classList.add('visible');
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => indicator.classList.remove('visible'), 1500);
        }
    });
}

// =============================================
// UTILS
// =============================================
function toArabicNum(n) {
    return n.toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

// =============================================
// FITUR 1: PAPER MODE (Mushaf Kertas Asli)
// =============================================
let isPaperMode = false;
function togglePaperMode() {
    isPaperMode = !isPaperMode;
    document.body.classList.toggle('paper-mode', isPaperMode);
    const btn = document.getElementById('paperModeBtn');
    btn.classList.toggle('active', isPaperMode);
    btn.title = isPaperMode ? 'Mode Gelap' : 'Mode Kertas';
    btn.innerHTML = isPaperMode
        ? '<i class="fa-solid fa-moon"></i>'
        : '<i class="fa-solid fa-sun"></i>';
    localStorage.setItem('paperMode', isPaperMode ? '1' : '0');
    showToast(isPaperMode ? '☀️ Mode Kertas aktif' : '🌙 Mode Gelap aktif');
}
// Restore paper mode on load
(function() {
    if (localStorage.getItem('paperMode') === '1') {
        isPaperMode = true;
        document.body.classList.add('paper-mode');
        const btn = document.getElementById('paperModeBtn');
        if (btn) { btn.classList.add('active'); btn.innerHTML = '<i class="fa-solid fa-moon"></i>'; }
    }
})();

// =============================================
// FITUR 2: REKAM SENDIRI & CEK SENDIRI
// =============================================
let mediaRecorder = null;
let recChunks = [];
let recStartTime = null;
let recTimerInterval = null;
let lastRecordingBlob = null;
let recPlayingNow = false;
let savedRecordings = JSON.parse(localStorage.getItem('elfashih_recordings') || '[]');
// Simpan hanya metadata, audio blob disimpan di indexedDB-like approach via object URL (session only)
let recBlobStore = {}; // id -> blob (session)

// ---- Pre-warm mic stream untuk meminimalkan latency rekam ----
let _prewarmStream = null;
async function _prewarmMic() {
    if (_prewarmStream) return; // sudah pre-warm
    try {
        _prewarmStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        // Biarkan stream hidup tapi tidak direkam — hanya untuk pre-authorize mic
    } catch(e) { /* izin belum diberikan, akan diminta saat startRecord */ }
}

function openRecordModal() {
    renderRecList();
    document.getElementById('recordModal').classList.add('visible');
    // Pre-warm mic di background agar rekam langsung jalan tanpa jeda izin
    _prewarmMic();
}
function closeRecordModal() {
    document.getElementById('recordModal').classList.remove('visible');
    if (mediaRecorder && mediaRecorder.state === 'recording') stopRecord();
    stopRecPlayback();
    // Hentikan prewarm stream
    if (_prewarmStream) {
        _prewarmStream.getTracks().forEach(t => t.stop());
        _prewarmStream = null;
    }
}

async function toggleRecord() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecord();
    } else {
        await startRecord();
    }
}

async function startRecord() {
    try {
        // Gunakan prewarm stream kalau sudah tersedia (tidak ada jeda izin)
        let stream = _prewarmStream;
        _prewarmStream = null; // ambil kepemilikan
        if (!stream || stream.getTracks().some(t => t.readyState === 'ended')) {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
        recChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            lastRecordingBlob = new Blob(recChunks, { type: 'audio/webm' });
            document.getElementById('recBtnPlay').disabled = false;
            document.getElementById('recBtnSave').disabled = false;
            document.getElementById('recStatus').textContent = `✅ Rekaman selesai — ${fmtRecTime(Date.now() - recStartTime)}`;
        };
        // Mulai rekam LANGSUNG — timeslice 100ms agar data tersedia cepat
        mediaRecorder.start(100);
        recStartTime = Date.now();
        startRecTimer();
        startWaveform(stream);

        const btn = document.getElementById('recBtnRecord');
        btn.classList.add('recording');
        document.getElementById('recBtnIcon').className = 'fa-solid fa-stop';
        document.getElementById('recBtnLabel').textContent = 'Berhenti';
        document.getElementById('recStatus').textContent = '🔴 Sedang merekam...';
        document.getElementById('recBtnPlay').disabled = true;
        document.getElementById('recBtnSave').disabled = true;
    } catch(err) {
        showToast('Gagal akses mikrofon: ' + err.message);
    }
}

function stopRecord() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    clearInterval(recTimerInterval);
    stopWaveform();
    const btn = document.getElementById('recBtnRecord');
    btn.classList.remove('recording');
    document.getElementById('recBtnIcon').className = 'fa-solid fa-circle';
    document.getElementById('recBtnLabel').textContent = 'Rekam';
}

function startRecTimer() {
    recTimerInterval = setInterval(() => {
        const elapsed = Date.now() - recStartTime;
        document.getElementById('recTimer').textContent = fmtRecTime(elapsed);
    }, 100);
}
function fmtRecTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}

// Waveform visualizer
let waveAnimFrame = null;
let waveAnalyser = null;
let waveAudioCtx = null;
function startWaveform(stream) {
    waveAudioCtx = new AudioContext();
    waveAnalyser = waveAudioCtx.createAnalyser();
    waveAnalyser.fftSize = 64;
    const src = waveAudioCtx.createMediaStreamSource(stream);
    src.connect(waveAnalyser);
    const wf = document.getElementById('recWaveform');
    wf.innerHTML = '';
    const barCount = 24;
    for (let i = 0; i < barCount; i++) {
        const b = document.createElement('div');
        b.className = 'rec-bar';
        b.style.height = '4px';
        wf.appendChild(b);
    }
    const bars = wf.querySelectorAll('.rec-bar');
    const data = new Uint8Array(waveAnalyser.frequencyBinCount);
    function draw() {
        waveAnimFrame = requestAnimationFrame(draw);
        waveAnalyser.getByteFrequencyData(data);
        bars.forEach((bar, i) => {
            const val = data[i] || 0;
            bar.style.height = Math.max(4, val * 0.45) + 'px';
            bar.style.opacity = 0.4 + (val / 255) * 0.6;
        });
    }
    draw();
}
function stopWaveform() {
    if (waveAnimFrame) cancelAnimationFrame(waveAnimFrame);
    if (waveAudioCtx) { try { waveAudioCtx.close(); } catch(e) {} }
    waveAudioCtx = null; waveAnalyser = null;
    const wf = document.getElementById('recWaveform');
    if (wf) { wf.querySelectorAll('.rec-bar').forEach(b => { b.style.height = '4px'; b.style.opacity = '0.4'; }); }
}

function playLastRecording() {
    if (!lastRecordingBlob) return;
    stopRecPlayback();
    const url = URL.createObjectURL(lastRecordingBlob);
    const audio = document.getElementById('recPlayback');
    audio.src = url;
    audio.play();
    recPlayingNow = true;
    document.getElementById('recBtnPlay').innerHTML = '<i class="fa-solid fa-pause"></i> Putar';
    document.getElementById('recStatus').textContent = '▶️ Memutar rekaman...';
    audio.onended = () => {
        recPlayingNow = false;
        document.getElementById('recBtnPlay').innerHTML = '<i class="fa-solid fa-play"></i> Putar';
        document.getElementById('recStatus').textContent = '✅ Selesai diputar';
        URL.revokeObjectURL(url);
    };
}
function stopRecPlayback() {
    const audio = document.getElementById('recPlayback');
    audio.pause(); audio.src = '';
    recPlayingNow = false;
    const btn = document.getElementById('recBtnPlay');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-play"></i> Putar';
}

function saveRecording() {
    if (!lastRecordingBlob) return;
    const now = new Date();
    const label = prompt('Nama rekaman:', `Rekaman ${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'})}`);
    if (!label) return;
    const id = 'rec_' + Date.now();
    const meta = {
        id, label,
        duration: fmtRecTime(Date.now() - recStartTime),
        date: now.toISOString(),
        ayah: ayahsData[currentPlayIndex] ? `${ayahsData[currentPlayIndex].surah.name} ${ayahsData[currentPlayIndex].numberInSurah}` : '—'
    };
    recBlobStore[id] = lastRecordingBlob;
    savedRecordings.unshift(meta);
    // Save metadata only (blob can't persist to localStorage)
    try { localStorage.setItem('elfashih_recordings', JSON.stringify(savedRecordings.slice(0,20))); } catch(e) {}
    lastRecordingBlob = null;
    document.getElementById('recBtnSave').disabled = true;
    renderRecList();
    showToast('💾 Rekaman disimpan: ' + label);
}

function renderRecList() {
    const list = document.getElementById('recList');
    if (!savedRecordings.length) {
        list.innerHTML = '<div class="rec-status">Belum ada rekaman</div>';
        return;
    }
    list.innerHTML = savedRecordings.map(r => `
        <div class="rec-item">
            <div class="rec-item-info">
                <div class="rec-item-name">${r.label}</div>
                <div class="rec-item-meta">${r.ayah} · ${new Date(r.date).toLocaleDateString('id-ID')} · ${r.duration || '—'}</div>
            </div>
            ${recBlobStore[r.id] ? `<button class="rec-item-btn" onclick="playSavedRec('${r.id}')" title="Putar"><i class="fa-solid fa-play"></i></button>` : `<span class="rec-item-btn" title="Sesi habis, rekam ulang" style="opacity:.4;cursor:default"><i class="fa-solid fa-clock-rotate-left"></i></span>`}
            <button class="rec-item-btn del" onclick="deleteSavedRec('${r.id}')" title="Hapus"><i class="fa-solid fa-trash"></i></button>
        </div>
    `).join('');
}

function playSavedRec(id) {
    const blob = recBlobStore[id];
    if (!blob) { showToast('Audio hanya tersedia dalam sesi ini'); return; }
    stopRecPlayback();
    const url = URL.createObjectURL(blob);
    const audio = document.getElementById('recPlayback');
    audio.src = url;
    audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
    showToast('▶️ Memutar rekaman tersimpan');
}

function deleteSavedRec(id) {
    savedRecordings = savedRecordings.filter(r => r.id !== id);
    delete recBlobStore[id];
    try { localStorage.setItem('elfashih_recordings', JSON.stringify(savedRecordings)); } catch(e) {}
    renderRecList();
}

// =============================================
// REPEAT PER AYAT
// =============================================
function toggleRepeatAyah() {
    if (isRepeatAyah) {
        // Buka pilihan ulang jika sudah aktif → matikan
        isRepeatAyah = false;
        repeatAyahCount = 0;
        const btn = document.getElementById('repeatAyahBtn');
        btn.classList.remove('active');
        document.getElementById('repeatAyahLabel').textContent = 'Ulangi Ayat';
        showToast('🔁 Ulangi per ayat dinonaktifkan');
    } else {
        openRepeatAyahPicker();
    }
}
function openRepeatAyahPicker() {
    const counts = [2,3,5,7,10];
    const options = counts.map(n =>
        `<button onclick="setRepeatAyah(${n})" style="flex:1;padding:12px 0;border-radius:var(--radius-md);background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);font-size:16px;font-weight:700;cursor:pointer;font-family:var(--ui-font);transition:all .2s" onmouseover="this.style.borderColor='var(--accent-teal)'" onmouseout="this.style.borderColor='var(--border)'">${n}×</button>`
    ).join('');
    const panel = document.createElement('div');
    panel.id = 'repeatPicker';
    const isMobile = window.innerWidth <= 768;
    panel.style.cssText = 'position:fixed;bottom:'+(isMobile?'56px':'0')+';left:0;right:0;background:var(--bg-secondary);border-top:1px solid var(--border);border-radius:var(--radius-xl) var(--radius-xl) 0 0;padding:20px;z-index:450;box-shadow:0 -10px 40px rgba(0,0,0,0.6)';
    panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px"><i class="fa-solid fa-rotate-right" style="color:var(--accent-teal)"></i> Ulangi tiap ayat berapa kali?</div>
            <button onclick="document.getElementById('repeatPicker').remove()" style="width:28px;height:28px;border-radius:50%;background:var(--bg-card);border:1px solid var(--border);color:var(--text-muted);cursor:pointer;font-size:14px">×</button>
        </div>
        <div style="display:flex;gap:8px">${options}</div>
    `;
    document.body.appendChild(panel);
}
function setRepeatAyah(n) {
    isRepeatAyah = true;
    repeatAyahMax = n;
    repeatAyahCount = 0;
    const btn = document.getElementById('repeatAyahBtn');
    btn.classList.add('active');
    document.getElementById('repeatAyahLabel').textContent = `×${n}/ayat`;
    const picker = document.getElementById('repeatPicker');
    if (picker) picker.remove();
    showToast(`🔁 Setiap ayat diulang ${n}× aktif`);
}

// =============================================
// QARI
// =============================================
function openQariModal() {
    renderQariList();
    document.getElementById('qariModal').classList.add('visible');
}
function closeQariModal() {
    document.getElementById('qariModal').classList.remove('visible');
}
function renderQariList() {
    const list = document.getElementById('qariList');
    const groups = [...new Set(QARI_LIST.map(q => q.style))];
    let html = '';
    groups.forEach(group => {
        html += `<div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;padding:6px 2px 4px;">${group === 'Mujawwad' ? '✨ ' : '🎙\uFE0F '}${group}</div>`;
        QARI_LIST.filter(q => q.style === group).forEach(q => {
            html += `<div class="qari-item ${q.id === selectedQariId ? 'active' : ''}" onclick="selectQari('${q.id}')"><div class="qari-avatar">${q.icon}</div><div class="qari-info"><div class="qari-name">${q.name}</div><div class="qari-style">${q.style}</div></div><i class="fa-solid fa-circle-check qari-check"></i></div>`;
        });
    });
    list.innerHTML = html;
}
function selectQari(id) {
    selectedQariId = id;
    localStorage.setItem('elfashih_qari', id);
    // Stop audio agar src di-reload dengan qari baru
    getAudioPlayer().pause();
    getAudioPlayer().src = '';
    updatePlayerPlayIcon(false);
    closeQariModal();
    const q = QARI_LIST.find(x => x.id === id);
    showToast(`🎙️ Qari: ${q ? q.name : id}`);
}

// =============================================
// FITUR 3: JADWAL & PENGINGAT
// =============================================
let schedules = JSON.parse(localStorage.getItem('elfashih_schedules') || '[]');
let scheduleCheckInterval = null;
let selectedSchedType = 'tadarus';

function openScheduleModal() {
    checkNotifPermission();
    renderScheduleList();
    document.getElementById('scheduleModal').classList.add('visible');
}
function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.remove('visible');
}

function checkNotifPermission() {
    const banner = document.getElementById('notifPermBanner');
    if (!('Notification' in window)) {
        banner.classList.add('show');
        banner.innerHTML = '<i class="fa-solid fa-circle-xmark"></i><span>Browser tidak mendukung notifikasi</span>';
    } else if (Notification.permission === 'default') {
        banner.classList.add('show');
    } else if (Notification.permission === 'denied') {
        banner.classList.add('show');
        banner.innerHTML = '<i class="fa-solid fa-ban"></i><span>Notifikasi diblokir di pengaturan browser</span>';
    } else {
        banner.classList.remove('show');
    }
}

async function requestNotifPerm() {
    const result = await Notification.requestPermission();
    checkNotifPermission();
    if (result === 'granted') {
        showToast('🔔 Notifikasi diizinkan!');
        startScheduleChecker();
    }
}

function selectSchedType(btn) {
    document.querySelectorAll('.sched-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedSchedType = btn.dataset.type;
}

// Toggle hari di form
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sched-day-btn').forEach(btn => {
        btn.addEventListener('click', () => btn.classList.toggle('active'));
    });
});

function getSelectedDays() {
    return [...document.querySelectorAll('.sched-day-btn.active')].map(b => parseInt(b.dataset.day));
}

const dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const dayShort = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const typeEmoji = { tadarus:'📖', murojaah:'🔄', hafalan:'🧠' };
const typeLabel = { tadarus:'Tadarus', murojaah:'Murojaah', hafalan:'Hafalan' };

function addSchedule() {
    const time = document.getElementById('schedTime').value;
    if (!time) { showToast('Pilih jam terlebih dahulu'); return; }
    const days = getSelectedDays();
    if (!days.length) { showToast('Pilih minimal 1 hari'); return; }
    const sched = {
        id: 'sched_' + Date.now(),
        type: selectedSchedType,
        time,
        days,
        active: true
    };
    schedules.unshift(sched);
    saveSchedules();
    renderScheduleList();
    showToast(`🔔 Jadwal ${typeLabel[selectedSchedType]} ${time} ditambahkan!`);
    startScheduleChecker();
}

function saveSchedules() {
    try { localStorage.setItem('elfashih_schedules', JSON.stringify(schedules)); } catch(e) {}
}

function toggleScheduleActive(id) {
    const s = schedules.find(x => x.id === id);
    if (s) { s.active = !s.active; saveSchedules(); renderScheduleList(); }
}

function deleteSchedule(id) {
    schedules = schedules.filter(x => x.id !== id);
    saveSchedules();
    renderScheduleList();
}

function renderScheduleList() {
    const list = document.getElementById('scheduleList');
    if (!schedules.length) {
        list.innerHTML = '<div class="rec-status">Belum ada jadwal</div>';
        return;
    }
    list.innerHTML = schedules.map(s => {
        const daysStr = s.days.length === 7 ? 'Setiap hari' : s.days.map(d => dayShort[d]).join(', ');
        return `
        <div class="schedule-item">
            <div class="schedule-icon ${s.type}">${typeEmoji[s.type]}</div>
            <div class="schedule-item-info">
                <div class="schedule-item-name">${typeLabel[s.type]} — ${s.time}</div>
                <div class="schedule-item-days">${daysStr}</div>
            </div>
            <label class="schedule-toggle">
                <input type="checkbox" ${s.active ? 'checked' : ''} onchange="toggleScheduleActive('${s.id}')">
                <div class="schedule-toggle-track"></div>
            </label>
            <button class="schedule-del-btn" onclick="deleteSchedule('${s.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>`;
    }).join('');
}

// Cek jadwal setiap menit
function startScheduleChecker() {
    if (scheduleCheckInterval) return;
    scheduleCheckInterval = setInterval(checkSchedules, 60000);
    checkSchedules(); // cek langsung
}

let lastNotifKey = '';
function checkSchedules() {
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const day = now.getDay();
    schedules.forEach(s => {
        if (!s.active) return;
        if (s.time !== hhmm) return;
        if (!s.days.includes(day)) return;
        const key = `${s.id}_${hhmm}`;
        if (lastNotifKey === key) return; // jangan kirim 2x per menit
        lastNotifKey = key;
        new Notification(`${typeEmoji[s.type]} Waktunya ${typeLabel[s.type]}!`, {
            body: `Saatnya ${typeLabel[s.type]} Al-Quran Juz 1 — ELfashih`,
            icon: '/static/pwa/apple-touch-icon.png',
            badge: '/static/pwa/apple-touch-icon.png',
            tag: s.id,
        });
    });
}

// Init schedule checker on load
document.addEventListener('DOMContentLoaded', () => {
    if (schedules.length && Notification.permission === 'granted') startScheduleChecker();
});

// =============================================
// UJI HAFALAN — QUIZ / GAME MODE
// =============================================
let quizMode        = 'sambung';
let quizQuestions   = [];
let quizCurrent     = 0;
let quizScore       = 0;
let quizCorrect     = 0;
let quizWrong       = 0;
let quizTotal       = 10;
let quizAnswered    = false;
let quizCurrentAudioSurah = 0;
let quizCurrentAudioAyah  = 0;

const QUIZ_SURAH_NAMES = {
    1:  'Al-Fatihah',
    2:  'Al-Baqarah',
    3:  'Ali Imran',
    4:  'An-Nisa',
};

function openQuizView() {
    hideDashboard();
    document.getElementById('quizView').classList.add('active');
    showQuizSetup();
    renderQuizBestScores();
    updateDashQuizBadge();
}

function closeQuizView() {
    document.getElementById('quizView').classList.remove('active');
    // Kembali ke mushaf/digital, bukan dashboard
}


function selectQuizMode(mode) {
    quizMode = mode;
    document.querySelectorAll('.quiz-mode-card').forEach(c => c.classList.remove('selected'));
    const card = document.getElementById('qmCard-' + mode);
    if (card) card.classList.add('selected');
}

function showQuizSetup() {
    document.getElementById('quizSetupWrap').style.display = '';
    document.getElementById('quizQuestionWrap').classList.remove('active');
    document.getElementById('quizResultWrap').classList.remove('active');
    document.getElementById('quizLiveScore').textContent = '0 poin';
    renderQuizBestScores();
}

// Build pool of ayahs from juzDataCache based on selected juz
function getQuizPool() {
    const juzSel = document.getElementById('quizJuzSel').value;
    let pool = [];
    if (juzSel === 'all') {
        [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(j => { if (juzDataCache[j]) pool = pool.concat(juzDataCache[j]); });
    } else {
        const j = parseInt(juzSel);
        if (juzDataCache[j]) pool = juzDataCache[j];
    }
    return pool.filter(a => !a._overflow);
}

function shuffleArr(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pickRandom(arr, n) {
    return shuffleArr(arr).slice(0, n);
}

function buildSambungQuestion(ayah, allAyahs, numOptions) {
    // Show first half of the ayah, options = second half of correct + 3 wrong
    const words = ayah.text.trim().split(/\s+/);
    if (words.length < 4) return null;
    const splitAt = Math.max(2, Math.floor(words.length * 0.45));
    const stem    = words.slice(0, splitAt).join(' ');
    const answer  = words.slice(splitAt).join(' ');

    // Wrong options: second halves of other ayahs
    const others = allAyahs.filter(a => a !== ayah && a.text.trim().split(/\s+/).length >= 4);
    const wrongPool = shuffleArr(others).slice(0, numOptions - 1).map(a => {
        const w = a.text.trim().split(/\s+/);
        const s = Math.max(2, Math.floor(w.length * 0.45));
        return w.slice(s).join(' ');
    });

    const opts = shuffleArr([answer, ...wrongPool]);
    return { type: 'sambung', stem, answer, opts, ayah };
}

function buildSurahQuestion(ayah, allAyahs, numOptions) {
    const correctSurah = ayah.surah.number;
    const otherSurahs  = [...new Set(allAyahs.map(a => a.surah.number))].filter(s => s !== correctSurah);
    const wrongSurahs  = shuffleArr(otherSurahs).slice(0, numOptions - 1);
    if (wrongSurahs.length < numOptions - 1) return null;
    const opts = shuffleArr([correctSurah, ...wrongSurahs]);
    return { type: 'surah', ayah, answer: correctSurah, opts };
}

function buildNomorQuestion(ayah, allAyahs, numOptions) {
    const correctNum = ayah.numberInSurah;
    // Wrong: nearby numbers within same surah
    const surahAyahs = allAyahs.filter(a => a.surah.number === ayah.surah.number && a.numberInSurah !== correctNum);
    const wrongNums  = shuffleArr(surahAyahs).slice(0, numOptions - 1).map(a => a.numberInSurah);
    if (wrongNums.length < numOptions - 1) {
        // fallback: just make up close numbers
        const extras = [];
        for (let i = 1; extras.length < numOptions - 1; i++) {
            const n = correctNum + i;
            if (!extras.includes(n) && n !== correctNum && n > 0) extras.push(n);
        }
        wrongNums.push(...extras.slice(0, numOptions - 1 - wrongNums.length));
    }
    const opts = shuffleArr([correctNum, ...wrongNums.slice(0, numOptions - 1)]);
    return { type: 'nomor', ayah, answer: correctNum, opts };
}

function buildQuestions(pool, mode, count, numOptions) {
    const questions = [];
    const candidates = shuffleArr(pool.filter(a => a.text && a.text.trim().split(/\s+/).length >= 4));
    for (let i = 0; i < candidates.length && questions.length < count; i++) {
        const ayah = candidates[i];
        let effectiveMode = mode;
        if (mode === 'campuran') {
            const modes = ['sambung', 'surah', 'nomor'];
            effectiveMode = modes[i % modes.length];
        }
        let q = null;
        if (effectiveMode === 'sambung') q = buildSambungQuestion(ayah, pool, numOptions);
        else if (effectiveMode === 'surah') q = buildSurahQuestion(ayah, pool, numOptions);
        else if (effectiveMode === 'nomor') q = buildNomorQuestion(ayah, pool, numOptions);
        if (q) questions.push(q);
    }
    return questions;
}

function startQuiz() {
    const pool = getQuizPool();
    if (!pool || pool.length < 8) {
        showToast('⚠️ Data belum tersedia — unduh data offline dahulu');
        return;
    }
    quizTotal   = parseInt(document.getElementById('quizCountSel').value);
    const numOpts = parseInt(document.getElementById('quizOptionsSel').value);
    quizQuestions = buildQuestions(pool, quizMode, quizTotal, numOpts);
    if (quizQuestions.length === 0) {
        showToast('⚠️ Tidak cukup ayat untuk quiz ini');
        return;
    }
    quizTotal   = quizQuestions.length;
    quizCurrent = 0;
    quizScore   = 0;
    quizCorrect = 0;
    quizWrong   = 0;

    document.getElementById('quizSetupWrap').style.display = 'none';
    document.getElementById('quizResultWrap').classList.remove('active');
    document.getElementById('quizQuestionWrap').classList.add('active');
    // ── GA4: catat mulai quiz ──
    gaEvent('start_quiz', { mode: quizMode, total: quizTotal });
    renderQuizQuestion();
}

function renderQuizQuestion() {
    const q = quizQuestions[quizCurrent];
    quizAnswered = false;

    // Progress
    const pct = (quizCurrent / quizTotal) * 100;
    document.getElementById('quizProgressFill').style.width = pct + '%';
    document.getElementById('quizProgressText').textContent = `${quizCurrent + 1} / ${quizTotal}`;

    // Score
    document.getElementById('quizLiveScore').textContent = quizScore + ' poin';

    // Feedback reset
    const fb = document.getElementById('quizFeedback');
    fb.className = 'quiz-feedback';
    document.getElementById('quizNextBtn').className = 'quiz-next-btn';

    // Q card
    const arabicEl = document.getElementById('quizQArabic');
    const textEl   = document.getElementById('quizQText');
    const hintEl   = document.getElementById('quizQHint');
    const labelEl  = document.getElementById('quizQLabel');
    const playBtn  = document.getElementById('quizPlayBtn');

    if (q.type === 'sambung') {
        labelEl.textContent = 'SAMBUNG AYAT';
        arabicEl.textContent = q.stem + ' ...';
        arabicEl.style.display = '';
        textEl.style.display = 'none';
        hintEl.textContent = `Surah ${QUIZ_SURAH_NAMES[q.ayah.surah.number] || q.ayah.surah.englishName} : ${q.ayah.numberInSurah}`;
        // Show play button for surah+ayat audio
        quizCurrentAudioSurah = q.ayah.surah.number;
        quizCurrentAudioAyah  = q.ayah.numberInSurah;
        playBtn.style.display = '';
    } else if (q.type === 'surah') {
        labelEl.textContent = 'TEBAK NAMA SURAH';
        arabicEl.textContent = q.ayah.text;
        arabicEl.style.display = '';
        textEl.style.display = 'none';
        hintEl.textContent = `Ayat ke-${q.ayah.numberInSurah} dari surah berapa?`;
        quizCurrentAudioSurah = q.ayah.surah.number;
        quizCurrentAudioAyah  = q.ayah.numberInSurah;
        playBtn.style.display = '';
    } else if (q.type === 'nomor') {
        labelEl.textContent = 'TEBAK NOMOR AYAT';
        arabicEl.textContent = q.ayah.text;
        arabicEl.style.display = '';
        textEl.style.display = 'none';
        const surahName = QUIZ_SURAH_NAMES[q.ayah.surah.number] || q.ayah.surah.englishName;
        hintEl.textContent = `Ayat ini adalah ayat ke-berapa dalam Surah ${surahName}?`;
        quizCurrentAudioSurah = q.ayah.surah.number;
        quizCurrentAudioAyah  = q.ayah.numberInSurah;
        playBtn.style.display = '';
    }

    // Options
    const grid = document.getElementById('quizOptionsGrid');
    grid.innerHTML = '';
    q.opts.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option-btn';
        if (q.type === 'sambung') {
            btn.textContent = opt;
        } else if (q.type === 'surah') {
            btn.className += ' plain-text';
            btn.textContent = (QUIZ_SURAH_NAMES[opt] || 'Surah ' + opt) + ' (' + opt + ')';
        } else if (q.type === 'nomor') {
            btn.className += ' plain-text';
            btn.textContent = 'Ayat ke-' + opt;
        }
        btn.dataset.val = opt;
        btn.onclick = () => answerQuiz(opt, btn);
        grid.appendChild(btn);
    });
}

function quizPlayAudio() {
    const s = String(quizCurrentAudioSurah).padStart(3, '0');
    const a = String(quizCurrentAudioAyah).padStart(3, '0');
    const url = `https://cdn.islamic.network/quran/audio/64/${selectedQariId}/${parseInt(s)*1000+parseInt(a)}.mp3`;
    // Use a separate quick audio
    const tmp = new Audio(url);
    tmp.volume = 0.9;
    tmp.play().catch(() => {});
    document.getElementById('quizPlayBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memuat...';
    tmp.oncanplay = () => { document.getElementById('quizPlayBtn').innerHTML = '<i class="fa-solid fa-volume-high"></i> Dengarkan Ayat'; };
    tmp.onerror  = () => { document.getElementById('quizPlayBtn').innerHTML = '<i class="fa-solid fa-volume-high"></i> Dengarkan Ayat'; };
}

function answerQuiz(selected, btn) {
    if (quizAnswered) return;
    quizAnswered = true;
    const q = quizQuestions[quizCurrent];
    const correct = (String(selected) === String(q.answer));

    // Highlight options
    document.querySelectorAll('.quiz-option-btn').forEach(b => {
        b.disabled = true;
        if (String(b.dataset.val) === String(q.answer)) b.classList.add('correct');
    });
    if (!correct) btn.classList.add('wrong');

    // Feedback
    const fb = document.getElementById('quizFeedback');
    const icon = document.getElementById('quizFeedbackIcon');
    const msg  = document.getElementById('quizFeedbackMsg');
    const det  = document.getElementById('quizFeedbackDetail');

    if (correct) {
        quizCorrect++;
        const pts = 10;
        quizScore += pts;
        fb.className = 'quiz-feedback correct show';
        icon.textContent = '✅';
        msg.textContent  = 'Benar! +' + pts + ' poin';
        if (q.type === 'sambung') {
            det.textContent = 'Lanjutan ayat: ' + q.answer;
        } else if (q.type === 'surah') {
            det.textContent = 'Surah: ' + (QUIZ_SURAH_NAMES[q.answer] || q.answer);
        } else {
            det.textContent = 'Nomor ayat yang benar: ' + q.answer;
        }
    } else {
        quizWrong++;
        fb.className = 'quiz-feedback wrong show';
        icon.textContent = '❌';
        msg.textContent  = 'Kurang tepat...';
        if (q.type === 'sambung') {
            det.textContent = 'Jawaban benar: ' + q.answer;
        } else if (q.type === 'surah') {
            det.textContent = 'Jawaban benar: Surah ' + (QUIZ_SURAH_NAMES[q.answer] || q.answer);
        } else {
            det.textContent = 'Jawaban benar: Ayat ke-' + q.answer;
        }
    }

    document.getElementById('quizLiveScore').textContent = quizScore + ' poin';
    document.getElementById('quizNextBtn').className = 'quiz-next-btn show';
    if (quizCurrent === quizTotal - 1) {
        document.getElementById('quizNextBtn').innerHTML = 'Lihat Hasil <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
    }
}

function quizNextQuestion() {
    if (quizCurrent < quizTotal - 1) {
        quizCurrent++;
        renderQuizQuestion();
    } else {
        showQuizResult();
    }
}

function showQuizResult() {
    document.getElementById('quizQuestionWrap').classList.remove('active');
    document.getElementById('quizResultWrap').classList.add('active');

    const pct   = Math.round((quizCorrect / quizTotal) * 100);
    const emoji = pct >= 90 ? '🏆' : pct >= 70 ? '🌟' : pct >= 50 ? '👍' : '📖';
    const title = pct >= 90 ? 'Luar Biasa!' : pct >= 70 ? 'Bagus Sekali!' : pct >= 50 ? 'Terus Berlatih!' : 'Ayo Tingkatkan!';

    document.getElementById('quizResultEmoji').textContent = emoji;
    document.getElementById('quizResultTitle').textContent = title;
    document.getElementById('quizResultScore').textContent = quizScore;
    document.getElementById('quizResCorrect').textContent  = quizCorrect;
    document.getElementById('quizResWrong').textContent    = quizWrong;
    document.getElementById('quizResPct').textContent      = pct + '%';

    // Save score
    saveQuizScore({ mode: quizMode, score: quizScore, correct: quizCorrect, total: quizTotal, pct, date: new Date().toISOString() });
    updateDashQuizBadge();
}

// ---- Persist best scores ----
function saveQuizScore(result) {
    let scores = [];
    try { scores = JSON.parse(localStorage.getItem('elfashih_quiz_scores') || '[]'); } catch(e) {}
    scores.unshift(result);
    if (scores.length > 20) scores = scores.slice(0, 20);
    try { localStorage.setItem('elfashih_quiz_scores', JSON.stringify(scores)); } catch(e) {}
}

function getQuizScores() {
    try { return JSON.parse(localStorage.getItem('elfashih_quiz_scores') || '[]'); } catch(e) { return []; }
}

function renderQuizBestScores() {
    const scores = getQuizScores();
    const el = document.getElementById('quizBestScoreList');
    if (!el) return;
    if (!scores.length) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Belum ada skor tersimpan</div>';
        return;
    }
    const modeLabel = { sambung:'Sambung Ayat', surah:'Tebak Surah', nomor:'Tebak Nomor', campuran:'Campuran' };
    const modeEmoji = { sambung:'🔗', surah:'📖', nomor:'🔢', campuran:'🎲' };
    el.innerHTML = scores.slice(0, 5).map(s => {
        const d = new Date(s.date);
        const dateStr = `${d.getDate()}/${d.getMonth()+1} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        return `<div class="quiz-history-row">
            <div class="quiz-hist-icon">${modeEmoji[s.mode] || '🎮'}</div>
            <div class="quiz-hist-info">
                <div class="quiz-hist-title">${modeLabel[s.mode] || s.mode}</div>
                <div class="quiz-hist-detail">${s.correct}/${s.total} benar · ${s.pct}% · ${dateStr}</div>
            </div>
            <div class="quiz-hist-score">${s.score}</div>
        </div>`;
    }).join('');
}

function updateDashQuizBadge() {
    const scores = getQuizScores();
    const bestEl = document.getElementById('dashQuizBestScore');
    const lastEl = document.getElementById('dashQuizLastScore');
    if (!bestEl) return;
    if (!scores.length) { bestEl.textContent = '—'; return; }
    const best = scores.reduce((a, b) => a.score > b.score ? a : b);
    bestEl.textContent = best.score + ' pts';
    if (lastEl) {
        const last = scores[0];
        const modeLabel = { sambung:'Sambung', surah:'Tebak Surah', nomor:'Tebak Nomor', campuran:'Campuran' };
        lastEl.textContent = `Terakhir: ${modeLabel[last.mode]||last.mode} · ${last.correct}/${last.total} benar`;
    }
}

// Init quiz badge on load
document.addEventListener('DOMContentLoaded', updateDashQuizBadge);


// =============================================
// MUROJAAH TERJADWAL — Leitner Spaced Repetition
// =============================================

const LEITNER_KEY = 'elfashih_leitner';
// box intervals in days
const BOX_INTERVALS = { 1: 1, 2: 3, 3: 7 };
const BOX_LABELS    = { 1: 'Baru Dihafal', 2: 'Lancar', 3: 'Sangat Lancar' };

// Surah names lookup (shared with quiz)
const MRJ_SURAH_NAMES = {
    1:'Al-Fatihah',2:'Al-Baqarah',3:'Ali Imran',4:'An-Nisa',5:'Al-Maidah',
    6:"Al-An'am",7:"Al-A'raf",8:'Al-Anfal',9:'At-Taubah',10:'Yunus',11:'Hud',12:'Yusuf',
    13:"Ar-Ra'd",14:'Ibrahim',15:'Al-Hijr',16:'An-Nahl',17:"Al-Isra'",18:'Al-Kahfi',
    19:'Maryam',20:'Taha'
};

/* ---- Storage helpers ---- */
function getLeitnerAll() {
    try { return JSON.parse(localStorage.getItem(LEITNER_KEY) || '{}'); } catch { return {}; }
}
function saveLeitnerAll(data) {
    try { localStorage.setItem(LEITNER_KEY, JSON.stringify(data)); } catch {}
}
function leitnerKey(surah, ayah) { return `${surah}:${ayah}`; }

function getLeitnerEntry(surah, ayah) {
    return getLeitnerAll()[leitnerKey(surah, ayah)] || null;
}

function setLeitnerEntry(surah, ayah, box, lastReview) {
    const all = getLeitnerAll();
    all[leitnerKey(surah, ayah)] = { box, lastReview };
    saveLeitnerAll(all);
}

/* ---- Date helpers ---- */
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function daysDiff(dateStr) {
    if (!dateStr) return 999;
    const now = new Date(); now.setHours(0,0,0,0);
    const then = new Date(dateStr); then.setHours(0,0,0,0);
    return Math.floor((now - then) / 86400000);
}

function isDue(entry) {
    if (!entry) return false;
    const interval = BOX_INTERVALS[entry.box] || 1;
    return daysDiff(entry.lastReview) >= interval;
}

/* ---- Sync from hafalan progress ---- */
function syncLeitnerFromHafalan() {
    const hafalanData = getHafalanAll();
    const leitner = getLeitnerAll();
    let added = 0;
    Object.keys(hafalanData).forEach(k => {
        const status = hafalanData[k];
        if ((status === 'proses' || status === 'lancar') && !leitner[k]) {
            leitner[k] = { box: 1, lastReview: null };
            added++;
        }
    });
    saveLeitnerAll(leitner);
    refreshMurojaahView();
    showToast(added > 0 ? `✅ ${added} ayat baru ditambahkan ke Leitner` : '🔄 Semua ayat sudah tersinkron');
}

/* ---- Compute today's due list ---- */
function getTodayDueList() {
    const leitner = getLeitnerAll();
    const due = [];
    Object.keys(leitner).forEach(k => {
        const entry = leitner[k];
        if (isDue(entry)) {
            const [s, a] = k.split(':').map(Number);
            due.push({ surah: s, ayah: a, box: entry.box, lastReview: entry.lastReview });
        }
    });
    // Sort: box1 first, then box2, then box3
    due.sort((a, b) => a.box - b.box || a.surah - b.surah || a.ayah - b.ayah);
    return due;
}

function getLeitnerBoxCounts() {
    const leitner = getLeitnerAll();
    const counts = { 1: 0, 2: 0, 3: 0 };
    Object.values(leitner).forEach(e => { if (counts[e.box] !== undefined) counts[e.box]++; });
    return counts;
}

/* ---- Open / Close View ---- */
function openMurojaahView() {
    document.getElementById('dashboardView').classList.remove('active');
    document.getElementById('murojaahView').classList.add('active');
    refreshMurojaahView();
}

function closeMurojaahView() {
    document.getElementById('murojaahView').classList.remove('active');
    document.getElementById('dashboardView').classList.add('active');
    updateDashboard();
}

function refreshMurojaahView() {
    const dueList = getTodayDueList();
    const counts  = getLeitnerBoxCounts();

    // Box counts
    document.getElementById('mrjBox1Count').textContent = counts[1];
    document.getElementById('mrjBox2Count').textContent = counts[2];
    document.getElementById('mrjBox3Count').textContent = counts[3];

    // Header badge
    const badge = document.getElementById('mrjHeaderBadge');
    badge.textContent = dueList.length + ' hari ini';
    badge.className = 'mrj-due-badge' + (dueList.length === 0 ? ' none' : '');

    // Due list
    const listEl = document.getElementById('mrjDueList');
    if (!dueList.length) {
        const total = counts[1] + counts[2] + counts[3];
        listEl.innerHTML = `<div class="mrj-empty">
            <div class="mrj-empty-icon">${total > 0 ? '✅' : '📋'}</div>
            ${total > 0
                ? 'Semua ayat sudah dimurojaah hari ini! 🎉<br><small>Sesi berikutnya sesuai jadwal kotak.</small>'
                : 'Belum ada ayat terjadwal.<br><small>Tekan "Sinkron" atau tandai ayat di Progress Hafalan.</small>'
            }
        </div>`;
        document.getElementById('mrjStartBtn').disabled = true;
    } else {
        listEl.innerHTML = dueList.map(item => {
            const surahName = MRJ_SURAH_NAMES[item.surah] || 'Surah ' + item.surah;
            const lastStr   = item.lastReview ? `Terakhir: ${item.lastReview}` : 'Belum pernah';
            const boxLabel  = BOX_LABELS[item.box] || 'Kotak ' + item.box;
            return `<div class="mrj-due-item">
                <div class="mrj-due-box-badge b${item.box}">${item.box}</div>
                <div class="mrj-due-item-info">
                    <div class="mrj-due-item-name">${surahName} : Ayat ${item.ayah}</div>
                    <div class="mrj-due-item-meta">${boxLabel} · ${lastStr}</div>
                </div>
            </div>`;
        }).join('');
        document.getElementById('mrjStartBtn').disabled = false;
    }

    // Update topbar badge
    updateMurojaahTopBadge();
}

function updateMurojaahTopBadge() {
    const due = getTodayDueList().length;
    const badge = document.getElementById('mrjTopBadge');
    if (badge) badge.style.display = due > 0 ? 'block' : 'none';
}

/* ---- Dashboard card update ---- */
function updateDashMurojaah() {
    const dueList = getTodayDueList();
    const counts  = getLeitnerBoxCounts();
    const total   = counts[1] + counts[2] + counts[3];
    const countEl = document.getElementById('dashMrjCount');
    const subEl   = document.getElementById('dashMrjSub');
    const labelEl = document.getElementById('dashMrjCountLabel');
    if (!countEl) return;
    if (total === 0) {
        countEl.className = 'dash-mrj-count none';
        countEl.innerHTML = '📋';
        if (subEl) subEl.textContent = 'Belum ada ayat. Sinkron dari Progress Hafalan.';
        if (labelEl) labelEl.textContent = 'Mulai tambah';
    } else if (dueList.length === 0) {
        countEl.className = 'dash-mrj-count none';
        countEl.innerHTML = '✅';
        if (subEl) subEl.textContent = `${total} ayat terdaftar · Semua sudah dimurojaah`;
        if (labelEl) labelEl.textContent = 'selesai hari ini';
    } else {
        countEl.className = 'dash-mrj-count';
        countEl.innerHTML = dueList.length + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
        if (subEl) subEl.textContent = `${counts[1]} Kotak1 · ${counts[2]} Kotak2 · ${counts[3]} Kotak3`;
        if (labelEl) labelEl.textContent = 'ayat perlu dimurojaah';
    }
    updateMurojaahTopBadge();
}

// ---- SESSION STATE ----
let mrjSessionQueue   = [];
let mrjSessionIdx     = 0;
let mrjSessionIngat   = 0;
let mrjSessionLupa    = 0;
let mrjSessionResults = [];

// We need access to all juz data to show ayah text
function getAyahText(surah, ayah) {
    for (let j = 1; j <= 25; j++) {
        const data = juzDataCache[j] || [];
        const found = data.find(a => a.surah.number === surah && a.numberInSurah === ayah);
        if (found) return found.text || '';
    }
    return '';
}

function startMurojaahSession() {
    const dueList = getTodayDueList();
    if (!dueList.length) { showToast('Tidak ada ayat yang perlu dimurojaah hari ini!'); return; }

    mrjSessionQueue   = dueList;
    mrjSessionIdx     = 0;
    mrjSessionIngat   = 0;
    mrjSessionLupa    = 0;
    mrjSessionResults = [];
    // ── GA4: catat mulai murojaah ──
    gaEvent('start_murojaah', { ayat_count: dueList.length });

    document.getElementById('mrjSessResultBody').style.display = 'none';
    document.getElementById('mrjSessBody').style.display = '';
    document.getElementById('murojaahSession').classList.add('active');
    renderMurojaahCard();
}

function exitMurojaahSession() {
    document.getElementById('murojaahSession').classList.remove('active');
    refreshMurojaahView();
    updateDashMurojaah();
}

function renderMurojaahCard() {
    const total = mrjSessionQueue.length;
    const cur   = mrjSessionIdx;
    const item  = mrjSessionQueue[cur];
    if (!item) { showMurojaahResult(); return; }

    // Progress
    document.getElementById('mrjSessProgressText').textContent = `${cur + 1} / ${total}`;
    document.getElementById('mrjSessProgressFill').style.width = ((cur / total) * 100).toFixed(1) + '%';

    const surahName = MRJ_SURAH_NAMES[item.surah] || 'Surah ' + item.surah;
    const ayahText  = getAyahText(item.surah, item.ayah);
    const boxLabel  = BOX_LABELS[item.box] || 'Kotak ' + item.box;
    const boxColor  = item.box === 1 ? '#ef4444' : item.box === 2 ? '#f59e0b' : 'var(--accent-teal)';

    document.getElementById('mrjSessBody').innerHTML = `
        <div class="mrj-sess-box-indicator">
            <div class="mrj-sess-box-dot ${cur >= 0 ? 'active b'+item.box : 'b1'}" style="background:${boxColor}"></div>
            <span class="mrj-sess-box-label">${boxLabel} · ${surahName} : Ayat ${item.ayah}</span>
        </div>

        <div class="mrj-sess-card">
            <div class="mrj-sess-ayah-info">${surahName} — Ayat ${item.ayah}</div>
            <div class="mrj-sess-arabic" id="mrjSessArabic">
                ${ayahText || '<span style="color:var(--text-muted);font-size:14px;font-family:var(--ui-font)">Teks tidak tersedia. Buka mushaf terlebih dahulu.</span>'}
            </div>
            <button class="mrj-sess-hint-btn" onclick="this.style.display='none';document.getElementById('mrjSessExtra').classList.add('show')">
                Tunjukkan Nomor Ayat
            </button>
            <div class="mrj-sess-translation" id="mrjSessExtra">
                ${surahName} Ayat ${item.ayah} · Kotak ${item.box}
            </div>
        </div>

        <button class="mrj-sess-play-btn" onclick="mrjPlayAudio(${item.surah},${item.ayah})">
            <i class="fa-solid fa-volume-high"></i> Dengarkan Ayat
        </button>

        <div class="mrj-sess-actions">
            <button class="mrj-sess-btn ingat" onclick="answerMurojaah('ingat')">
                💪 Masih Hafal
                <span class="mrj-sess-btn-sub">${item.box < 3 ? 'Naik ke Kotak '+(item.box+1) : 'Tetap di Kotak 3'}</span>
            </button>
            <button class="mrj-sess-btn lupa" onclick="answerMurojaah('lupa')">
                🔄 Perlu Ulang
                <span class="mrj-sess-btn-sub">Kembali ke Kotak 1</span>
            </button>
        </div>
    `;
}

function mrjPlayAudio(surah, ayah) {
    const s = String(surah).padStart(3, '0');
    const a = String(ayah).padStart(3, '0');
    const url = `https://cdn.islamic.network/quran/audio/64/${selectedQariId}/${parseInt(s)*1000+parseInt(a)}.mp3`;
    const tmp = new Audio(url);
    tmp.volume = 0.9;
    tmp.play().catch(() => {});
}

function answerMurojaah(answer) {
    const item  = mrjSessionQueue[mrjSessionIdx];
    const today = todayStr();
    let newBox;

    if (answer === 'ingat') {
        mrjSessionIngat++;
        newBox = Math.min(item.box + 1, 3);
    } else {
        mrjSessionLupa++;
        newBox = 1;
    }

    setLeitnerEntry(item.surah, item.ayah, newBox, today);
    mrjSessionResults.push({ surah: item.surah, ayah: item.ayah, oldBox: item.box, newBox, answer });

    mrjSessionIdx++;
    if (mrjSessionIdx >= mrjSessionQueue.length) {
        showMurojaahResult();
    } else {
        renderMurojaahCard();
    }
}

function showMurojaahResult() {
    const total = mrjSessionQueue.length;
    document.getElementById('mrjSessBody').style.display = 'none';
    document.getElementById('mrjSessResultBody').style.display = '';
    document.getElementById('mrjSessProgressFill').style.width = '100%';
    document.getElementById('mrjSessProgressText').textContent = `${total} / ${total}`;

    const pct   = total > 0 ? Math.round(mrjSessionIngat / total * 100) : 0;
    const emoji = pct >= 90 ? '🏆' : pct >= 70 ? '🌟' : pct >= 50 ? '👍' : '📖';
    const title = pct >= 90 ? 'Masyaa Allah!' : pct >= 70 ? 'Luar Biasa!' : pct >= 50 ? 'Terus Semangat!' : 'Tetap Istiqomah!';
    document.getElementById('mrjResEmoji').textContent  = emoji;
    document.getElementById('mrjResTitle').textContent  = title;
    document.getElementById('mrjResSub').textContent    = `${total} ayat dimurojaah · ${pct}% lancar`;
    document.getElementById('mrjResIngat').textContent  = mrjSessionIngat;
    document.getElementById('mrjResLupa').textContent   = mrjSessionLupa;

    // Box changes summary
    let up = 0, down = 0, stay = 0;
    mrjSessionResults.forEach(r => {
        if (r.newBox > r.oldBox) up++;
        else if (r.newBox < r.oldBox) down++;
        else stay++;
    });
    let changes = [];
    if (up)   changes.push(`⬆️ ${up} ayat naik kotak`);
    if (down) changes.push(`⬇️ ${down} ayat kembali ke Kotak 1`);
    if (stay) changes.push(`➡️ ${stay} ayat tetap di kotak`);
    document.getElementById('mrjResBoxChanges').innerHTML = changes.join(' &nbsp;·&nbsp; ');

    refreshMurojaahView();
    updateDashMurojaah();
}

// Quick action button in dashboard
function openMurojaahFromDash() {
    openMurojaahView();
}

// (Logika sinkronisasi Leitner sudah digabung langsung ke dalam
// setHafalanStatus() di bagian atas file — lihat definisi fungsi
// tersebut. Wrapper redeclare di sini sudah dihapus karena
// menyebabkan bug infinite recursion / stack overflow.)

// Init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    updateDashQuizBadge();
    updateDashMurojaah();
    updateMurojaahTopBadge();
});







function openJuzFromSelect() {
    const juz = parseInt(document.getElementById('dashJuzSelect').value);
    if (juz) openJuz(juz);
}
function updateJuzSelectInfo() {
    const juz = parseInt(document.getElementById('dashJuzSelect')?.value || '1');
    const hafalanData = JSON.parse(localStorage.getItem('elfashih_hafalan') || '{}');
    const juzAyatCounts = { 1:149,2:111,3:112,4:176,5:124,6:110,7:149,8:148,9:154,10:128,11:151,12:170,13:154,14:227,15:185,16:243,17:170,18:202,19:179,20:184,21:178,22:169,23:357,24:175,25:200,26:195,27:399,28:137,29:431,30:564 };
    const data = juzDataCache[juz] || [];
    const count = data.filter(a => !a._overflow).length || (juzAyatCounts[juz] || 0);
    let lancar = 0;
    data.forEach(a => {
        if (a._overflow) return;
        const k = a.surah.number + ':' + a.numberInSurah;
        if ((JSON.parse(localStorage.getItem('elfashih_hafalan')||'{}'))[k] === 'lancar') lancar++;
    });
    const pct = count > 0 ? Math.round(lancar / count * 100) : 0;
    const pctEl = document.getElementById('dashJuzSelectPct');
    const barEl = document.getElementById('dashJuzSelectBar');
    if (pctEl) pctEl.textContent = pct + '% lancar';
    if (barEl) barEl.style.width = pct + '%';
}

