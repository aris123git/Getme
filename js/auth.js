import { supabase } from './supabaseClient.js';
import { showNotification } from './ui.js';

function setAuthMsg(text, isError = false) {
    const el = document.getElementById('authMsg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!isError && !!text);
    el.classList.toggle('success', !isError && !!text);
}

function friendlyAuthError(error) {
    const msg = (error?.message || '').toLowerCase();
    const code = error?.code || error?.error_code || '';
    if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
        return 'Confirmez votre email avant de vous connecter (vérifiez votre boîte mail).';
    }
    if (code === 'invalid_credentials' || msg.includes('invalid login')) {
        return 'Email ou mot de passe incorrect.';
    }
    if (msg.includes('user already registered') || msg.includes('already been registered')) {
        return 'Ce compte existe déjà — connectez-vous.';
    }
    if (msg.includes('network') || msg.includes('fetch')) {
        return 'Connexion réseau impossible. Réessayez.';
    }
    return error?.message || 'Erreur d\'authentification';
}

async function setAuthBusy(busy, mode = 'login') {
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    [loginBtn, signupBtn].forEach(btn => {
        if (!btn) return;
        btn.disabled = !!busy;
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerHTML;
    });
    if (!busy) {
        if (loginBtn) loginBtn.innerHTML = loginBtn.dataset.originalText || 'Se connecter';
        if (signupBtn) signupBtn.innerHTML = signupBtn.dataset.originalText || 'Créer un compte';
        return;
    }
    if (mode === 'signup' && signupBtn) signupBtn.innerHTML = 'Création…';
    if (mode === 'login' && loginBtn) loginBtn.innerHTML = 'Connexion…';
}

export async function signUp(email, password) {
    const cleanEmail = (email || '').trim();
    if (!cleanEmail || !password) {
        setAuthMsg('Email et mot de passe requis', true);
        showNotification('Email et mot de passe requis', true);
        return false;
    }
    if (password.length < 6) {
        setAuthMsg('Mot de passe : 6 caractères minimum', true);
        showNotification('Mot de passe : 6 caractères minimum', true);
        return false;
    }

    await setAuthBusy(true);
    setAuthMsg('Création du compte…');
    try {
        const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password
        });
        if (error) {
            const friendly = friendlyAuthError(error);
            setAuthMsg(friendly, true);
            showNotification(friendly, true);
            return false;
        }
        // If session returned, user is already signed in (confirmations disabled)
        if (data?.session?.user) {
            setAuthMsg('Compte créé — bienvenue !');
            showNotification('Compte créé');
            await showAppForUser(data.session.user);
            return true;
        }
        setAuthMsg('Compte créé. Si un email de confirmation est requis, validez-le puis connectez-vous.');
        showNotification('Compte créé — vous pouvez vous connecter');
        return true;
    } catch (err) {
        const friendly = friendlyAuthError(err);
        setAuthMsg(friendly, true);
        showNotification(friendly, true);
        return false;
    } finally {
        await setAuthBusy(false);
    }
}

export async function login(email, password) {
    const cleanEmail = (email || '').trim();
    if (!cleanEmail || !password) {
        setAuthMsg('Email et mot de passe requis', true);
        showNotification('Email et mot de passe requis', true);
        return false;
    }

    await setAuthBusy(true);
    setAuthMsg('Connexion…');
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password
        });
        if (error) {
            const friendly = friendlyAuthError(error);
            setAuthMsg(friendly, true);
            showNotification(friendly, true);
            return false;
        }
        const user = data?.user || data?.session?.user;
        if (!user) {
            setAuthMsg('Connexion impossible — réessayez', true);
            return false;
        }
        setAuthMsg('');
        showNotification('Connexion réussie');
        await showAppForUser(user);
        return true;
    } catch (err) {
        const friendly = friendlyAuthError(err);
        setAuthMsg(friendly, true);
        showNotification(friendly, true);
        return false;
    } finally {
        await setAuthBusy(false);
    }
}

export async function logout() {
    try {
        await supabase.auth.signOut();
    } catch (err) {
        console.warn('logout:', err);
    }
    showAuthScreen();
    showNotification('Déconnecté');
}

export function showAuthScreen() {
    document.getElementById('authScreen')?.classList.remove('hidden');
    document.getElementById('mainScreen')?.classList.add('hidden');
}

export async function showAppForUser(user) {
    document.getElementById('authScreen')?.classList.add('hidden');
    document.getElementById('mainScreen')?.classList.remove('hidden');
    const userNameEl = document.getElementById('userName');
    if (userNameEl && user?.email) {
        userNameEl.innerText = user.email.split('@')[0];
    }
}

export async function handleAuthChange() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
            console.error('Erreur session:', error);
            showAuthScreen();
            return null;
        }
        if (session?.user) {
            await showAppForUser(session.user);
            return session.user;
        }
        showAuthScreen();
        return null;
    } catch (err) {
        console.error('handleAuthChange:', err);
        showAuthScreen();
        return null;
    }
}
