import { supabase } from './supabaseClient.js';
import { appState, setState, updatePosition } from './state.js';
import { api } from './api.js';
import { UNLOCK_COST, GPS_OPTIONS, DEFAULT_RADIUS } from './config.js';
import { formatDistance, debounce, escapeHtml } from './utils.js';
import { showNotification } from './ui.js';
import { unlockUser } from './profile.js';
import { startChat } from './chat.js';

let map = null;
let userMarkers = [];

export function initMap() {
    if (!map && appState.position) {
        map = L.map('map').setView([appState.position.lat, appState.position.lng], 14);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        setState('map', map);
    }
}

// Afficher le profil d'un utilisateur (simplifié)
async function showUserProfile(userId, username) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('username, bio, avatar_url')
        .eq('id', userId)
        .single();
    
    const avatarHtml = profile?.avatar_url 
        ? `<img src="${profile.avatar_url}" style="width:60px; height:60px; border-radius:50%; object-fit:cover;">` 
        : '👤';
    
    const content = `
        <div style="text-align:center;">
            ${avatarHtml}
            <h3 style="margin:8px 0;">${escapeHtml(profile?.username || username)}</h3>
            <p style="color:#666;">${escapeHtml(profile?.bio || 'Aucune bio')}</p>
        </div>
    `;
    
    // Afficher dans une popup simple (améliorable avec une vraie modale)
    showNotification(`👤 Profil de ${escapeHtml(profile?.username || username)}`, false);
    alert(content.replace(/<[^>]*>/g, '')); // Version texte temporaire
}

// Ouvrir l'itinéraire Google Maps
function openDirections(lat, lng) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
}

function updateMapWithUsers(users) {
    if (!map) {
        initMap();
        if (!map) return;
    }

    // Supprimer les anciens marqueurs
    userMarkers.forEach(m => map.removeLayer(m));
    userMarkers = [];

    // Marqueur pour l'utilisateur courant
    const myMarker = L.marker([appState.position.lat, appState.position.lng], {
        icon: L.divIcon({
            html: '<div style="background:#3b82f6;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px #3b82f6;"></div>',
            iconSize: [20, 20]
        })
    }).addTo(map).bindPopup('<b>Vous</b>');
    userMarkers.push(myMarker);

    // Marqueurs pour les autres utilisateurs (débloqués seulement)
    users.forEach(u => {
        if (!u.is_unlocked) return;
        
        const m = L.marker([u.lat, u.lng], {
            icon: L.divIcon({
                html: `<div style="background:#22c55e;width:20px;height:20px;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:10px;color:white;">${u.username.charAt(0).toUpperCase()}</div>`,
                iconSize: [20, 20]
            })
        }).addTo(map);

        // Contenu de la popup
        const popupContent = `
            <div style="min-width:180px; text-align:center;">
                <strong style="font-size:16px;">${escapeHtml(u.username)}</strong><br>
                📏 ${formatDistance(u.distance_km)}<br>
                <hr style="margin:8px 0;">
                <button id="popup-chat-${u.user_id}" class="popup-btn" style="background:#3b82f6; margin:4px; padding:6px 12px; border:none; border-radius:20px; color:white; cursor:pointer;">💬 Message</button>
                <button id="popup-profile-${u.user_id}" class="popup-btn" style="background:#334155; margin:4px; padding:6px 12px; border:none; border-radius:20px; color:white; cursor:pointer;">👤 Profil</button>
                <button id="popup-route-${u.user_id}" class="popup-btn" style="background:#22c55e; margin:4px; padding:6px 12px; border:none; border-radius:20px; color:white; cursor:pointer;">📍 Itinéraire</button>
            </div>
        `;
        
        m.bindPopup(popupContent);
        
        // Gestion des clics dans la popup
        m.on('popupopen', () => {
            document.getElementById(`popup-chat-${u.user_id}`)?.addEventListener('click', () => {
                startChat(u.user_id, u.username);
            });
            document.getElementById(`popup-profile-${u.user_id}`)?.addEventListener('click', () => {
                showUserProfile(u.user_id, u.username);
            });
            document.getElementById(`popup-route-${u.user_id}`)?.addEventListener('click', () => {
                openDirections(u.lat, u.lng);
            });
        });
        
        userMarkers.push(m);
    });

    map.setView([appState.position.lat, appState.position.lng], 14);
    map.invalidateSize();
}

export async function loadNearbyUsers() {
    if (!appState.position || !appState.user) return;

    const radius = parseFloat(document.getElementById('radiusKm')?.value || DEFAULT_RADIUS);
    document.getElementById('radiusValue').innerHTML = `${radius} km`;

    const users = await api.getNearbyUsers(
        appState.position.lat,
        appState.position.lng,
        radius,
        appState.user.id
    );

    setState('nearbyUsers', users);

    // Mise à jour de la liste en bas (si nécessaire)
    const container = document.getElementById('nearbyList');
    if (!users || users.length === 0) {
        container.innerHTML = '<div class="info-card">✨ Personne à proximité</div>';
        updateMapWithUsers([]);
        return;
    }

    container.innerHTML = users.map(u => `
        <div class="user-card">
            <div class="user-card-avatar">
                ${u.avatar_url ? `<img src="${escapeHtml(u.avatar_url)}">` : '👤'}
            </div>
            <div style="flex:1;">
                <div class="user-name">${escapeHtml(u.username)}</div>
                <div class="user-distance">📏 ${formatDistance(u.distance_km)}</div>
            </div>
            ${u.is_unlocked ? 
                '<span class="badge">✅ Débloqué</span>' : 
                `<button class="unlock-btn" data-id="${u.user_id}" data-name="${escapeHtml(u.username)}">🔓 Débloquer (${UNLOCK_COST} FCFA)</button>`
            }
        </div>
    `).join('');

    // Mise à jour de la carte (uniquement les débloqués)
    updateMapWithUsers(users.filter(u => u.is_unlocked));

    // Attacher les événements des boutons de la liste
    document.querySelectorAll('.unlock-btn').forEach(btn => {
        btn.removeEventListener('click', window._unlockHandler);
        window._unlockHandler = () => unlockUser(btn.dataset.id, btn.dataset.name);
        btn.addEventListener('click', window._unlockHandler);
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
    
    const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
            const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            updatePosition(position);
            await api.updateLocation(appState.user.id, position.lat, position.lng);
            
            document.getElementById('gpsStatus').innerHTML = `✅ GPS actif (${position.lat.toFixed(3)}, ${position.lng.toFixed(3)})`;
            initMap();
            loadNearbyUsers();
        },
        (err) => {
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
