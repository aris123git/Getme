import { supabase } from './main.js';
import { setState, updateBalance } from './state.js';
import { showNotification } from './ui.js';
import { api } from './api.js';

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
    
    return true;
}

export async function logout() {
    await supabase.auth.signOut();
}

export async function handleAuthChange() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
        const { data: profile } = await api.getProfile(session.user.id);
        setState('user', session.user);
        updateBalance(profile?.balance || 0);
        
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('mainScreen').classList.remove('hidden');
        
        document.getElementById('userName').innerText = profile?.username || session.user.email.split('@')[0];
        if (profile?.avatar_url) {
            document.getElementById('profileAvatar').innerHTML = `<img src="${profile.avatar_url}">`;
        }
        
        return session.user;
    } else {
        setState('user', null);
        document.getElementById('authScreen').classList.remove('hidden');
        document.getElementById('mainScreen').classList.add('hidden');
        return null;
    }
}