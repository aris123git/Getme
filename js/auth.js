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

const PENDING_EMAIL_KEY = 'getme_pending_confirm_email';
let passwordRecoveryMode = false;

function setAuthMsg(text, isError = false) {
    const el = document.getElementById('authMsg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!isError && !!text);
    el.classList.toggle('success', !isError && !!text);
}

/** Where confirmation / recovery emails should send the user back. */
export function authRedirectUrl(path = '/') {
    try {
        const url = new URL(path, window.location.origin);
        return url.href;
    } catch (_) {
        return window.location.origin + '/';
    }
}

function friendlyAuthError(error) {
    const msg = (error?.message || '').toLowerCase();
    const code = error?.code || error?.error_code || '';
    if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
        return 'Confirmez votre email avant de vous connecter (vérifiez boîte mail + spam).';
    }
    if (code === 'invalid_credentials' || msg.includes('invalid login')) {
        return 'Email ou mot de passe incorrect.';
    }
    if (msg.includes('user already registered') || msg.includes('already been registered')) {
        return 'Ce compte existe déjà — connectez-vous.';
    }
    if (msg.includes('rate limit') || msg.includes('email rate') || msg.includes('over_email_send_rate_limit')) {
        return 'Trop d’emails envoyés. Attendez quelques minutes, ou configurez un SMTP custom dans Supabase.';
    }
    if (msg.includes('error sending') || msg.includes('smtp') || msg.includes('confirmation email')) {
        return 'Email non envoyé. Dans Supabase : Auth → SMTP (ou désactivez « Confirm email » en test).';
    }
    if (msg.includes('network') || msg.includes('fetch')) {
        return 'Connexion réseau impossible. Réessayez.';
    }
    if (msg.includes('duplicate') || msg.includes('unique')) {
        return 'Ce pseudo est déjà pris.';
    }
    if (msg.includes('same password') || msg.includes('should be different')) {
        return 'Choisissez un mot de passe différent.';
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

function showConfirmActions(show, email = '') {
    const row = document.getElementById('authConfirmActions');
    if (!row) return;
    row.classList.toggle('hidden', !show);
    if (email) {
        try { sessionStorage.setItem(PENDING_EMAIL_KEY, email); } catch (_) {}
        const emailInput = document.getElementById('email');
        if (emailInput && !emailInput.value) emailInput.value = email;
    }
}

function showRecoveryPanel(show) {
    const panel = document.getElementById('authRecoveryPanel');
    const form = document.getElementById('authForm');
    if (panel) panel.classList.toggle('hidden', !show);
    if (form && show) form.classList.add('hidden');
    if (form && !show) form.classList.remove('hidden');
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

/**
 * After email confirmation, signup often had no session — profile upsert failed.
 * Recreate profile from auth user_metadata on first login.
 */
export async function ensureProfileOnLogin(user) {
    if (!user?.id) return;
    try {
        const { data: existing } = await api.getProfile(user.id);
        if (existing?.username) {
            const userNameEl = document.getElementById('userName');
            if (userNameEl) userNameEl.innerText = existing.username;
            return;
        }

        const meta = user.user_metadata || {};
        let username = (meta.username || '').trim();
        if (!validateUsername(username)) {
            const fromEmail = (user.email || 'user').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
            username = validateUsername(fromEmail) ? fromEmail : ('u_' + user.id.replace(/-/g, '')).slice(0, 30);
        }

        const profile = {
            username,
            age: Number.isInteger(Number(meta.age)) ? Number(meta.age) : null,
            gender: ['femme', 'homme', 'autre'].includes(meta.gender) ? meta.gender : null,
            city: typeof meta.city === 'string' ? meta.city.slice(0, 80) : null,
            bio: typeof meta.bio === 'string' ? meta.bio.slice(0, 280) : '',
            photo_visibility: 'public',
            availability: 'now'
        };

        const { error } = await api.upsertProfile(user.id, profile);
        if (error) throw error;

        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.innerText = username;
    } catch (err) {
        console.warn('ensureProfileOnLogin:', err);
    }
}

export async function signUp(email, password) {
    if (!requireAdultConfirm()) return false;
    setSignupMode(true);

    const cleanEmail = (email || '').trim().toLowerCase();
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
                emailRedirectTo: authRedirectUrl('/'),
                data: {
                    username: collected.profile.username,
                    age: collected.profile.age,
                    gender: collected.profile.gender,
                    city: collected.profile.city,
                    bio: collected.profile.bio || ''
                }
            }
        });
        if (error) {
            const friendly = friendlyAuthError(error);
            setAuthMsg(friendly, true);
            showNotification(friendly, true);
            showConfirmActions(true, cleanEmail);
            return false;
        }

        const sessionUser = data?.session?.user;
        const user = sessionUser || data?.user;

        // With "Confirm email" ON, there is often no session → cannot write profiles (RLS)
        if (sessionUser) {
            try {
                await persistSignupProfile(sessionUser.id, collected.profile, collected.avatarFile);
            } catch (profileErr) {
                console.warn('profile after signup:', profileErr);
                setAuthMsg('Compte créé — complétez le profil dans l’onglet Profil.', true);
            }
            setAuthMsg('Compte créé — bienvenue !');
            showNotification('Compte créé');
            showConfirmActions(false);
            await showAppForUser(sessionUser);
            await loadProfileForm();
            return true;
        }

        // Email confirmation required — profile will be created from metadata after confirm/login
        setAuthMsg(
            'Compte créé. Un email de confirmation vous a été envoyé — validez-le (regardez aussi les spams), puis connectez-vous.'
        );
        showNotification('Vérifiez votre email pour activer le compte');
        showConfirmActions(true, cleanEmail);
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
    const cleanEmail = (email || '').trim().toLowerCase();
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
            if ((error.message || '').toLowerCase().includes('email not confirmed')
                || error.code === 'email_not_confirmed') {
                showConfirmActions(true, cleanEmail);
            }
            return false;
        }
        const user = data?.user || data?.session?.user;
        if (!user) {
            setAuthMsg('Connexion impossible — réessayez', true);
            return false;
        }
        setAuthMsg('');
        showConfirmActions(false);
        try { sessionStorage.removeItem(PENDING_EMAIL_KEY); } catch (_) {}
        showNotification('Connexion réussie');
        await showAppForUser(user);
        await ensureProfileOnLogin(user);
        await loadProfileForm();
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

/** Resend signup confirmation email (Supabase Auth). */
export async function resendConfirmationEmail(email) {
    let cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
        try { cleanEmail = sessionStorage.getItem(PENDING_EMAIL_KEY) || ''; } catch (_) {}
    }
    if (!cleanEmail) {
        cleanEmail = (document.getElementById('email')?.value || '').trim().toLowerCase();
    }
    if (!cleanEmail) {
        setAuthMsg('Entrez votre email pour renvoyer la confirmation.', true);
        return false;
    }

    setAuthMsg('Envoi de l’email de confirmation…');
    try {
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: cleanEmail,
            options: { emailRedirectTo: authRedirectUrl('/') }
        });
        if (error) throw error;
        showConfirmActions(true, cleanEmail);
        setAuthMsg('Email renvoyé. Vérifiez boîte de réception et spam.');
        showNotification('Email de confirmation renvoyé');
        return true;
    } catch (err) {
        const friendly = friendlyAuthError(err);
        setAuthMsg(friendly, true);
        showNotification(friendly, true);
        return false;
    }
}

/** Send password-reset email. */
export async function requestPasswordReset(email) {
    const cleanEmail = (email || document.getElementById('email')?.value || '').trim().toLowerCase();
    if (!cleanEmail) {
        setAuthMsg('Entrez votre email pour réinitialiser le mot de passe.', true);
        showNotification('Email requis', true);
        return false;
    }
    setAuthMsg('Envoi du lien de réinitialisation…');
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
            redirectTo: authRedirectUrl('/')
        });
        if (error) throw error;
        setAuthMsg('Lien envoyé — ouvrez l’email puis choisissez un nouveau mot de passe.');
        showNotification('Email de réinitialisation envoyé');
        return true;
    } catch (err) {
        const friendly = friendlyAuthError(err);
        setAuthMsg(friendly, true);
        showNotification(friendly, true);
        return false;
    }
}

/** After clicking the recovery link, user is signed in with recovery session. */
export async function updatePasswordAfterRecovery(newPassword) {
    if (!newPassword || newPassword.length < 6) {
        setAuthMsg('Mot de passe : 6 caractères minimum', true);
        return false;
    }
    try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        passwordRecoveryMode = false;
        showRecoveryPanel(false);
        setAuthMsg('Mot de passe mis à jour — vous êtes connecté.');
        showNotification('Mot de passe mis à jour');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await showAppForUser(user);
            await ensureProfileOnLogin(user);
            await loadProfileForm();
        }
        return true;
    } catch (err) {
        const friendly = friendlyAuthError(err);
        setAuthMsg(friendly, true);
        showNotification(friendly, true);
        return false;
    }
}

export async function cancelPasswordRecovery() {
    passwordRecoveryMode = false;
    showRecoveryPanel(false);
    try {
        await supabase.auth.signOut();
    } catch (_) {}
    showAuthScreen();
}

export function enterPasswordRecoveryMode() {
    passwordRecoveryMode = true;
    document.getElementById('authScreen')?.classList.remove('hidden');
    document.getElementById('mainScreen')?.classList.add('hidden');
    showRecoveryPanel(true);
    setAuthMsg('Choisissez un nouveau mot de passe.');
}

export function isPasswordRecoveryMode() {
    return passwordRecoveryMode;
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
    showRecoveryPanel(false);
}

export async function showAppForUser(user) {
    // Don't leave the "new password" screen while recovering
    if (passwordRecoveryMode) return;
    document.getElementById('authScreen')?.classList.add('hidden');
    document.getElementById('mainScreen')?.classList.remove('hidden');
    showRecoveryPanel(false);
    const userNameEl = document.getElementById('userName');
    if (userNameEl && user) {
        const metaName = user.user_metadata?.username;
        userNameEl.innerText = metaName || (user.email ? user.email.split('@')[0] : 'Vous');
    }
}

export async function handleAuthChange() {
    try {
        if (passwordRecoveryMode) return null;
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
            console.error('Erreur session:', error);
            showAuthScreen();
            return null;
        }
        if (session?.user) {
            await showAppForUser(session.user);
            await ensureProfileOnLogin(session.user);
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
