import { supabase } from './supabaseClient.js';
import { showNotification } from './ui.js';

export async function signUp(email, password) {
    if (!email || !password) {
        showNotification("Email et mot de passe requis", true);
        return false;
    }
    if (password.length < 6) {
        showNotification("Mot de passe : 6 caractères minimum", true);
        return false;
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
        showNotification(error.message, true);
        return false;
    }
    showNotification("Compte créé ! Vérifiez votre email si demandé, puis connectez-vous");
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
    showNotification("Connexion réussie");
    return true;
}

export async function logout() {
    await supabase.auth.signOut();
    showNotification("Déconnecté");
}

export async function handleAuthChange() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error("Erreur session:", error);
        return null;
    }
    const authScreen = document.getElementById('authScreen');
    const mainScreen = document.getElementById('mainScreen');
    const userNameEl = document.getElementById('userName');

    if (session?.user) {
        authScreen?.classList.add('hidden');
        mainScreen?.classList.remove('hidden');
        if (userNameEl) {
            userNameEl.innerText = session.user.email.split('@')[0];
        }
        return session.user;
    }

    authScreen?.classList.remove('hidden');
    mainScreen?.classList.add('hidden');
    return null;
}
