import * as L from 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

import { supabase } from './supabaseClient.js';
import { appState, setState, updatePosition } from './state.js';
import { api } from './api.js';
import { UNLOCK_COST, GPS_OPTIONS, DEFAULT_RADIUS } from './config.js';
import { formatDistance, debounce, escapeHtml } from './utils.js';
import { showNotification } from './ui.js';
import { unlockUser } from './profile.js';

let map = null;
let userMarkers = [];
console.log("✅ main.js chargé");

export function initMap() {
    if (!map && appState.position) {
        map = L.map('map').setView([appState.position.lat, appState.position.lng], 14);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        }).addTo(map);
        setState('map', map);
    }
}

function updateMapWithUsers(users) {
    if (!map) {
        initMap();
        if (!map) return;
    }

    userMarkers.forEach(m => map.removeLayer(m));
    userMarkers = [];

    const myMarker = L.marker([appState.position.lat, appState.position.lng], {
        icon: L.divIcon({
            html: '<div style="background:#3b82f6;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px #3b82f6;"></div>',
            iconSize: [20, 20]
        })
    }).addTo(map).bindPopup('<b>Vous</b>');
    userMarkers.push(myMarker);

    users.forEach(u => {
        if (u.is_unlocked && u.lat && u.lng) {
            const m = L.marker([u.lat, u.lng]).addTo(map);
            m.bindPopup(`<b>${escapeHtml(u.username)}</b><br>📏 ${formatDistance(u.distance_km)}`);
            userMarkers.push(m);
        }
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

    updateMapWithUsers(users);

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
