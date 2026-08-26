// =============================================
// AUTH / LOGIN SYSTEM
// =============================================
const AUTH_KEY = 'elfashih_auth';

function _getAuth() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch { return null; }
}
function _setAuth(obj) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(obj));
}

// Build a safe storage prefix from identity string
function _makePrefix(id) {
    // e.g. "user_contoh@gmail.com_" or "user_08123_"
    return 'user_' + id.replace(/[^a-zA-Z0-9@._+]/g, '_') + '_';
}

// ── Public API ──────────────────────────────
// Get current user object: { id, type: 'account'|'guest', prefix }
window.elfashihUser = null;

function _applyUser(userObj) {
    window.elfashihUser = userObj;
    // Patch all namespaced storage keys
    _patchStorageKeys(userObj.prefix);
    // Show/hide guest banner
    const gb = document.getElementById('guestBanner');
    if (gb) gb.classList.toggle('show', userObj.type === 'guest');
    // Hide login page
    const lp = document.getElementById('loginPage');
    if (lp) lp.classList.add('hidden');
    // Update logout button label
    const lbl = document.getElementById('logoutBtnLabel');
    if (lbl) {
        if (userObj.type === 'guest') lbl.textContent = 'Tamu';
        else {
            const short = userObj.id.includes('@')
                ? userObj.id.split('@')[0].slice(0, 10)
                : userObj.id.slice(-4);
            lbl.textContent = short;
        }
    }
    // Update drawer logout label
    const dlbl = document.getElementById('drawerLogoutLabel');
    if (dlbl) {
        dlbl.textContent = userObj.type === 'guest' ? 'Keluar (Tamu)' : 'Keluar';
    }
    // Show welcome tutorial on first login
    setTimeout(() => {
        if (typeof showTutorial === 'function') showTutorial('welcome');
    }, 600);
}

// Redirect all elfashih_* storage reads/writes to user-namespaced keys
// We override the key-building functions that are already defined in the app
function _patchStorageKeys(prefix) {
    // Hafalan
    window._elfashihStoragePrefix = prefix;
}

// Override localStorage get/set to namespace elfashih_ keys per user
// We do this by wrapping the native methods safely
(function() {
    const _origGet = Storage.prototype.getItem;
    const _origSet = Storage.prototype.setItem;
    const _origRem = Storage.prototype.removeItem;

    const NAMESPACED = [
        'elfashih_hafalan',
        'elfashih_streak',
        'elfashih_recordings',
        'elfashih_schedules',
        'elfashih_quiz_scores',
        'elfashih_leitner',
        'elfashih_murojaah',
    ];
    const GUEST_BLOCKED = ['elfashih_recordings', 'elfashih_schedules'];

    function nsKey(key) {
        const u = window.elfashihUser;
        if (!u) return key;
        if (NAMESPACED.includes(key)) return u.prefix + key;
        return key;
    }

    Storage.prototype.getItem = function(key) {
        return _origGet.call(this, nsKey(key));
    };
    Storage.prototype.setItem = function(key, value) {
        const u = window.elfashihUser;
        // Block persistent writes for guests on certain keys
        if (u && u.type === 'guest' && GUEST_BLOCKED.includes(key)) return;
        return _origSet.call(this, nsKey(key), value);
    };
    Storage.prototype.removeItem = function(key) {
        return _origRem.call(this, nsKey(key));
    };
})();

// ── Login UI logic ──────────────────────────
let _loginTab = 'gmail';

function switchLoginTab(tab) {
    _loginTab = tab;
    document.getElementById('sectionGmail').classList.toggle('active', tab === 'gmail');
    document.getElementById('sectionPhone').classList.toggle('active', tab === 'phone');
    document.getElementById('tabGmail').classList.toggle('active', tab === 'gmail');
    document.getElementById('tabPhone').classList.toggle('active', tab === 'phone');
    clearLoginError();
}

function clearLoginError() {
    document.getElementById('errorGmail').style.display = 'none';
    document.getElementById('errorPhone').style.display = 'none';
}

function doLogin() {
    clearLoginError();
    let id = '';
    if (_loginTab === 'gmail') {
        const val = document.getElementById('inputGmail').value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
            document.getElementById('errorGmail').style.display = 'block';
            return;
        }
        id = val;
    } else {
        const val = document.getElementById('inputPhone').value.trim().replace(/\s/g, '');
        if (!/^\+?\d{9,15}$/.test(val)) {
            document.getElementById('errorPhone').style.display = 'block';
            return;
        }
        id = val;
    }
    const userObj = { id, type: 'account', prefix: _makePrefix(id) };
    _setAuth(userObj);
    _applyUser(userObj);
    // ── GA4: catat login akun ──
    gaEvent('login', { method: _loginTab === 'gmail' ? 'gmail' : 'phone' });
}

function doLoginGuest() {
    const userObj = { id: 'guest', type: 'guest', prefix: 'guest_' };
    // Don't persist guest auth — so next open shows login again
    _applyUser(userObj);
    // ── GA4: catat masuk sebagai tamu ──
    gaEvent('login', { method: 'guest' });
}

function logoutUser() {
    localStorage.removeItem(AUTH_KEY);
    window.elfashihUser = null;
    // Show login page again
    const lp = document.getElementById('loginPage');
    if (lp) lp.classList.remove('hidden');
    const gb = document.getElementById('guestBanner');
    if (gb) gb.classList.remove('show');
}

// ── Boot: check existing session ──────────────
(function() {
    const saved = _getAuth();
    if (saved && saved.id && saved.type === 'account') {
        _applyUser(saved);
    }
    // else: login page stays visible (it's already in the DOM)
})();
