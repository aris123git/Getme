import { supabase } from './supabaseClient.js';
import { appState, setState, updatePosition } from './state.js';
import { api } from './api.js';
import { GPS_OPTIONS, DEFAULT_RADIUS } from './config.js';
import { formatDistance, debounce, escapeHtml, genderLabel, visibilityLabel } from './utils.js';
import { showNotification, showConfirmModal } from './ui.js';
import { reportUser, blockUser } from './profile.js';
import { startChat } from './chat.js';
let map = null;
let userMarkers = [];

export function initMap() {
    if (map) return;
    
    // ✅ CORRECTION : Fallback position si pas de position GPS
    if (!appState.position) {
        appState.position = { lat: 12.3714, lng: -1.5197 };
    }
    
    map = L.map('map').setView([appState.position.lat, appState.position.lng], 14);
    
    // ✅ CORRECTION : TileLayer plus fiable
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    
    setState('map', map);
    setTimeout(() => map.invalidateSize(), 100);
}

export function centerMapOnUser() {
    if (map && appState.position) {
        map.setView([appState.position.lat, appState.position.lng], 15);
        showNotification("Centré sur votre position");
    } else {
        showNotification("Position non disponible", true);
    }
}

function formatLastSeen(date) {
    if (!date) return "Jamais vu";
    const diff = Math.floor((new Date() - new Date(date)) / 1000 / 60);
    if (diff < 5) return "Actif maintenant";
    if (diff < 60) return `Actif il y a ${diff} min`;
    if (diff < 1440) return `Actif aujourd'hui`;
    return `Actif il y a ${Math.floor(diff / 1440)} j`;
}

function getAvailabilityLabel(availability) {
    const labels = {
        'now': 'Disponible maintenant',
        'today': 'Disponible aujourd\'hui',
        'week': 'Disponible cette semaine'
    };
    return labels[availability] || 'Statut inconnu';
}

function updateMapWithUsers(users) {
    if (!map) {
        initMap();
        if (!map) return;
    }

    userMarkers.forEach(m => map.removeLayer(m));
    userMarkers = [];

    if (appState.position) {
        const myMarker = L.marker([appState.position.lat, appState.position.lng], {
            icon: L.divIcon({
                className: 'getme-marker',
                html: '<div style="background:#c43b5a;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(20,12,16,0.35);"></div>',
                iconSize: [18, 18]
            })
        }).addTo(map).bindPopup('<b>Vous</b>');
        userMarkers.push(myMarker);
    }

    users.forEach(u => {
        if (u.lat == null || u.lng == null) return;

        const safeName = escapeHtml(u.username || '?');
        const initial = escapeHtml((u.username || '?').charAt(0).toUpperCase());

        const m = L.marker([u.lat, u.lng], {
            icon: L.divIcon({
                className: 'getme-marker',
                html: '<div style="background:#e8b86d;width:22px;height:22px;border-radius:8px;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#140c10;font-family:Outfit,sans-serif;box-shadow:0 2px 8px rgba(20,12,16,0.3);">' + initial + '</div>',
                iconSize: [22, 22]
            })
        }).addTo(map);

        const popupContent = '<div style="min-width:200px; text-align:left; font-family:Outfit,sans-serif;">' +
            '<strong style="font-size:15px;">' + safeName + '</strong><br>' +
            '<span style="color:#c4a8b0;font-size:12px;">' + formatDistance(u.distance_km) + ' · ' + formatLastSeen(u.last_seen) + '</span><br>' +
            '<span style="color:#c43b5a;font-size:12px;">' + getAvailabilityLabel(u.availability) + '</span><br>' +
            '<hr style="margin:10px 0;border:none;border-top:1px solid #2a1a22;">' +
            '<button id="popup-chat-' + u.user_id + '" class="popup-btn" style="background:#c43b5a; margin:3px; padding:7px 12px; border:none; border-radius:10px; color:white; font-weight:600;">Message</button>' +
            '<button id="popup-profile-' + u.user_id + '" class="popup-btn" style="background:#2a1a22; margin:3px; padding:7px 12px; border:none; border-radius:10px; color:#f7ebe8; font-weight:600;">Profil</button>' +
            '<button id="popup-route-' + u.user_id + '" class="popup-btn" style="background:#e8b86d; margin:3px; padding:7px 12px; border:none; border-radius:10px; color:#140c10; font-weight:600;">Itinéraire</button>' +
            '<button id="popup-report-' + u.user_id + '" class="popup-btn" style="background:transparent; margin:3px; padding:7px 12px; border:1px solid #e85d5d; border-radius:10px; color:#e85d5d; font-weight:600;">Signaler</button>' +
            '<button id="popup-block-' + u.user_id + '" class="popup-btn" style="background:transparent; margin:3px; padding:7px 12px; border:1px solid #e85d5d; border-radius:10px; color:#e85d5d; font-weight:600;">Bloquer</button>' +
            '</div>';
        m.bindPopup(popupContent);

        m.on('popupopen', function() {
            const chatBtn = document.getElementById('popup-chat-' + u.user_id);
            if (chatBtn) chatBtn.onclick = () => startChat(u.user_id, u.username);

            const profileBtn = document.getElementById('popup-profile-' + u.user_id);
            if (profileBtn) profileBtn.onclick = () => showUserProfile(u.user_id, u.username);

            const routeBtn = document.getElementById('popup-route-' + u.user_id);
            if (routeBtn) routeBtn.onclick = () => window.open('https://www.google.com/maps/dir/?api=1&destination=' + u.lat + ',' + u.lng, '_blank');

            const reportBtn = document.getElementById('popup-report-' + u.user_id);
            if (reportBtn) reportBtn.onclick = async () => {
                const reason = window.prompt('Motif du signalement :');
                if (reason?.trim()) await reportUser(u.user_id, reason.trim());
            };

            const blockBtn = document.getElementById('popup-block-' + u.user_id);
            if (blockBtn) blockBtn.onclick = async () => {
                const ok = await showConfirmModal('Bloquer définitivement cet utilisateur ?');
                if (ok) await blockUser(u.user_id);
            };
        });

        userMarkers.push(m);
    });

    if (appState.position) {
        map.setView([appState.position.lat, appState.position.lng], 14);
    }
    map.invalidateSize();
}

async function showUserProfile(userId, username) {
    let profile = null;
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('username, bio, avatar_url, availability, last_seen, age, gender, city, photo_visibility')
            .eq('id', userId)
            .single();
        if (error) throw error;
        profile = data;
    } catch (err) {
        console.error('showUserProfile:', err);
        showNotification('Impossible de charger le profil', true);
        return;
    }

    const existing = document.querySelector('.profile-modal-overlay');
    if (existing) existing.remove();

    const meta = [
        profile?.age ? (profile.age + ' ans') : '',
        genderLabel(profile?.gender),
        profile?.city || '',
        visibilityLabel(profile?.photo_visibility || 'public')
    ].filter(Boolean).join(' · ');

    const modal = document.createElement('div');
    modal.className = 'profile-modal-overlay confirm-overlay';
    modal.innerHTML = '<div class="confirm-box profile-public-card">' +
        (profile?.avatar_url
            ? '<img class="profile-public-avatar" src="' + escapeHtml(profile.avatar_url) + '" alt="">'
            : '<div class="avatar profile-public-avatar-fallback">' + escapeHtml((profile?.username || username || '?').charAt(0).toUpperCase()) + '</div>') +
        '<h3>' + escapeHtml(profile?.username || username) + '</h3>' +
        (meta ? '<p class="profile-public-meta">' + escapeHtml(meta) + '</p>' : '') +
        '<p class="profile-public-bio">' + escapeHtml(profile?.bio || 'Aucune bio') + '</p>' +
        '<p class="profile-public-status">' + getAvailabilityLabel(profile?.availability) + '</p>' +
        '<p class="profile-public-status">' + formatLastSeen(profile?.last_seen) + '</p>' +
        '<div id="profilePublicGallery" class="profile-public-gallery" aria-label="Galerie photos"></div>' +
        '<div class="confirm-actions profile-public-actions">' +
        '<button class="secondary" id="closeModalBtn">Fermer</button>' +
        '<button class="secondary" id="profileReportBtn">Signaler</button>' +
        '<button class="danger small" id="profileBlockBtn">Bloquer</button>' +
        '<button id="profileChatBtn">Message</button>' +
        '</div></div>';
    document.body.appendChild(modal);
    document.getElementById('closeModalBtn').onclick = () => modal.remove();
    document.getElementById('profileChatBtn').onclick = () => {
        modal.remove();
        startChat(userId, profile?.username || username);
    };
    document.getElementById('profileReportBtn').onclick = async () => {
        const reason = prompt('Motif du signalement :');
        if (reason?.trim()) {
            await reportUser(userId, reason.trim());
        }
    };
    document.getElementById('profileBlockBtn').onclick = async () => {
        const ok = await showConfirmModal('Bloquer cet utilisateur ?');
        if (ok) {
            await blockUser(userId);
            modal.remove();
        }
    };
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const { renderViewerGallery } = await import('./photos.js');
    renderViewerGallery(userId, document.getElementById('profilePublicGallery'));
}

export async function loadNearbyUsers() {
    if (!appState.position || !appState.user) return;

    const radius = parseFloat(document.getElementById('radiusKm')?.value || DEFAULT_RADIUS);
    const radiusEl = document.getElementById('radiusValue');
    if (radiusEl) radiusEl.innerHTML = radius + ' km';

    const container = document.getElementById('nearbyList');
    if (container) container.innerHTML = '<div class="info-card loading">Recherche…</div>';

    let users;
    try {
        users = await api.getNearbyUsers(
            appState.position.lat,
            appState.position.lng,
            radius,
            appState.user.id
        );
    } catch (err) {
        console.error('loadNearbyUsers:', err);
        showNotification('Impossible de charger les personnes proches', true);
        if (container) container.innerHTML = '<div class="info-card">Erreur réseau — réessayez</div>';
        return;
    }

    setState('nearbyUsers', users);

    if (!users || users.length === 0) {
        if (container) container.innerHTML = '<div class="info-card">Personne à proximité pour le moment</div>';
        updateMapWithUsers([]);
        return;
    }

    let html = '';
    for (let u of users) {
        const safeName = escapeHtml(u.username || '?');
        const initial = escapeHtml((u.username || '?').charAt(0).toUpperCase());
        html += '<div class="user-card" data-id="' + u.user_id + '" data-name="' + safeName + '">' +
            '<div class="user-card-avatar">' +
            (u.avatar_url ? '<img src="' + escapeHtml(u.avatar_url) + '" alt="">' : initial) +
            '</div>' +
            '<div style="flex:1;">' +
            '<div class="user-name">' + safeName + '</div>' +
            '<div class="user-distance">' + formatDistance(u.distance_km) + '</div>' +
            '<div class="user-distance">' + formatLastSeen(u.last_seen) + '</div>' +
            '<div class="user-distance">' + getAvailabilityLabel(u.availability) + '</div>' +
            '</div>' +
            '<button class="chat-btn" data-id="' + u.user_id + '" data-name="' + safeName + '">→</button>' +
            '</div>';
    }
    if (container) container.innerHTML = html;

    updateMapWithUsers(users);

    document.querySelectorAll('.chat-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            startChat(btn.dataset.id, btn.dataset.name);
        };
    });

    document.querySelectorAll('.user-card').forEach(card => {
        card.onclick = () => startChat(card.dataset.id, card.dataset.name);
    });
}

export const debouncedLoadNearby = debounce(loadNearbyUsers, 300);

export function startGeolocation() {
    if (!navigator.geolocation) {
        showNotification("GPS non supporté", true);
        return;
    }
    if (appState.watchId) stopGeolocation();

    document.getElementById('gpsStatus').innerHTML = 'Recherche GPS…';
    document.getElementById('enableGpsBtn').classList.add('hidden');
    document.getElementById('stopGpsBtn').classList.remove('hidden');

    // ✅ CORRECTION : Timeout pour éviter le blocage infini
    let resolved = false;
    const safetyTimeout = setTimeout(() => {
        if (!resolved) {
            showNotification("GPS bloqué, réessayez", true);
            stopGeolocation();
        }
    }, 15000);

    const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
            resolved = true;
            clearTimeout(safetyTimeout);
            const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            updatePosition(position);
            try {
                if (appState.user?.id) {
                    await api.updateLocation(appState.user.id, position.lat, position.lng);
                    await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', appState.user.id);
                }
            } catch (err) {
                console.error('GPS location sync:', err);
            }
            const statusEl = document.getElementById('gpsStatus');
            if (statusEl) statusEl.innerHTML = `GPS actif · ${position.lat.toFixed(3)}, ${position.lng.toFixed(3)}`;
            if (!map) initMap();
            loadNearbyUsers();
        },
        (err) => {
            resolved = true;
            clearTimeout(safetyTimeout);
            showNotification("Erreur GPS: " + err.message, true);
            stopGeolocation();
        },
        GPS_OPTIONS
    );
    setState('watchId', watchId);
    setState('isGpsActive', true);
}

export function stopGeolocation() {
    if (appState.watchId) {
        navigator.geolocation.clearWatch(appState.watchId);
        setState('watchId', null);
    }
    setState('isGpsActive', false);
    document.getElementById('gpsStatus').innerHTML = 'GPS arrêté';
    document.getElementById('enableGpsBtn').classList.remove('hidden');
    document.getElementById('stopGpsBtn').classList.add('hidden');
}
