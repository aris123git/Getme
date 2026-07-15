import { supabase } from './supabaseClient.js';
import { handleAuthChange, login, signUp, logout } from './auth.js';
import { showNotification, setTabActive, withLoading } from './ui.js';
import { startGeolocation, stopGeolocation, centerMapOnUser, loadNearbyUsers, debouncedLoadNearby } from './map.js';
import { loadConversations, sendMessage, closeChat, subscribeToGlobalMessages, unsubscribeFromMessages } from './chat.js';
import { updateProfile, uploadAvatar, refreshBalance, loadProfileForm } from './profile.js';
import { appState } from './state.js';

const CACHE_VERSION = 'v3.3.0';

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
            // Sync range fill visual
            const pct = ((radiusInput.value - radiusInput.min) / (radiusInput.max - radiusInput.min)) * 100;
            radiusInput.style.backgroundSize = `${pct}% 100%`;
            debouncedLoadNearby();
        };
        // Init fill
        const pct = ((radiusInput.value - radiusInput.min) / (radiusInput.max - radiusInput.min)) * 100;
        radiusInput.style.backgroundSize = `${pct}% 100%`;
    }
}

// ── PROFILE LISTENERS ──
function initProfileListeners() {
    const saveBtn = document.getElementById('saveProfileBtn');
    const avatar = document.getElementById('profileAvatar');
    const avatarInput = document.getElementById('avatarInput');
    const rechargeBtn = document.getElementById('rechargeBtn');

    if (saveBtn) {
        saveBtn.onclick = withLoading(saveBtn, updateProfile, '⏳ Enregistrement…');
    }
    if (avatar) avatar.onclick = () => avatarInput?.click();
    if (avatarInput) {
        avatarInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) uploadAvatar(file);
        };
    }
    if (rechargeBtn) {
        rechargeBtn.classList.remove('hidden');
        rechargeBtn.onclick = () => {
            showNotification('📱 Envoyez un paiement Orange Money / Wave — le solde se mettra à jour automatiquement');
        };
    }
}

// ── CHAT LISTENERS ──
function initChatListeners() {
    const sendBtn = document.getElementById('sendMsgBtn');
    const msgInput = document.getElementById('messageInput');
    const closeBtn = document.getElementById('closeChatBtn');

    if (sendBtn) {
        sendBtn.onclick = withLoading(sendBtn, sendMessage, '⏳');
    }
    if (msgInput) {
        msgInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !sendBtn?.disabled) sendBtn?.click();
        });
    }
    if (closeBtn) closeBtn.onclick = closeChat;
}

// ── ADMIN ──
async function loadAdminData() {
    const reportsList = document.getElementById('reportsList');
    const bannedList = document.getElementById('bannedList');
    if (reportsList) {
        reportsList.innerHTML = '<div class="info-card">Les signalements apparaîtront ici une fois la table <code>reports</code> créée sur Supabase.</div>';
    }
    if (bannedList) {
        bannedList.innerHTML = '<div class="info-card">Aucun utilisateur banni pour le moment.</div>';
    }
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

// ── CLEAR CACHE ──
function initClearCache() {
    const btn = document.getElementById('clearCacheBtn');
    if (!btn) return;
    btn.onclick = async () => {
        try {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage('clearCache');
            }
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
            }
            showNotification('🔄 Cache vidé — rechargement…');
            setTimeout(() => window.location.reload(), 600);
        } catch (err) {
            console.error(err);
            showNotification('Impossible de vider le cache', true);
        }
    };
}

// ── SERVICE WORKER ──
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
        await navigator.serviceWorker.register(`/sw.js?v=${CACHE_VERSION}`);
    } catch (err) {
        console.warn('SW registration failed:', err);
    }
}

function initEventListeners() {
    initAuthListeners();
    initTabListeners();
    initMapListeners();
    initProfileListeners();
    initChatListeners();
    initAdminListeners();
    initThemeToggle();
    initClearCache();
}

async function syncUserState() {
    const user = await handleAuthChange();
    appState.user = user;
    if (user) {
        await refreshBalance();
        subscribeToGlobalMessages(user.id, () => {
            const messagesTab = document.getElementById('messagesTab');
            const chatView = document.getElementById('chatView');
            const chatOpen = chatView && !chatView.classList.contains('hidden');
            if (messagesTab && !messagesTab.classList.contains('hidden') && !chatOpen) {
                loadConversations();
            }
        });
        const adminEmails = ['admin@getme.app'];
        const adminBtn = document.getElementById('adminTabBtn');
        if (adminBtn && adminEmails.includes(user.email)) {
            adminBtn.style.display = '';
        }
    } else {
        await unsubscribeFromMessages();
    }
    return user;
}

async function init() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    }
    await registerServiceWorker();
    initEventListeners();

    // Refresh inbox when app comes back to foreground
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && appState.user) {
            subscribeToGlobalMessages(appState.user.id);
        }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
        // Keep appState in sync with auth events
        if (!session) {
            appState.user = null;
        }
        syncUserState();
    });
    await syncUserState();
}
init();
