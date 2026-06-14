import { supabase } from './supabaseClient.js';
import { handleAuthChange, login, signUp, logout } from './auth.js';
import { showNotification, setTabActive } from './ui.js';

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
}

async function init() {
    initEventListeners();
    supabase.auth.onAuthStateChange(() => handleAuthChange());
    await handleAuthChange();
}

init();
