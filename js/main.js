import { supabase } from './supabaseClient.js';
import { appState, subscribe } from './state.js';
import { handleAuthChange, login, signUp, logout } from './auth.js';
import { startGeolocation, stopGeolocation, debouncedLoadNearby } from './map.js';
import { loadConversations, sendMessage, closeChat } from './chat.js';
import { updateProfile, uploadAvatar, refreshBalance, rechargeAccount } from './profile.js';
import { showNotification, setTabActive } from './ui.js';
import { debounce } from './utils.js';

// Initialisation des écouteurs d'événements
function initEventListeners() {
    // Auth
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
    
    // GPS
    document.getElementById('enableGpsBtn').onclick = startGeolocation;
    document.getElementById('stopGpsBtn').onclick = stopGeolocation;
    
    // Rayon
    const radiusInput = document.getElementById('radiusKm');
    if (radiusInput) {
        radiusInput.oninput = (e) => {
            document.getElementById('radiusValue').innerHTML = `${e.target.value} km`;
            debouncedLoadNearby();
        };
    }
    
    // Profil
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    if (saveProfileBtn) saveProfileBtn.onclick = updateProfile;
    
    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar) {
        profileAvatar.onclick = () => document.getElementById('avatarInput').click();
    }
    
    const avatarInput = document.getElementById('avatarInput');
    if (avatarInput) avatarInput.onchange = (e) => uploadAvatar(e.target.files[0]);
    
    const rechargeBtn = document.getElementById('rechargeBtn');
    if (rechargeBtn) rechargeBtn.onclick = rechargeAccount;
    
    // Chat
    const sendMsgBtn = document.getElementById('sendMsgBtn');
    if (sendMsgBtn) sendMsgBtn.onclick = sendMessage;
    
    const closeChatBtn = document.getElementById('closeChatBtn');
    if (closeChatBtn) closeChatBtn.onclick = closeChat;
    
    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            const tabName = tab.dataset.tab;
            setTabActive(tabName);
            
            if (tabName === 'messages') loadConversations();
            if (tabName === 'map' && appState.map) appState.map.invalidateSize();
            if (tabName === 'profile') refreshBalance();
        };
    });
    
    // Message input - Envoi avec Entrée
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.onkeypress = (e) => {
            if (e.key === 'Enter') sendMessage();
        };
    }
}

// Abonnement aux changements d'état
function initStateSubscriptions() {
    subscribe('balance', (balance) => {
        const userBalanceEl = document.getElementById('userBalance');
        const balanceDisplayEl = document.getElementById('balanceDisplay');
        if (userBalanceEl) userBalanceEl.innerHTML = `💰 ${balance} FCFA`;
        if (balanceDisplayEl) balanceDisplayEl.innerHTML = balance;
    });
    
    subscribe('position', () => {
        if (appState.map && appState.position) {
            appState.map.setView([appState.position.lat, appState.position.lng], 14);
        }
    });
}

// Service Worker pour PWA
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('Service Worker enregistré');
        }).catch(err => {
            console.log('Erreur Service Worker:', err);
        });
    }
}

// Initialisation
async function init() {
    initEventListeners();
    initStateSubscriptions();
    registerServiceWorker();
    
    supabase.auth.onAuthStateChange(() => handleAuthChange());
    await handleAuthChange();
}

// Démarrage
init();
