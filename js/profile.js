import { supabase } from './supabaseClient.js';
import { appState, updateBalance } from './state.js';
import { api } from './api.js';
import { UNLOCK_COST } from './config.js';
import { validateUsername, compressImage } from './utils.js';
import { showNotification, showConfirmModal } from './ui.js';
import { loadNearbyUsers } from './map.js';

export async function loadProfileForm() {
    const { data: profile, error } = await api.getProfile(appState.user.id);
    if (error || !profile) return;
    document.getElementById('profileName').value = profile.username || '';
    document.getElementById('profileBio').value = profile.bio || '';
    document.getElementById('profilePhone').value = profile.phone || '';
    document.getElementById('profileAvailability').value = profile.availability || 'now';
    if (profile.avatar_url) {
        document.getElementById('profileAvatar').innerHTML = `<img src="${profile.avatar_url}">`;
    }
}

export async function updateProfile() {
    const username = document.getElementById('profileName').value.trim();
    if (!username) {
        showNotification("Nom d'utilisateur requis", true);
        return;
    }
    if (!validateUsername(username)) {
        showNotification("Username: 3-30 caractères, lettres/chiffres/_", true);
        return;
    }
    await api.updateProfile(appState.user.id, {
        username: username,
        bio: document.getElementById('profileBio').value,
        phone: document.getElementById('profilePhone').value,
        availability: document.getElementById('profileAvailability').value
    });
    showNotification("Profil mis à jour !");
    document.getElementById('userName').innerText = username;
}

export async function uploadAvatar(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        showNotification("Fichier trop gros (max 2MB)", true);
        return;
    }
    const compressed = await compressImage(file);
    const url = await api.uploadAvatar(appState.user.id, compressed);
    document.getElementById('profileAvatar').innerHTML = `<img src="${url}">`;
    showNotification("Photo mise à jour !");
    loadNearbyUsers();
}

export async function refreshBalance() {
    const { data: profile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', appState.user.id)
        .single();
    const balance = profile?.balance || 0;
    updateBalance(balance);
    document.getElementById('userBalance').innerHTML = `💰 ${balance} FCFA`;
    document.getElementById('balanceDisplay').innerHTML = balance;
    return balance;
}

export async function unlockUser(targetId, targetName) {
    const confirmed = await showConfirmModal(`Débloquer ${targetName} gratuitement ? (Mode test)`);
    if (!confirmed) return;
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
    if (error) {
        showNotification("Erreur technique", true);
        return;
    }
    showNotification(`✅ ${targetName} débloqué gratuitement (mode test)`);
    loadNearbyUsers();
}

export async function blockUser(targetId) {
    const { error } = await supabase.rpc('block_user', {
        blocker: appState.user.id,
        blocked: targetId
    });
    if (error) {
        showNotification("Erreur lors du blocage", true);
        return;
    }
    showNotification("🚫 Utilisateur bloqué");
    loadNearbyUsers();
}

export async function reportUser(targetId, reason) {
    // ⚠️ Fonctionnalité en attente : la table "reports" n'existe pas encore côté Supabase.
    showNotification("Signalement reçu localement — fonctionnalité complète à venir", false);
    console.log('Signalement (non sauvegardé) :', { targetId, reason });
}
