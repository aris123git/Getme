import { supabase } from './supabaseClient.js';
import { appState, setState, updatePosition } from './state.js';
import { api } from './api.js';
import { UNLOCK_COST, GPS_OPTIONS, DEFAULT_RADIUS } from './config.js';
import { formatDistance, debounce, escapeHtml } from './utils.js';
import { showNotification } from './ui.js';
import { unlockUser, reportUser, blockUser } from './profile.js';
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
        showNotification("📍 Centré sur votre position");
    } else {
        showNotification("Position non disponible", true);
    }
}

function formatLastSeen(date) {
    if (!date) return "Jamais";
    const diff = Math.floor((new Date() - new Date(date)) / 1000 / 60);
    if (diff < 5) return "🟢 Actif maintenant";
    if (diff < 60) return `🟡 Actif il y a ${diff} min`;
    if (diff < 1440) return `🟠 Actif aujourd'hui`;
    return `⚫ Actif il y a ${Math.floor(diff / 1440)} jours`;
}

function getAvailabilityLabel(availability) {
    const labels = {
        'now': '🟢 Disponible maintenant',
        'today': '📅 Disponible aujourd\'hui',
        'week': '📆 Disponible cette semaine'
    };
    return labels[availability] || '🟡 Statut inconnu';
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
                html: '<div style="background:#3b82f6;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px #3b82f6;"></div>',
                iconSize: [20, 20]
            })
        }).addTo(map).bindPopup('<b>Vous</b>');
        userMarkers.push(myMarker);
    }

    users.forEach(u => {
        if (!u.is_unlocked) return;

        const m = L.marker([u.lat, u.lng], {
            icon: L.divIcon({
                html: '<div style="background:#22c55e;width:20px;height:20px;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:10px;color:white;">' + u.username.charAt(0).toUpperCase() + '</div>',
                iconSize: [20, 20]
            })
        }).addTo(map);

        const popupContent = '<div style="min-width:220px; text-align:center;">' +
            '<strong style="font-size:16px;">' + escapeHtml(u.username) + '</strong><br>' +
            '📏 ' + formatDistance(u.distance_km) + '<br>' +
            '🕐 ' + formatLastSeen(u.last_seen) + '<br>' +
            getAvailabilityLabel(u.availability) + '<br>' +
            '<hr style="margin:8px 0;">' +
            '<button id="popup-chat-' + u.user_id + '" class="popup-btn" style="background:#3b82f6; margin:4px; padding:6px 12px; border:none; border-radius:20px; color:white;">💬 Message</button>' +
            '<button id="popup-profile-' + u.user_id + '" class="popup-btn" style="background:#334155; margin:4px; padding:6px 12px; border:none; border-radius:20px; color:white;">👤 Profil</button>' +
            '<button id="popup-route-' + u.user_id + '" class="popup-btn" style="background:#22c55e; margin:4px; padding:6px 12px; border:none; border-radius:20px; color:white;">📍 Itinéraire</button>' +
            '<button id="popup-report-' + u.user_id + '" class="popup-btn" style="background:#ef4444; margin:4px; padding:6px 12px; border:none; border-radius:20px; color:white;">🚨 Signaler</button>' +
            '<button id="popup-block-' + u.user_id + '" class="popup-btn" style="background:#ef4444; margin:4px; padding:6px 12px; border:none; border-radius:20px; color:white;">🚫 Bloquer</button>' +
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
            if (reportBtn) reportBtn.onclick = () => {
                const reason = prompt("Motif du signalement :");
                if (reason) reportUser(u.user_id, reason);
            };

            const blockBtn = document.getElementById('popup-block-' + u.user_id);
            if (blockBtn) blockBtn.onclick = () => {
                if (confirm("Bloquer définitivement cet utilisateur ?")) blockUser(u.user_id);
            };
        });

        userMarkers.push(m);
    });

    map.setView([appState.position.lat, appState.position.lng], 14);
    map.invalidateSize();
}

async function showUserProfile(userId, username) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('username, bio, avatar_url, availability, last_seen')
        .eq('id', userId)
        .single();

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:2000;';
    modal.innerHTML = '<div style="background:#1e293b; padding:24px; border-radius:24px; max-width:320px; text-align:center; color:white;">' +
        (profile?.avatar_url ? '<img src="' + profile.avatar_url + '" style="width:80px;height:80px;border-radius:50%;margin-bottom:12px;">' : '<div style="font-size:64px;">👤</div>') +
        '<h3>' + escapeHtml(profile?.username || username) + '</h3>' +
        '<p>' + escapeHtml(profile?.bio || 'Aucune bio') + '</p>' +
        '<p>' + getAvailabilityLabel(profile?.availability) + '</p>' +
        '<p>🕐 ' + formatLastSeen(profile?.last_seen) + '</p>' +
        '<button id="closeModalBtn" style="background:#3b82f6; margin-top:16px; padding:10px 20px; border:none; border-radius:30px; color:white;">Fermer</button>' +
        '</div>';
    document.body.appendChild(modal);
    document.getElementById('closeModalBtn').onclick = function() { modal.remove(); };
}

export async function loadNearbyUsers() {
    if (!appState.position || !appState.user) return;

    const radius = parseFloat(document.getElementById('radiusKm')?.value || DEFAULT_RADIUS);
    document.getElementById('radiusValue').innerHTML = radius + ' km';

    const users = await api.getNearbyUsers(
        appState.position.lat,
        appState.position.lng,
        radius,
        appState.user.id
    );

    setState('nearbyUsers', users);

    const container = document.getElementById('nearbyList');
    if (!users || users.length === 0) {
        container.innerHTML = '<div class="info-card">✨ Personne à proximité</div>';
        updateMapWithUsers([]);
        return;
    }

    let html = '';
    for (let u of users) {
        html += '<div class="user-card">' +
            '<div class="user-card-avatar">' +
            (u.avatar_url ? '<img src="' + escapeHtml(u.avatar_url) + '">' : '👤') +
            '</div>' +
            '<div style="flex:1;">' +
            '<div class="user-name">' + escapeHtml(u.username) + '</div>' +
            '<div class="user-distance">📏 ' + formatDistance(u.distance_km) + '</div>' +
            '<div class="user-distance">🕐 ' + formatLastSeen(u.last_seen) + '</div>' +
            '<div class="user-distance">' + getAvailabilityLabel(u.availability) + '</div>' +
            '</div>' +
            (u.is_unlocked ?
                '<span class="badge">✅ Débloqué</span>' :
                '<button class="unlock-btn" data-id="' + u.user_id + '" data-name="' + escapeHtml(u.username) + '">🔓 Débloquer (' + UNLOCK_COST + ' FCFA)</button>'
            ) +
            '</div>';
    }
    container.innerHTML = html;

    updateMapWithUsers(users.filter(u => u.is_unlocked));

    document.querySelectorAll('.unlock-btn').forEach(btn => {
        const userId = btn.dataset.id;
        const userName = btn.dataset.name;
        btn.onclick = () => unlockUser(userId, userName);
    });
}

export const debouncedLoadNearby = debounce(loadNearbyUsers, 300);

export function startGeolocation() {
    if (!navigator.geolocation) {
        showNotification("GPS non supporté", true);
        return;
    }
    if (appState.watchId) stopGeolocation();

    document.getElementById('gpsStatus').innerHTML = '🟢 Recherche GPS...';
    document.getElementById('enableGpsBtn').style.display = 'none';
    document.getElementById('stopGpsBtn').style.display = 'block';

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
            await api.updateLocation(appState.user.id, position.lat, position.lng);
            await supabase.from('profiles').update({ last_seen: new Date() }).eq('id', appState.user.id);
            document.getElementById('gpsStatus').innerHTML = `✅ GPS actif (${position.lat.toFixed(3)}, ${position.lng.toFixed(3)})`;
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
    document.getElementById('gpsStatus').innerHTML = '📍 GPS arrêté';
    document.getElementById('enableGpsBtn').style.display = 'block';
    document.getElementById('stopGpsBtn').style.display = 'none';
}
