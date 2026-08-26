// =============================================
// TUTORIAL SYSTEM
// =============================================
const TUTORIAL_KEY = 'elfashih_tutorials_seen';

function _getTutorialsSeen() {
    try { return JSON.parse(localStorage.getItem(TUTORIAL_KEY) || '[]'); } catch { return []; }
}
function _markTutorialSeen(id) {
    const seen = _getTutorialsSeen();
    if (!seen.includes(id)) { seen.push(id); localStorage.setItem(TUTORIAL_KEY, JSON.stringify(seen)); }
}
function _isTutorialSeen(id) {
    return _getTutorialsSeen().includes(id);
}

// Tutorial definitions: id, icon, badge, title, desc, tips[], multiStep?
const TUTORIALS = {
    welcome: {
        id: 'welcome',
        steps: [
            {
                icon: '🌟',
                badge: 'Selamat Datang',
                title: 'Selamat Datang di ELfashih!',
                desc: 'ELfashih adalah teman hafalan Al-Qur\'an Juz 1–30. Semua fitur dirancang untuk memudahkan perjalanan hafalan Anda.',
                tips: [
                    { icon: '📖', text: '<b>Mushaf</b> — Baca & dengarkan Al-Qur\'an mushaf digital dengan tampilan halaman asli.' },
                    { icon: '✅', text: '<b>Hafalan</b> — Tandai ayat Belum / Proses / Lancar dan pantau progress Anda.' },
                    { icon: '🎙️', text: '<b>Setor</b> — Latih hafalan dengan deteksi suara otomatis.' },
                    { icon: '🔁', text: '<b>Ulang</b> — Loop ayat tertentu untuk memperkuat hafalan.' },
                ]
            },
            {
                icon: '🗂️',
                badge: 'Navigasi',
                title: 'Cara Menggunakan Navigasi',
                desc: 'Gunakan menu bawah untuk berpindah antar fitur utama. Tombol "Lainnya" membuka fitur tambahan seperti Quiz, Murojaah, dan Rekam.',
                tips: [
                    { icon: '🏠', text: '<b>Home</b> — Dashboard ringkasan progress dan statistik harian.' },
                    { icon: '📗', text: '<b>Mushaf</b> — Tampilan mushaf per halaman, navigasi Juz.' },
                    { icon: '▶️', text: '<b>Putar</b> — Kontrol audio murattal langsung dari sini.' },
                    { icon: '⋯', text: '<b>Lainnya</b> — Quiz, Jadwal, Murojaah, Rekam, dan pengaturan.' },
                ]
            }
        ]
    },
    mushaf: {
        id: 'mushaf',
        icon: '📖',
        badge: 'Fitur Mushaf',
        title: 'Mushaf Digital',
        desc: 'Tampilan mushaf Utsmani asli. Geser kiri/kanan untuk ganti halaman, atau pilih Juz dari tab atas.',
        tips: [
            { icon: '👆', text: '<b>Ketuk ayat</b> — Putar audio ayat tersebut dari qari pilihan Anda.' },
            { icon: '🔡', text: '<b>Mode Digital</b> — Tampilan teks Arab per ayat dengan terjemahan.' },
            { icon: '🙈', text: '<b>Mode Hafalan</b> — Sembunyikan teks untuk latihan murni.' },
            { icon: '🔖', text: '<b>Kertas</b> — Tampilan kertas untuk nuansa membaca klasik.' },
        ]
    },
    hafalan: {
        id: 'hafalan',
        icon: '✅',
        badge: 'Fitur Hafalan',
        title: 'Progress Hafalan',
        desc: 'Catat status hafalan setiap ayat: Belum, Proses, atau Lancar. Data tersimpan per akun Anda.',
        tips: [
            { icon: '⬜', text: '<b>Belum</b> — Ayat belum pernah dihafal.' },
            { icon: '🔶', text: '<b>Proses</b> — Sedang dalam proses menghafal, belum lancar.' },
            { icon: '✅', text: '<b>Lancar</b> — Sudah hafal dengan lancar.' },
            { icon: '📊', text: 'Pantau statistik per Juz dan keseluruhan di halaman Progress.' },
        ]
    },
    setor: {
        id: 'setor',
        icon: '🎙️',
        badge: 'Fitur Setor Hafalan',
        title: 'Setor Hafalan (Tasmi\')',
        desc: 'Baca ayat dengan lantang, sistem akan mendeteksi dan mengevaluasi bacaan Anda secara otomatis.',
        tips: [
            { icon: '🟢', text: '<b>Hijau</b> — Bacaan benar, otomatis lanjut ke ayat berikutnya.' },
            { icon: '🔴', text: '<b>Alarm merah</b> — Terdeteksi kesalahan, ulangi bacaan.' },
            { icon: '🐌', text: '<b>Baca pelan & jelas</b> — Mikrofon lebih mudah menangkap bacaan yang jelas.' },
            { icon: '⚡', text: '<b>Mode Cepat</b> — Aktifkan untuk hafidz yang membaca tanpa jeda panjang.' },
        ]
    },
    ulang: {
        id: 'ulang',
        icon: '🔁',
        badge: 'Fitur Ulang / Loop',
        title: 'Loop & Ulang Ayat',
        desc: 'Putar ulang satu ayat atau rentang ayat tertentu secara otomatis untuk membantu hafalan.',
        tips: [
            { icon: '🎯', text: '<b>Pilih rentang</b> — Tentukan dari ayat mana sampai ayat mana yang ingin diulang.' },
            { icon: '🔢', text: '<b>Jumlah ulang</b> — Atur berapa kali tiap ayat diulang (1–10x).' },
            { icon: '👁️', text: '<b>Ketuk dari Mushaf</b> — Pilih langsung dengan mengetuk ayat di halaman mushaf.' },
        ]
    },
    quiz: {
        id: 'quiz',
        icon: '🧠',
        badge: 'Fitur Quiz',
        title: 'Quiz Hafalan',
        desc: 'Uji hafalan Anda dengan sistem quiz acak. Cocok untuk evaluasi mandiri sebelum setor ke guru.',
        tips: [
            { icon: '❓', text: 'Sistem menampilkan awal ayat, Anda melanjutkan hafalan secara lisan atau mental.' },
            { icon: '📈', text: 'Skor tersimpan per akun dan bisa dilihat riwayatnya.' },
            { icon: '🎲', text: 'Ayat dipilih secara acak dari Juz yang Anda pilih.' },
        ]
    },
    murojaah: {
        id: 'murojaah',
        icon: '🔄',
        badge: 'Fitur Murojaah',
        title: 'Jadwal Murojaah',
        desc: 'Sistem pengulangan terjadwal agar hafalan tidak mudah lupa. Murojaah otomatis mengingatkan Anda.',
        tips: [
            { icon: '📅', text: 'Atur jadwal murojaah harian atau mingguan per Juz.' },
            { icon: '🔔', text: 'Notifikasi pengingat muncul saat waktunya murojaah.' },
            { icon: '✨', text: 'Sistem Leitner Box — ayat yang sering lupa lebih sering muncul.' },
        ]
    },
    rekam: {
        id: 'rekam',
        icon: '🔴',
        badge: 'Fitur Rekam',
        title: 'Rekam Bacaan',
        desc: 'Rekam bacaan Anda sendiri untuk didengarkan kembali dan dievaluasi secara mandiri.',
        tips: [
            { icon: '🎙️', text: 'Tekan rekam, baca ayat, tekan stop — rekaman tersimpan otomatis.' },
            { icon: '▶️', text: 'Putar ulang rekaman untuk mendengar kualitas bacaan Anda.' },
            { icon: '🗑️', text: 'Hapus rekaman yang tidak diperlukan untuk hemat penyimpanan.' },
        ]
    },
    jadwal: {
        id: 'jadwal',
        icon: '🔔',
        badge: 'Fitur Jadwal',
        title: 'Jadwal & Pengingat',
        desc: 'Atur jadwal hafalan harian dan dapatkan notifikasi pengingat agar tidak terlewat.',
        tips: [
            { icon: '⏰', text: 'Pilih waktu dan target hafalan (Juz atau rentang ayat).' },
            { icon: '📲', text: 'Izinkan notifikasi agar pengingat bisa muncul tepat waktu.' },
            { icon: '📆', text: 'Jadwal tersimpan per akun dan sinkron antar sesi.' },
        ]
    },
    progress: {
        id: 'progress',
        icon: '📊',
        badge: 'Fitur Progress',
        title: 'Progress & Statistik',
        desc: 'Pantau seberapa jauh perjalanan hafalan Anda. Lihat per Juz, per Surah, atau keseluruhan.',
        tips: [
            { icon: '📈', text: 'Grafik progress menampilkan persentase Lancar, Proses, dan Belum.' },
            { icon: '🏆', text: 'Streak harian — konsistensi adalah kunci hafalan kuat.' },
            { icon: '🗓️', text: 'Lihat riwayat aktivitas dan pencapaian Anda setiap hari.' },
        ]
    },
};

let _tutorialCurrentDef = null;
let _tutorialCurrentStep = 0;

function showTutorial(id, force) {
    if (!force && _isTutorialSeen(id)) return;
    const def = TUTORIALS[id];
    if (!def) return;
    _tutorialCurrentDef = def;
    _tutorialCurrentStep = 0;
    _renderTutorialStep();
    _markTutorialSeen(id);
    const ov = document.getElementById('tutorialOverlay');
    if (ov) { ov.classList.add('visible'); }
}

function _renderTutorialStep() {
    const def = _tutorialCurrentDef;
    if (!def) return;
    // Multi-step (welcome) or single
    const isMulti = !!def.steps;
    const step = isMulti ? def.steps[_tutorialCurrentStep] : def;
    const totalSteps = isMulti ? def.steps.length : 1;

    document.getElementById('tutorialIcon').textContent = step.icon;
    document.getElementById('tutorialBadge').innerHTML =
        '<i class="fa-solid fa-circle-info"></i> ' + step.badge;
    document.getElementById('tutorialTitle').textContent = step.title;
    document.getElementById('tutorialDesc').textContent = step.desc;

    // Tips
    const tipsEl = document.getElementById('tutorialTips');
    tipsEl.innerHTML = (step.tips || []).map(t =>
        `<div class="tutorial-tip"><span class="tutorial-tip-icon">${t.icon}</span><span>${t.text}</span></div>`
    ).join('');

    // Step dots
    const dotsEl = document.getElementById('tutorialDots');
    if (totalSteps > 1) {
        dotsEl.innerHTML = Array.from({length: totalSteps}, (_, i) =>
            `<div class="tutorial-dot${i === _tutorialCurrentStep ? ' active' : ''}"></div>`
        ).join('');
        dotsEl.style.display = 'flex';
    } else {
        dotsEl.style.display = 'none';
    }

    // Button label
    const nextBtn = document.getElementById('tutorialNextBtn');
    const isLast = !isMulti || _tutorialCurrentStep === totalSteps - 1;
    nextBtn.textContent = isLast ? 'Mengerti! Mulai →' : 'Lanjut →';
}

function tutorialNext() {
    const def = _tutorialCurrentDef;
    if (!def) return closeTutorial();
    const isMulti = !!def.steps;
    const totalSteps = isMulti ? def.steps.length : 1;
    if (isMulti && _tutorialCurrentStep < totalSteps - 1) {
        _tutorialCurrentStep++;
        _renderTutorialStep();
    } else {
        closeTutorial();
    }
}

function closeTutorial() {
    const ov = document.getElementById('tutorialOverlay');
    if (ov) ov.classList.remove('visible');
    _tutorialCurrentDef = null;
    _tutorialCurrentStep = 0;
}

function tutorialOverlayClick(e) {
    if (e.target === document.getElementById('tutorialOverlay')) closeTutorial();
}

// ── Hook tutorials into feature open functions ──
// We wrap after DOM loaded so original functions exist
document.addEventListener('DOMContentLoaded', () => {
    // Welcome tutorial — show after login
    // Triggered by _applyUser when user first logs in (see auth system)

    // Patch feature openers
    const _origOpenJuz = window.openJuz;
    window.openJuz = function(...args) {
        const r = _origOpenJuz && _origOpenJuz.apply(this, args);
        setTimeout(() => showTutorial('mushaf'), 400);
        return r;
    };

    const _origOpenProgressModal = window.openProgressModal;
    window.openProgressModal = function(...args) {
        const r = _origOpenProgressModal && _origOpenProgressModal.apply(this, args);
        setTimeout(() => showTutorial('progress'), 300);
        return r;
    };

    const _origOpenTasmiModal = window.openTasmiModal;
    window.openTasmiModal = function(...args) {
        const r = _origOpenTasmiModal && _origOpenTasmiModal.apply(this, args);
        setTimeout(() => showTutorial('setor'), 300);
        return r;
    };

    const _origOpenLoopModal = window.openLoopModal;
    window.openLoopModal = function(...args) {
        const r = _origOpenLoopModal && _origOpenLoopModal.apply(this, args);
        setTimeout(() => showTutorial('ulang'), 300);
        return r;
    };

    const _origOpenQuizView = window.openQuizView;
    window.openQuizView = function(...args) {
        const r = _origOpenQuizView && _origOpenQuizView.apply(this, args);
        setTimeout(() => showTutorial('quiz'), 400);
        return r;
    };

    const _origOpenMurojaahView = window.openMurojaahView;
    window.openMurojaahView = function(...args) {
        const r = _origOpenMurojaahView && _origOpenMurojaahView.apply(this, args);
        setTimeout(() => showTutorial('murojaah'), 400);
        return r;
    };

    const _origOpenRecordModal = window.openRecordModal;
    window.openRecordModal = function(...args) {
        const r = _origOpenRecordModal && _origOpenRecordModal.apply(this, args);
        setTimeout(() => showTutorial('rekam'), 300);
        return r;
    };

    const _origOpenScheduleModal = window.openScheduleModal;
    window.openScheduleModal = function(...args) {
        const r = _origOpenScheduleModal && _origOpenScheduleModal.apply(this, args);
        setTimeout(() => showTutorial('jadwal'), 300);
        return r;
    };
});

// ── Hafalan tutorial: triggered when hafalan modal or tab is opened ──
// We listen to a click on "bnavHafalan" bottom nav
document.addEventListener('DOMContentLoaded', () => {
    const hNav = document.getElementById('bnavHafalan');
    if (hNav) {
        hNav.addEventListener('click', () => setTimeout(() => showTutorial('hafalan'), 500));
    }
});

// ── Install button on login page ──
function doLoginInstall() {
    if (window.deferredInstallPrompt) {
        window.deferredInstallPrompt.prompt();
        window.deferredInstallPrompt.userChoice.then(c => {
            if (c.outcome === 'accepted') {
                const btn = document.getElementById('loginInstallBtn');
                if (btn) btn.classList.add('hide');
            }
            window.deferredInstallPrompt = null;
        });
    }
}
