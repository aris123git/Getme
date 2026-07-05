import { supabase } from './supabaseClient.js';
import { showNotification } from './ui.js';

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
    showNotification("✅ Connexion réussie !");
    return true;
}

export async function logout() {
    await supabase.auth.signOut();
    localStorage.removeItem('getme-theme');
    showNotification("🔓 Déconnecté");
}

export async function handleAuthChange() {
    const { data: { session }, error } = await supabase.auth.getSession();
    console.log('🔍 handleAuthChange appelée, session:', session?.user?.email || 'null', 'error:', error);
    if (error) {
        console.error("Erreur session:", error);
        return null;
    }
    if (session?.user) {
        console.log('✅ Session trouvée, affichage mainScreen');
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('mainScreen').classList.remove('hidden');
        document.getElementById('userName').innerText = session.user.email.split('@')[0];
        return session.user;
    } else {
        console.log('❌ Pas de session, affichage authScreen');
        document.getElementById('authScreen').classList.remove('hidden');
        document.getElementById('mainScreen').classList.add('hidden');
        return null;
    }
}
