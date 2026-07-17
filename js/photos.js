import { supabase } from './supabaseClient.js';
import { appState } from './state.js';
import { api } from './api.js';
import {
    compressImage,
    escapeHtml,
    MAX_GALLERY_PHOTOS,
    visibilityLabel
} from './utils.js';
import { showNotification, showConfirmModal } from './ui.js';

async function signedUrlForPath(path) {
    const { data, error } = await supabase.storage
        .from('profile-photos')
        .createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
}

export async function loadOwnGallery() {
    const gallery = document.getElementById('photoGallery');
    if (!gallery || !appState.user) return;
    gallery.innerHTML = '<div class="info-card loading">Chargement…</div>';
    try {
        const photos = await api.listOwnPhotos(appState.user.id);
        if (!photos.length) {
            gallery.innerHTML = '<div class="info-card">Aucune photo dans la galerie</div>';
            return;
        }
        const cards = await Promise.all(photos.map(async (photo) => {
            let url = '';
            try {
                url = await signedUrlForPath(photo.storage_path);
            } catch {
                url = '';
            }
            return `<div class="gallery-item" data-id="${escapeHtml(photo.id)}">
                ${url ? `<img src="${escapeHtml(url)}" alt="">` : '<div class="gallery-placeholder">?</div>'}
                <button type="button" class="gallery-delete danger small" data-id="${escapeHtml(photo.id)}">Supprimer</button>
            </div>`;
        }));
        gallery.innerHTML = cards.join('');
        gallery.querySelectorAll('.gallery-delete').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const photo = photos.find(p => p.id === id);
                const ok = await showConfirmModal('Supprimer cette photo ?');
                if (!ok || !photo) return;
                try {
                    await api.deleteGalleryPhoto(appState.user.id, photo);
                    showNotification('Photo supprimée');
                    loadOwnGallery();
                } catch (err) {
                    console.error(err);
                    showNotification(err.message || 'Suppression impossible', true);
                }
            };
        });
    } catch (err) {
        console.error('loadOwnGallery:', err);
        gallery.innerHTML = '<div class="info-card">Galerie indisponible — exécutez CREATE_PROFILES_PHOTOS.sql</div>';
    }
}

export async function addGalleryPhotos(fileList) {
    if (!appState.user || !fileList?.length) return;
    try {
        const existing = await api.listOwnPhotos(appState.user.id);
        const room = MAX_GALLERY_PHOTOS - existing.length;
        if (room <= 0) {
            showNotification(`Maximum ${MAX_GALLERY_PHOTOS} photos`, true);
            return;
        }
        const files = Array.from(fileList).slice(0, room);
        let sort = existing.length;
        for (const file of files) {
            const compressed = await compressImage(file);
            await api.uploadGalleryPhoto(appState.user.id, compressed, sort++);
        }
        showNotification(files.length > 1 ? `${files.length} photos ajoutées` : 'Photo ajoutée');
        await loadOwnGallery();
    } catch (err) {
        console.error('addGalleryPhotos:', err);
        showNotification(err.message || 'Upload impossible', true);
    }
}

export async function setPhotoVisibility(mode) {
    if (!appState.user) return;
    if (!['public', 'private', 'on_request'].includes(mode)) return;
    try {
        const { error } = await api.updateProfile(appState.user.id, { photo_visibility: mode });
        if (error) throw error;
        const sel = document.getElementById('profilePhotoVisibility');
        if (sel) sel.value = mode;
        showNotification(`Photos : ${visibilityLabel(mode)}`);
    } catch (err) {
        console.error(err);
        showNotification('Impossible de changer la visibilité — vérifiez le SQL Supabase', true);
    }
}

export async function loadAccessRequestsPanel() {
    const panel = document.getElementById('accessRequestsPanel');
    if (!panel || !appState.user) return;
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="info-card loading">Chargement des demandes…</div>';
    try {
        const requests = await api.getIncomingAccessRequests(appState.user.id);
        if (!requests.length) {
            panel.innerHTML = '<div class="info-card">Aucune demande en attente</div>';
            return;
        }
        const ids = requests.map(r => r.requester_id);
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', ids);
        const byId = Object.fromEntries((profiles || []).map(p => [p.id, p]));

        panel.innerHTML = requests.map(r => {
            const p = byId[r.requester_id];
            const name = p?.username || 'Utilisateur';
            return `<div class="access-row" data-id="${escapeHtml(r.id)}">
                <div class="access-row-info">
                    <strong>${escapeHtml(name)}</strong>
                    <span>demande l’accès à vos photos</span>
                </div>
                <div class="access-row-actions">
                    <button type="button" class="small access-approve" data-id="${escapeHtml(r.id)}">Accepter</button>
                    <button type="button" class="small secondary access-deny" data-id="${escapeHtml(r.id)}">Refuser</button>
                </div>
            </div>`;
        }).join('');

        panel.querySelectorAll('.access-approve').forEach(btn => {
            btn.onclick = async () => {
                try {
                    await api.respondAccessRequest(btn.dataset.id, appState.user.id, 'approved');
                    showNotification('Accès accordé');
                    loadAccessRequestsPanel();
                } catch (err) {
                    showNotification('Erreur', true);
                }
            };
        });
        panel.querySelectorAll('.access-deny').forEach(btn => {
            btn.onclick = async () => {
                try {
                    await api.respondAccessRequest(btn.dataset.id, appState.user.id, 'denied');
                    showNotification('Demande refusée');
                    loadAccessRequestsPanel();
                } catch (err) {
                    showNotification('Erreur', true);
                }
            };
        });
    } catch (err) {
        console.error(err);
        panel.innerHTML = '<div class="info-card">Demandes indisponibles — exécutez CREATE_PROFILES_PHOTOS.sql</div>';
    }
}

export async function renderViewerGallery(ownerId, container) {
    if (!container) return;
    container.innerHTML = '<div class="info-card loading">Chargement des photos…</div>';
    try {
        const urls = await api.fetchPhotoUrls(ownerId);
        if (!urls.length) {
            container.innerHTML = '<div class="info-card">Pas encore de photos</div>';
            return;
        }
        container.innerHTML = `
            <h4 class="gallery-heading">Photos</h4>
            <div class="photo-gallery viewer-gallery">${
                urls.map(u => `<button type="button" class="gallery-item gallery-open" data-url="${escapeHtml(u.url)}">
                    <img src="${escapeHtml(u.url)}" alt="Photo">
                </button>`).join('')
            }</div>`;
        container.querySelectorAll('.gallery-open').forEach(btn => {
            btn.onclick = () => {
                const url = btn.dataset.url;
                if (!url) return;
                const overlay = document.createElement('div');
                overlay.className = 'confirm-overlay photo-lightbox';
                overlay.innerHTML = `<div class="photo-lightbox-inner"><img src="${escapeHtml(url)}" alt=""><button type="button" class="secondary">Fermer</button></div>`;
                document.body.appendChild(overlay);
                overlay.querySelector('button').onclick = () => overlay.remove();
                overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
            };
        });
    } catch (err) {
        if (err.code === 'PHOTOS_HIDDEN' || err.code === 403) {
            let status = null;
            try {
                if (appState.user) status = await api.getAccessStatus(ownerId, appState.user.id);
            } catch { /* ignore */ }
            const pending = status === 'pending';
            container.innerHTML = `<div class="info-card photo-locked">
                <p>Photos masquées (${pending ? 'demande en attente' : 'privé / sur demande'})</p>
                <button type="button" class="secondary small" id="requestPhotoAccessBtn" ${pending ? 'disabled' : ''}>
                    ${pending ? 'Demande envoyée' : 'Demander l’accès'}
                </button>
            </div>`;
            const btn = container.querySelector('#requestPhotoAccessBtn');
            if (btn && appState.user && !pending) {
                btn.onclick = async () => {
                    try {
                        await api.requestPhotoAccess(ownerId, appState.user.id);
                        showNotification('Demande envoyée');
                        btn.disabled = true;
                        btn.textContent = 'Demande envoyée';
                    } catch (e) {
                        showNotification(e.message || 'Demande impossible', true);
                    }
                };
            }
            return;
        }
        console.error('renderViewerGallery:', err);
        container.innerHTML = '<div class="info-card">Photos indisponibles — vérifiez FIX_VIEW_OTHERS_PHOTOS.sql</div>';
    }
}
