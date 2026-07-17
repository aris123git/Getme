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
let myLocationMarker = null;
let mapCenteredOnce = false;
let nearbyRenderKey = '';
let nearbyLoadInFlight = null;
let lastNearbyFetchAt = 0;

const NEARBY_REFRESH_MIN_MS = 4000;
const MAP_RECENTER_MIN_MOVE_KM = 0.05;

function haversineKm(a, b) {
    if (!a || !b) return Infinity;
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

function nearbyUsersKey(users) {
    if (!users?.length) return 'empty';
    return users.map(u =>
        [u.user_id, u.username || '', u.avatar_url || '', u.availability || '', Number(u.distance_km || 0).toFixed(2)].join('|')
    ).join(';');
}

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

function syncMyLocationMarker() {
    if (!map || !appState.position) return;
    const latLng = [appState.position.lat, appState.position.lng];
    if (myLocationMarker) {
        myLocationMarker.setLatLng(latLng);
        return;
    }
    myLocationMarker = L.marker(latLng, {
        icon: L.divIcon({
            className: 'getme-marker',
            html: '<div style="background:#c43b5a;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(20,12,16,0.35);"></div>',
            iconSize: [18, 18]
        })
    }).addTo(map).bindPopup('<b>Vous</b>');
}

function updateMapWithUsers(users, { recenter = false } = {}) {
    if (!map) {
        initMap();
        if (!map) return;
    }

    userMarkers.forEach(m => map.removeLayer(m));
    userMarkers = [];
    syncMyLocationMarker();

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

    if (appState.position && (recenter || !mapCenteredOnce)) {
        map.setView([appState.position.lat, appState.position.lng], 14);
        mapCenteredOnce = true;
    }
}

export async function showUserProfile(userId, username) {
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

function bindNearbyCardHandlers() {
    document.querySelectorAll('#nearbyList .chat-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            startChat(btn.dataset.id, btn.dataset.name);
        };
    });

    document.querySelectorAll('#nearbyList .profile-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            showUserProfile(btn.dataset.id, btn.dataset.name);
        };
    });

    document.querySelectorAll('#nearbyList .user-card').forEach(card => {
        card.onclick = () => showUserProfile(card.dataset.id, card.dataset.name);
    });
}

function patchNearbyDistances(users) {
    const container = document.getElementById('nearbyList');
    if (!container) return;
    users.forEach(u => {
        const card = container.querySelector('.user-card[data-id="' + u.user_id + '"]');
        if (!card) return;
        const lines = card.querySelectorAll('.user-distance');
        if (lines[0]) lines[0].textContent = formatDistance(u.distance_km);
        if (lines[1]) lines[1].textContent = formatLastSeen(u.last_seen);
        if (lines[2]) lines[2].textContent = getAvailabilityLabel(u.availability);
    });
}

function renderNearbyList(users) {
    const container = document.getElementById('nearbyList');
    if (!container) return;

    if (!users || users.length === 0) {
        container.innerHTML = '<div class="info-card">Personne à proximité pour le moment</div>';
        nearbyRenderKey = 'empty';
        return;
    }

    let html = '';
    for (let u of users) {
        const safeName = escapeHtml(u.username || '?');
        const initial = escapeHtml((u.username || '?').charAt(0).toUpperCase());
        html += '<div class="user-card" data-id="' + u.user_id + '" data-name="' + safeName + '" title="Voir le profil">' +
            '<div class="user-card-avatar">' +
            (u.avatar_url ? '<img src="' + escapeHtml(u.avatar_url) + '" alt="">' : initial) +
            '</div>' +
            '<div class="user-card-body">' +
            '<div class="user-name">' + safeName + '</div>' +
            '<div class="user-distance">' + formatDistance(u.distance_km) + '</div>' +
            '<div class="user-distance">' + formatLastSeen(u.last_seen) + '</div>' +
            '<div class="user-distance">' + getAvailabilityLabel(u.availability) + '</div>' +
            '<div class="user-card-actions">' +
            '<button type="button" class="profile-btn secondary small" data-id="' + u.user_id + '" data-name="' + safeName + '">Profil</button>' +
            '<button type="button" class="chat-btn small" data-id="' + u.user_id + '" data-name="' + safeName + '">Message</button>' +
            '</div>' +
            '</div>' +
            '</div>';
    }
    container.innerHTML = html;
    bindNearbyCardHandlers();
    nearbyRenderKey = nearbyUsersKey(users);
}

/**
 * @param {{ silent?: boolean, force?: boolean }} [opts]
 * silent: refresh GPS — no "Recherche…" flash, skip if unchanged
 * force: ignore throttle (radius change, unblock, etc.)
 */
export async function loadNearbyUsers(opts = {}) {
    const silent = !!opts.silent;
    const force = !!opts.force;

    if (!appState.position || !appState.user) return;

    const now = Date.now();
    if (!force && silent && now - lastNearbyFetchAt < NEARBY_REFRESH_MIN_MS) {
        syncMyLocationMarker();
        return nearbyLoadInFlight || Promise.resolve();
    }

    if (nearbyLoadInFlight) return nearbyLoadInFlight;

    const radius = parseFloat(document.getElementById('radiusKm')?.value || DEFAULT_RADIUS);
    const radiusEl = document.getElementById('radiusValue');
    if (radiusEl) radiusEl.textContent = radius + ' km';

    const container = document.getElementById('nearbyList');
    const hasCards = !!(container && container.querySelector('.user-card'));
    // Only show loading placeholder on first search — never wipe existing names
    if (container && !silent && !hasCards) {
        container.innerHTML = '<div class="info-card loading">Recherche…</div>';
    }

    nearbyLoadInFlight = (async () => {
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
            if (!silent) {
                showNotification('Impossible de charger les personnes proches', true);
                if (container && !hasCards) {
                    container.innerHTML = '<div class="info-card">Erreur réseau — réessayez</div>';
                }
            }
            return;
        }

        lastNearbyFetchAt = Date.now();
        setState('nearbyUsers', users || []);

        const nextKey = nearbyUsersKey(users);
        const identityKey = (users || []).map(u => (u.user_id + '|' + (u.username || '') + '|' + (u.avatar_url || ''))).join(';') || 'empty';
        const prevIdentity = (nearbyRenderKey || '').split(';').map(row => row.split('|').slice(0, 3).join('|')).join(';');

        if (silent && identityKey === prevIdentity && hasCards) {
            // Same people — update distance/status text only, no DOM rebuild
            patchNearbyDistances(users || []);
            nearbyRenderKey = nextKey;
            updateMapWithUsers(users || [], { recenter: false });
            return;
        }

        if (nextKey === nearbyRenderKey && hasCards) {
            updateMapWithUsers(users || [], { recenter: false });
            return;
        }

        renderNearbyList(users || []);
        updateMapWithUsers(users || [], { recenter: !silent && !mapCenteredOnce });
    })().finally(() => {
        nearbyLoadInFlight = null;
    });

    return nearbyLoadInFlight;
}

export const debouncedLoadNearby = debounce(() => loadNearbyUsers({ force: true }), 400);
export const debouncedSilentNearby = debounce(() => loadNearbyUsers({ silent: true }), 1200);

export function startGeolocation() {
    if (!navigator.geolocation) {
        showNotification("GPS non supporté", true);
        return;
    }
    if (appState.watchId) stopGeolocation();

    mapCenteredOnce = false;
    nearbyRenderKey = '';
    lastNearbyFetchAt = 0;

    document.getElementById('gpsStatus').innerHTML = 'Recherche GPS…';
    document.getElementById('enableGpsBtn').classList.add('hidden');
    document.getElementById('stopGpsBtn').classList.remove('hidden');

    let resolved = false;
    let lastSyncedPos = null;
    const safetyTimeout = setTimeout(() => {
        if (!resolved) {
            showNotification("GPS bloqué, réessayez", true);
            stopGeolocation();
        }
    }, 15000);

    const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
            const isFirstFix = !resolved;
            resolved = true;
            clearTimeout(safetyTimeout);
            const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            updatePosition(position);
            if (!map) initMap();
            syncMyLocationMarker();

            const movedEnough = !lastSyncedPos || haversineKm(lastSyncedPos, position) >= MAP_RECENTER_MIN_MOVE_KM;
            if (isFirstFix || movedEnough) {
                try {
                    if (appState.user?.id) {
                        await api.updateLocation(appState.user.id, position.lat, position.lng);
                        await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', appState.user.id);
                    }
                    lastSyncedPos = position;
                } catch (err) {
                    console.error('GPS location sync:', err);
                }
            }

            const statusEl = document.getElementById('gpsStatus');
            if (statusEl) statusEl.textContent = `GPS actif · ${position.lat.toFixed(3)}, ${position.lng.toFixed(3)}`;

            if (isFirstFix) {
                await loadNearbyUsers({ force: true });
            } else {
                debouncedSilentNearby();
            }
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
    if (myLocationMarker && map) {
        map.removeLayer(myLocationMarker);
        myLocationMarker = null;
    }
    mapCenteredOnce = false;
    document.getElementById('gpsStatus').innerHTML = 'GPS arrêté';
    document.getElementById('enableGpsBtn').classList.remove('hidden');
    document.getElementById('stopGpsBtn').classList.add('hidden');
}
