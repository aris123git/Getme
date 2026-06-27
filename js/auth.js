import { supabase } from './supabaseClient.js';
import { showNotification } from './ui.js';

// ── CACHE HELPERS ──

function forceReload() {
    const url = new URL(window.location.href);
    url.searchParams.set('t', Date.now());
    window.location.href = url.toString();
}

async function clearAllCaches() {
    if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
            if (reg.active) {
                reg.active.postMessage('clearCache');
            }
        }
    }
    if ('caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) {
            await caches.delete(key);
        }
    }
    localStorage.removeItem('getme-theme');
    sessionStorage.clear();
}

export async function signUp(email, password) {
    if (!email || !password) {
        showNotification("Email et mot de passe requis", true);
        return false;
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
        showNotification(error.message, true);
        return false;
    }
    showNotification("✅ Compte créé ! Connectez-vous");
    return true;
}

export async function login(email, password) {
    if (!email || !password) {
        showNotification("Email et mot de passe requis", true);
        return false;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        showNotification(error.message, true);
        return false;
    }
    // ✅ CORRECTION : Plus de forceReload() ici
    showNotification("✅ Connexion réussie !");
    return true;
}

export async function logout() {
    await supabase.auth.signOut();
    await clearAllCaches();
    showNotification("🔓 Déconnecté, cache vidé");
}

export async function handleAuthChange() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error("Erreur session:", error);
        return null;
    }
    if (session?.user) {
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('mainScreen').classList.remove('hidden');
        document.getElementById('userName').innerText = session.user.email.split('@')[0];
        return session.user;
    } else {
        document.getElementById('authScreen').classList.remove('hidden');
        document.getElementById('mainScreen').classList.add('hidden');
        return null;
    }
}
