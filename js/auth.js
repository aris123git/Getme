import { supabase } from './supabaseClient.js';
import { showNotification } from './ui.js';
import { api } from './api.js';
import {
    validateUsername,
    validateAge,
    compressImage,
    MIN_AGE
} from './utils.js';
import { loadProfileForm } from './profile.js';

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
    if (msg.includes('duplicate') || msg.includes('unique')) {
        return 'Ce pseudo est déjà pris.';
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
        if (loginBtn) loginBtn.innerHTML = loginBtn.dataset.originalText || 'Entrer';
        if (signupBtn) signupBtn.innerHTML = signupBtn.dataset.originalText || 'Créer un compte';
        return;
    }
    if (mode === 'signup' && signupBtn) signupBtn.innerHTML = 'Création…';
    if (mode === 'login' && loginBtn) loginBtn.innerHTML = 'Connexion…';
}

function requireAdultConfirm() {
    const box = document.getElementById('ageConfirm');
    if (!box?.checked) {
        setAuthMsg('Confirmez que vous avez 18 ans ou plus pour continuer.', true);
        showNotification('Réservé aux adultes 18+', true);
        return false;
    }
    return true;
}

export function setSignupMode(active) {
    const extra = document.getElementById('signupExtra');
    if (!extra) return;
    extra.classList.toggle('hidden', !active);
}

function collectSignupProfile() {
    const username = document.getElementById('signupUsername')?.value.trim() || '';
    const ageRaw = document.getElementById('signupAge')?.value;
    const gender = document.getElementById('signupGender')?.value || '';
    const city = document.getElementById('signupCity')?.value.trim() || '';
    const bio = document.getElementById('signupBio')?.value.trim() || '';
    const avatarFile = document.getElementById('signupAvatar')?.files?.[0] || null;

    if (!validateUsername(username)) {
        return { error: 'Pseudo : 3–30 caractères (lettres, chiffres, _)' };
    }
    if (!validateAge(ageRaw)) {
        return { error: `Âge invalide — minimum ${MIN_AGE} ans` };
    }
    if (!['femme', 'homme', 'autre'].includes(gender)) {
        return { error: 'Choisissez votre sexe' };
    }
    if (!city || city.length < 2) {
        return { error: 'Ville requise' };
    }

    return {
        profile: {
            username,
            age: Number(ageRaw),
            gender,
            city,
            bio,
            photo_visibility: 'public',
            availability: 'now'
        },
        avatarFile
    };
}

async function persistSignupProfile(userId, profile, avatarFile) {
    const { error } = await api.upsertProfile(userId, profile);
    if (error) throw error;
    if (avatarFile) {
        const compressed = await compressImage(avatarFile);
        await api.uploadAvatar(userId, compressed);
    }
}

export async function signUp(email, password) {
    if (!requireAdultConfirm()) return false;
    setSignupMode(true);

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

    const collected = collectSignupProfile();
    if (collected.error) {
        setAuthMsg(collected.error, true);
        showNotification(collected.error, true);
        return false;
    }

    await setAuthBusy(true, 'signup');
    setAuthMsg('Création du compte…');
    try {
        const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
                data: {
                    username: collected.profile.username,
                    age: collected.profile.age,
                    gender: collected.profile.gender,
                    city: collected.profile.city
                }
            }
        });
        if (error) {
            const friendly = friendlyAuthError(error);
            setAuthMsg(friendly, true);
            showNotification(friendly, true);
            return false;
        }

        const user = data?.session?.user || data?.user;
        if (user) {
            try {
                await persistSignupProfile(user.id, collected.profile, collected.avatarFile);
            } catch (profileErr) {
                console.warn('profile after signup:', profileErr);
                setAuthMsg('Compte créé — complétez le profil dans l’onglet Profil (SQL peut manquer).', true);
            }
        }

        if (data?.session?.user) {
            setAuthMsg('Compte créé — bienvenue !');
            showNotification('Compte créé');
            await showAppForUser(data.session.user);
            await loadProfileForm();
            return true;
        }
        setAuthMsg('Compte créé. Si un email de confirmation est requis, validez-le puis connectez-vous.');
        showNotification('Compte créé — vous pouvez vous connecter');
        setSignupMode(false);
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
    if (!requireAdultConfirm()) return false;
    setSignupMode(false);
    const cleanEmail = (email || '').trim();
    if (!cleanEmail || !password) {
        setAuthMsg('Email et mot de passe requis', true);
        showNotification('Email et mot de passe requis', true);
        return false;
    }

    await setAuthBusy(true, 'login');
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
    setSignupMode(false);
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
