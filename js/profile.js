import { supabase } from './supabaseClient.js';
import { appState, updateBalance } from './state.js';
import { api } from './api.js';
import { UNLOCK_COST } from './config.js';
import { validateUsername, validatePhone, compressImage } from './utils.js';
import { showNotification, showLoading } from './ui.js';
import { loadNearbyUsers } from './map.js';

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
        phone: document.getElementById('profilePhone').value
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
    const balance = await api.updateBalance(appState.user.id);
    updateBalance(balance);
    document.getElementById('userBalance').innerHTML = `💰 ${balance} FCFA`;
    document.getElementById('balanceDisplay').innerHTML = balance;
    return balance;
}

export async function unlockUser(targetId, targetName) {
    const balance = await refreshBalance();
    if (balance < UNLOCK_COST) {
        showNotification(`Solde insuffisant. Besoin de ${UNLOCK_COST} FCFA`, true);
        return;
    }
    
    if (!confirm(`Débloquer ${targetName} pour ${UNLOCK_COST} FCFA ?`)) return;
    
    const success = await api.unlockUser(appState.user.id, targetId, UNLOCK_COST);
    
    if (!success) {
        showNotification("Erreur lors du déblocage", true);
        return;
    }
    
    await refreshBalance();
    showNotification(`✅ ${targetName} débloqué !`);
    loadNearbyUsers();
}

export function rechargeAccount() {
    showNotification("Paiement Orange Money - bientôt disponible", false);
}
