import { supabase } from './supabaseClient.js';
import { appState, updateBalance } from './state.js';
import { api } from './api.js';
import { UNLOCK_COST } from './config.js';
import { validateUsername, compressImage } from './utils.js';
import { showNotification } from './ui.js';
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
    // Mode test gratuit
    if (!confirm(`Débloquer ${targetName} gratuitement ? (Mode test)`)) return;
    
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

// ========== SIGNALEMENT & BLOCAGE ==========
export async function reportUser(reportedId, reason) {
    const { error } = await supabase
        .from('reports')
        .insert({
            reporter_id: appState.user.id,
            reported_id: reportedId,
            reason: reason
        });
    if (error) {
        showNotification("Erreur lors du signalement", true);
    } else {
        showNotification("Merci, nous allons vérifier ce profil");
    }
}

export async function blockUser(blockedId) {
    const { error } = await supabase.rpc('block_user', {
        blocker: appState.user.id,
        blocked: blockedId
    });
    if (error) {
        showNotification("Erreur lors du blocage", true);
    } else {
        showNotification("Utilisateur bloqué");
        loadNearbyUsers();
    }
}

export async function isAdmin() {
    const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', appState.user.id)
        .single();
    return data?.is_admin === true;
}

export async function loadReports() {
    if (!(await isAdmin())) {
        showNotification("Accès réservé", true);
        return;
    }
    const { data } = await supabase
        .from('reports')
        .select('*, reporter:reporter_id(username), reported:reported_id(username)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
    
    const container = document.getElementById('reportsList');
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="info-card">Aucun signalement en attente</div>';
        return;
    }
    container.innerHTML = data.map(r => `
        <div class="user-card">
            <div>
                <strong>Signalé :</strong> ${r.reported?.username}<br>
                <strong>Par :</strong> ${r.reporter?.username}<br>
                <strong>Motif :</strong> ${r.reason}<br>
                <small>${new Date(r.created_at).toLocaleString()}</small>
            </div>
            <button class="ban-btn" data-id="${r.reported_id}">🚫 Bannir</button>
        </div>
    `).join('');
    
    document.querySelectorAll('.ban-btn').forEach(btn => {
        btn.onclick = async () => {
            await supabase.from('profiles').update({ banned: true }).eq('id', btn.dataset.id);
            await supabase.from('reports').update({ status: 'resolved' }).eq('reported_id', btn.dataset.id);
            showNotification("Utilisateur banni");
            loadReports();
        };
    });
}
