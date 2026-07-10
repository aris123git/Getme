import { supabase } from './supabaseClient.js';
import { handleAuthChange, login, signUp, logout } from './auth.js';
import { showNotification, setTabActive } from './ui.js';
import { startGeolocation, stopGeolocation, centerMapOnUser, loadNearbyUsers, debouncedLoadNearby } from './map.js';
import { loadConversations, sendMessage, closeChat } from './chat.js';
import { updateProfile, uploadAvatar, refreshBalance, loadProfileForm } from './profile.js';
import { appState } from './state.js';

// ── AUTH LISTENERS ──
function initAuthListeners() {
    document.getElementById('signupBtn').onclick = () => {
        const email = document.getElementById('email').value;
        const pwd = document.getElementById('password').value;
        signUp(email, pwd);
    };
    document.getElementById('loginBtn').onclick = () => {
        const email = document.getElementById('email').value;
        const pwd = document.getElementById('password').value;
        login(email, pwd);
    };
    document.getElementById('logoutBtn').onclick = logout;
}

// ── TAB LISTENERS ──
function initTabListeners() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            const tabName = tab.dataset.tab;
            setTabActive(tabName);
            if (tabName === 'messages') loadConversations();
            if (tabName === 'profile') { refreshBalance(); loadProfileForm(); }
            if (tabName === 'admin') loadAdminData();
        };
    });
}

// ── MAP LISTENERS ──
function initMapListeners() {
    const enableBtn = document.getElementById('enableGpsBtn');
    const stopBtn = document.getElementById('stopGpsBtn');
    const centerBtn = document.getElementById('centerMapBtn');
    const radiusInput = document.getElementById('radiusKm');

    if (enableBtn) enableBtn.onclick = startGeolocation;
    if (stopBtn) stopBtn.onclick = stopGeolocation;
    if (centerBtn) centerBtn.onclick = centerMapOnUser;

    if (radiusInput) {
        radiusInput.oninput = () => {
            const val = document.getElementById('radiusValue');
            if (val) val.innerHTML = `${radiusInput.value} km`;
            debouncedLoadNearby();
        };
    }
}

// ── PROFILE LISTENERS ──
function initProfileListeners() {
    const saveBtn = document.getElementById('saveProfileBtn');
    const avatar = document.getElementById('profileAvatar');
    const avatarInput = document.getElementById('avatarInput');

    if (saveBtn) saveBtn.onclick = updateProfile;
    if (avatar) avatar.onclick = () => avatarInput?.click();
    if (avatarInput) {
        avatarInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) uploadAvatar(file);
        };
    }
}

// ── CHAT LISTENERS ──
function initChatListeners() {
    const sendBtn = document.getElementById('sendMsgBtn');
    const msgInput = document.getElementById('messageInput');
    const closeBtn = document.getElementById('closeChatBtn');

    if (sendBtn) sendBtn.onclick = sendMessage;
    if (msgInput) {
        msgInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendBtn?.click();
        });
    }
    if (closeBtn) closeBtn.onclick = closeChat;
}

// ── ADMIN ──
async function loadAdminData() {
    const reportsList = document.getElementById('reportsList');
    const bannedList = document.getElementById('bannedList');
    if (reportsList) reportsList.innerHTML = 'Fonctionnalité admin à implémenter';
    if (bannedList) bannedList.innerHTML = 'Fonctionnalité admin à implémenter';
}

function initAdminListeners() {
    const refreshBtn = document.getElementById('refreshReportsBtn');
    if (refreshBtn) refreshBtn.onclick = loadAdminData;
}

// ── THEME TOGGLE ──
function initThemeToggle() {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const saved = localStorage.getItem('getme-theme') || 'dark';
    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        btn.innerHTML = '☀️';
    }
    btn.onclick = () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        if (isLight) {
            document.documentElement.removeAttribute('data-theme');
            btn.innerHTML = '🌙';
            localStorage.setItem('getme-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            btn.innerHTML = '☀️';
            localStorage.setItem('getme-theme', 'light');
        }
    };
}

function initEventListeners() {
    initAuthListeners();
    initTabListeners();
    initMapListeners();
    initProfileListeners();
    initChatListeners();
    initAdminListeners();
    initThemeToggle();
}

async function syncUserState() {
    const user = await handleAuthChange();
    appState.user = user; // ✅ Mis à jour à CHAQUE changement (login, logout, refresh de session)
    if (user) {
        await refreshBalance();
    }
    return user;
}

async function init() {
    // ✅ Recharge la page quand un nouveau SW prend le contrôle
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    }
    initEventListeners();
    supabase.auth.onAuthStateChange(() => syncUserState());
    await syncUserState();
}
init();
