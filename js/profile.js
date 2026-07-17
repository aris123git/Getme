import { supabase } from './supabaseClient.js';
import { appState, updateBalance } from './state.js';
import { api } from './api.js';
import {
    validateUsername,
    validateAge,
    compressImage,
    escapeHtml,
    genderLabel,
    visibilityLabel,
    MIN_AGE
} from './utils.js';
import { showNotification, showConfirmModal } from './ui.js';
import { loadNearbyUsers } from './map.js';
import { loadOwnGallery } from './photos.js';

function setAvatarPreview(url, username) {
    const html = url
        ? `<img src="${escapeHtml(url)}" alt="">`
        : escapeHtml((username || 'G').charAt(0).toUpperCase());
    const header = document.getElementById('profileAvatar');
    const hero = document.getElementById('profileHeroAvatar');
    if (header) header.innerHTML = html;
    if (hero) hero.innerHTML = html;
}

function updateMetaLine(profile) {
    const el = document.getElementById('profileMetaLine');
    if (!el || !profile) return;
    const bits = [];
    if (profile.age) bits.push(`${profile.age} ans`);
    if (genderLabel(profile.gender)) bits.push(genderLabel(profile.gender));
    if (profile.city) bits.push(profile.city);
    bits.push(visibilityLabel(profile.photo_visibility || 'public'));
    el.textContent = bits.join(' · ') || 'Complétez votre profil';
}

export async function loadProfileForm() {
    if (!appState.user) return;
    try {
        const { data: profile, error } = await api.getProfile(appState.user.id);
        if (error || !profile) return;
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val ?? '';
        };
        set('profileName', profile.username || '');
        set('profileBio', profile.bio || '');
        set('profilePhone', profile.phone || '');
        set('profileAvailability', profile.availability || 'now');
        set('profileAge', profile.age ?? '');
        set('profileGender', profile.gender || '');
        set('profileCity', profile.city || '');
        set('profilePhotoVisibility', profile.photo_visibility || 'public');

        if (profile.avatar_url || profile.username) {
            setAvatarPreview(profile.avatar_url, profile.username);
        }
        if (profile.username) {
            const userNameEl = document.getElementById('userName');
            if (userNameEl) userNameEl.innerText = profile.username;
        }
        updateMetaLine(profile);
        await loadOwnGallery();
    } catch (err) {
        console.error('loadProfileForm:', err);
    }
}

export async function updateProfile() {
    if (!appState.user) return;
    const username = document.getElementById('profileName')?.value.trim() || '';
    const ageRaw = document.getElementById('profileAge')?.value;
    const gender = document.getElementById('profileGender')?.value || null;
    const city = document.getElementById('profileCity')?.value.trim() || '';
    const photoVisibility = document.getElementById('profilePhotoVisibility')?.value || 'public';

    if (!username) {
        showNotification("Pseudo requis", true);
        return;
    }
    if (!validateUsername(username)) {
        showNotification("Pseudo : 3-30 caractères, lettres/chiffres/_", true);
        return;
    }
    if (ageRaw !== '' && ageRaw != null && !validateAge(ageRaw)) {
        showNotification(`Âge invalide (min. ${MIN_AGE})`, true);
        return;
    }

    const payload = {
        username,
        bio: document.getElementById('profileBio')?.value || '',
        phone: document.getElementById('profilePhone')?.value || '',
        availability: document.getElementById('profileAvailability')?.value || 'now',
        city,
        photo_visibility: photoVisibility
    };
    if (ageRaw !== '' && ageRaw != null) payload.age = Number(ageRaw);
    if (gender) payload.gender = gender;

    try {
        const { error } = await api.updateProfile(appState.user.id, payload);
        if (error) throw error;
        showNotification('Profil mis à jour !');
        document.getElementById('userName').innerText = username;
        updateMetaLine({ ...payload, age: payload.age });
        loadNearbyUsers({ force: true });
    } catch (err) {
        console.error('updateProfile:', err);
        showNotification(err.message || 'Erreur lors de la sauvegarde — vérifiez le SQL Supabase', true);
    }
}

export async function uploadAvatar(file) {
    if (!file || !appState.user) return;
    try {
        const compressed = await compressImage(file);
        const url = await api.uploadAvatar(appState.user.id, compressed);
        const name = document.getElementById('profileName')?.value || 'G';
        setAvatarPreview(url, name);
        showNotification('Photo de profil mise à jour !');
        loadNearbyUsers({ force: true });
    } catch (err) {
        console.error('uploadAvatar:', err);
        showNotification(err.message || "Échec de l'upload", true);
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
        if (balEl) balEl.innerHTML = `${balance} FCFA`;
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
            showNotification('Déjà débloqué !');
            return;
        }
        const { error } = await supabase.from('unlocks').insert({
            buyer_id: appState.user.id,
            target_id: targetId
        });
        if (error) throw error;
        showNotification(`${targetName} débloqué (mode test)`);
        loadNearbyUsers({ force: true });
    } catch (err) {
        console.error('unlockUser:', err);
        showNotification('Erreur technique', true);
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
        showNotification('Utilisateur bloqué');
        loadNearbyUsers({ force: true });
    } catch (err) {
        console.error('blockUser:', err);
        showNotification('Erreur lors du blocage — exécutez CREATE_PROFILES_PHOTOS.sql', true);
    }
}

export async function reportUser(targetId, reason) {
    if (!appState.user || !reason) return;
    try {
        const { error } = await supabase.from('reports').insert({
            reporter_id: appState.user.id,
            reported_id: targetId,
            reason: reason.slice(0, 500),
            status: 'pending'
        });
        if (error) {
            console.warn('reports:', error.message);
            showNotification('Signalement non enregistré — exécutez CREATE_PROFILES_PHOTOS.sql', true);
            return;
        }
        showNotification('Signalement envoyé — merci');
    } catch (err) {
        console.error('reportUser:', err);
        showNotification('Erreur signalement', true);
    }
}
