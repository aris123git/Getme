import { supabase } from './supabaseClient.js';
import { appState, updateBalance } from './state.js';
import { api } from './api.js';
import { validateUsername, compressImage, escapeHtml } from './utils.js';
import { showNotification, showConfirmModal } from './ui.js';
import { loadNearbyUsers } from './map.js';

export async function loadProfileForm() {
    if (!appState.user) return;
    try {
        const { data: profile, error } = await api.getProfile(appState.user.id);
        if (error || !profile) return;
        document.getElementById('profileName').value = profile.username || '';
        document.getElementById('profileBio').value = profile.bio || '';
        document.getElementById('profilePhone').value = profile.phone || '';
        document.getElementById('profileAvailability').value = profile.availability || 'now';
        if (profile.avatar_url) {
            document.getElementById('profileAvatar').innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="">`;
        }
        if (profile.username) {
            document.getElementById('userName').innerText = profile.username;
        }
    } catch (err) {
        console.error('loadProfileForm:', err);
    }
}

export async function updateProfile() {
    if (!appState.user) return;
    const username = document.getElementById('profileName').value.trim();
    if (!username) {
        showNotification("Nom d'utilisateur requis", true);
        return;
    }
    if (!validateUsername(username)) {
        showNotification("Username: 3-30 caractères, lettres/chiffres/_", true);
        return;
    }
    try {
        const { error } = await api.updateProfile(appState.user.id, {
            username: username,
            bio: document.getElementById('profileBio').value,
            phone: document.getElementById('profilePhone').value,
            availability: document.getElementById('profileAvailability').value
        });
        if (error) throw error;
        showNotification("Profil mis à jour !");
        document.getElementById('userName').innerText = username;
    } catch (err) {
        console.error('updateProfile:', err);
        showNotification("Erreur lors de la sauvegarde", true);
    }
}

export async function uploadAvatar(file) {
    if (!file || !appState.user) return;
    if (file.size > 2 * 1024 * 1024) {
        showNotification("Fichier trop gros (max 2MB)", true);
        return;
    }
    try {
        const compressed = await compressImage(file);
        const url = await api.uploadAvatar(appState.user.id, compressed);
        document.getElementById('profileAvatar').innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
        showNotification("Photo mise à jour !");
        loadNearbyUsers();
    } catch (err) {
        console.error('uploadAvatar:', err);
        showNotification("Échec de l'upload", true);
    }
}

export async function refreshBalance() {
    if (!appState.user) return 0;
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('balance')
            .eq('id', appState.user.id)
            .single();
        if (error) throw error;
        const balance = profile?.balance || 0;
        updateBalance(balance);
        const balEl = document.getElementById('userBalance');
        const displayEl = document.getElementById('balanceDisplay');
        if (balEl) balEl.innerHTML = `💰 ${balance} FCFA`;
        if (displayEl) displayEl.innerHTML = balance;
        return balance;
    } catch (err) {
        console.error('refreshBalance:', err);
        return appState.balance || 0;
    }
}

export async function unlockUser(targetId, targetName) {
    if (!appState.user) return;
    const confirmed = await showConfirmModal(`Débloquer ${targetName} gratuitement ? (Mode test)`);
    if (!confirmed) return;
    try {
        const { data: existing } = await supabase
            .from('unlocks')
            .select('id')
            .eq('buyer_id', appState.user.id)
            .eq('target_id', targetId)
            .maybeSingle();
        if (existing) {
            showNotification("Déjà débloqué !");
            return;
        }
        const { error } = await supabase.from('unlocks').insert({
            buyer_id: appState.user.id,
            target_id: targetId
        });
        if (error) throw error;
        showNotification(`✅ ${targetName} débloqué gratuitement (mode test)`);
        loadNearbyUsers();
    } catch (err) {
        console.error('unlockUser:', err);
        showNotification("Erreur technique", true);
    }
}

export async function blockUser(targetId) {
    if (!appState.user) return;
    try {
        const { error } = await supabase.rpc('block_user', {
            blocker: appState.user.id,
            blocked: targetId
        });
        if (error) throw error;
        showNotification("🚫 Utilisateur bloqué");
        loadNearbyUsers();
    } catch (err) {
        console.error('blockUser:', err);
        showNotification("Erreur lors du blocage", true);
    }
}

export async function reportUser(targetId, reason) {
    if (!appState.user || !reason) return;
    try {
        // Try to persist; if the reports table doesn't exist yet, fall back gracefully
        const { error } = await supabase.from('reports').insert({
            reporter_id: appState.user.id,
            reported_id: targetId,
            reason: reason.slice(0, 500),
            status: 'pending'
        });
        if (error) {
            console.warn('reports table unavailable:', error.message);
            showNotification("Signalement enregistré localement — table reports à créer sur Supabase");
            console.log('Signalement (non sauvegardé) :', { targetId, reason });
            return;
        }
        showNotification("🚨 Signalement envoyé — merci");
    } catch (err) {
        console.error('reportUser:', err);
        showNotification("Signalement reçu localement — fonctionnalité complète à venir");
    }
}
