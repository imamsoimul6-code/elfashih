// =============================================
// BOTTOM NAV HELPERS
// =============================================
function toggleBNavMore() {
    const overlay = document.getElementById('moreDrawerOverlay');
    const drawer  = document.getElementById('moreDrawer');
    const btn     = document.getElementById('bnavMore');
    const open    = drawer.classList.contains('open');
    if (open) {
        drawer.classList.remove('open');
        overlay.classList.remove('open');
        btn.classList.remove('active');
    } else {
        drawer.classList.add('open');
        overlay.classList.add('open');
        btn.classList.add('active');
    }
}
function closeBNavMore() {
    document.getElementById('moreDrawer').classList.remove('open');
    document.getElementById('moreDrawerOverlay').classList.remove('open');
    document.getElementById('bnavMore').classList.remove('active');
}

// =============================================
// DUKUNG PENGEMBANG — MODAL
// =============================================
function openSupportModal() {
    document.getElementById('supportModalOverlay').classList.add('visible');
}
function closeSupportModal() {
    document.getElementById('supportModalOverlay').classList.remove('visible');
}
function copyRekening() {
    const noRek = '667601029194536';
    navigator.clipboard.writeText(noRek).then(() => {
        const btn = document.getElementById('copyRekBtn');
        btn.textContent = '✓ Tersalin!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = 'Salin';
            btn.classList.remove('copied');
        }, 2500);
        showToast('✅ Nomor rekening berhasil disalin!');
    }).catch(() => {
        // Fallback untuk browser yang tidak support clipboard API
        const el = document.createElement('textarea');
        el.value = noRek;
        el.style.position = 'fixed'; el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        const btn = document.getElementById('copyRekBtn');
        btn.textContent = '✓ Tersalin!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Salin'; btn.classList.remove('copied'); }, 2500);
        showToast('✅ Nomor rekening berhasil disalin!');
    });
}

// Sync bottom nav view buttons with setViewMode
const _origSetViewMode = window.setViewMode;
document.addEventListener('DOMContentLoaded', () => {
    // Patch setViewMode to sync bnav buttons
    if (typeof setViewMode === 'function') {
        const orig = setViewMode;
        window.setViewMode = function(mode) {
            orig(mode);
            document.getElementById('bnavMushaf').classList.toggle('active', mode === 'mushaf');
            document.getElementById('bnavDigital').classList.toggle('active', mode === 'digital');
        };
    }
});

// Sync play button state
function updateBNavPlay() {
    setTimeout(() => {
        const audio = document.getElementById('quranAudio');
        const playing = audio && !audio.paused;
        const bnavBtn = document.getElementById('bnavPlayBtn');
        const icon    = document.getElementById('bnavPlayIcon');
        const dIcon   = document.getElementById('drawerPlayIcon');
        const dLabel  = document.getElementById('drawerPlayLabel');
        const dBtn    = document.getElementById('drawerPlayAllBtn');
        if (playing) {
            icon && (icon.className = 'fa-solid fa-pause');
            dIcon && (dIcon.className = 'fa-solid fa-pause');
            dLabel && (dLabel.textContent = 'Pause');
            bnavBtn && bnavBtn.classList.remove('paused');
            dBtn && dBtn.classList.remove('paused');
        } else {
            icon && (icon.className = 'fa-solid fa-play');
            dIcon && (dIcon.className = 'fa-solid fa-play');
            dLabel && (dLabel.textContent = 'Putar Semua');
            bnavBtn && bnavBtn.classList.add('paused');
            dBtn && dBtn.classList.add('paused');
        }
    }, 80);
}

// Sync badge murojaah ke drawer + active states — merged into 1 interval (1s)
function syncUIStates() {
    // Badge murojaah
    const src  = document.getElementById('mrjTopBadge');
    const dest = document.getElementById('mrjDrawerBadge');
    if (src && dest) dest.style.display = src.style.display;
    // Blind/paper/loop active states
    const blindActive = document.getElementById('blindModeBtn')?.classList.contains('active');
    const paperActive = document.getElementById('paperModeBtn')?.classList.contains('active');
    const dBlind = document.getElementById('ditemBlind');
    const dPaper = document.getElementById('ditemPaper');
    if (dBlind) dBlind.classList.toggle('active', !!blindActive);
    if (dPaper) dPaper.classList.toggle('active', !!paperActive);
    // Bottom nav active states
    const bnavHafalan = document.getElementById('bnavHafalan');
    if (bnavHafalan) bnavHafalan.classList.toggle('active', !!blindActive);
    const bnavLoop = document.getElementById('bnavLoop');
    if (bnavLoop) bnavLoop.classList.toggle('active', !!window.isRepeatAyah);
}
setInterval(syncUIStates, 1000);
