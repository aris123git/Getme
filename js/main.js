import { supabase } from './supabaseClient.js';
import { appState, subscribe } from './state.js';
import { handleAuthChange, login, signUp, logout } from './auth.js';
import { startGeolocation, stopGeolocation, debouncedLoadNearby, centerMapOnUser } from './map.js';
import { loadConversations, sendMessage, closeChat } from './chat.js';
import { updateProfile, uploadAvatar, refreshBalance, unlockUser, reportUser, blockUser, loadReports, isAdmin } from './profile.js';
import { showNotification, setTabActive } from './ui.js';
import { debounce } from './utils.js';

function initEventListeners() {
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
    document.getElementById('enableGpsBtn').onclick = startGeolocation;
    document.getElementById('stopGpsBtn').onclick = stopGeolocation;
    document.getElementById('centerMapBtn').onclick = centerMapOnUser;
    
    const radiusInput = document.getElementById('radiusKm');
    if (radiusInput) {
        radiusInput.oninput = (e) => {
            document.getElementById('radiusValue').innerHTML = `${e.target.value} km`;
            debouncedLoadNearby();
        };
    }
    
    document.getElementById('saveProfileBtn').onclick = updateProfile;
    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar) profileAvatar.onclick = () => document.getElementById('avatarInput').click();
    document.getElementById('avatarInput').onchange = (e) => uploadAvatar(e.target.files[0]);
    document.getElementById('rechargeBtn').onclick = () => showNotification("Rechargement désactivé (mode test)", false);
    document.getElementById('sendMsgBtn').onclick = sendMessage;
    document.getElementById('closeChatBtn').onclick = closeChat;
    document.getElementById('refreshReportsBtn').onclick = loadReports;
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            const tabName = tab.dataset.tab;
            setTabActive(tabName);
            if (tabName === 'messages') loadConversations();
            if (tabName === 'map' && appState.map) {
                setTimeout(() => appState.map.invalidateSize(), 100);
                loadNearbyUsers();
            }
            if (tabName === 'profile') refreshBalance();
            if (tabName === 'admin' && isAdmin()) loadReports();
        };
    });
    
    const messageInput = document.getElementById('messageInput');
    if (messageInput) messageInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
}

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

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('Service Worker enregistré');
        }).catch(err => {
            console.log('Erreur Service Worker:', err);
        });
    }
}

async function init() {
    initEventListeners();
    initStateSubscriptions();
    registerServiceWorker();
    
    // Petite pause pour éviter le conflit de verrou
    await new Promise(r => setTimeout(r, 100));
    
    supabase.auth.onAuthStateChange(() => handleAuthChange());
    await handleAuthChange();
}
