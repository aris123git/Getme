import supabaseJs from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const { createClient } = supabaseJs;

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { handleAuthChange, login, signUp, logout } from './auth.js';
import { startGeolocation, stopGeolocation, debouncedLoadNearby } from './map.js';
import { loadConversations, sendMessage, closeChat } from './chat.js';
import { updateProfile, uploadAvatar, refreshBalance, rechargeAccount } from './profile.js';
import { showNotification, setTabActive } from './ui.js';
import { debounce } from './utils.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    document.getElementById('saveProfileBtn').onclick = updateProfile;
    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar) {
        profileAvatar.onclick = () => document.getElementById('avatarInput').click();
    }
    document.getElementById('avatarInput').onchange = (e) => uploadAvatar(e.target.files[0]);
    document.getElementById('rechargeBtn').onclick = rechargeAccount;
    
    // Chat
    document.getElementById('sendMsgBtn').onclick = sendMessage;
    document.getElementById('closeChatBtn').onclick = closeChat;
    
    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            const tabName = tab.dataset.tab;
            setTabActive(tabName);
            
            if (tabName === 'messages') loadConversations();
            if (tabName === 'map' && window.map) window.map.invalidateSize();
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

// Initialisation
async function init() {
    initEventListeners();
    
    supabase.auth.onAuthStateChange(() => handleAuthChange());
    await handleAuthChange();
}

// Démarrage
init();
