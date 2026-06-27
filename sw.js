// ============================================
// SERVICE WORKER - Versioned Cache
// ============================================

// 🔥 INCÉMENTE CETTE VERSION À CHAQUE DÉPLOIEMENT
const CACHE_VERSION = 'v2.0.0';
const CACHE_NAME = `getme-${CACHE_VERSION}`;

// ✅ CORRECTION : Chemins avec la bonne casse (CSS au lieu de css)
const urlsToCache = [
    '/',
    '/index.html',
    '/CSS/style.css',
    '/js/main.js',
    '/js/config.js',
    '/js/state.js',
    '/js/utils.js',
    '/js/api.js',
    '/js/auth.js',
    '/js/map.js',
    '/js/chat.js',
    '/js/profile.js',
    '/js/ui.js',
    '/js/supabaseClient.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
];

// ── INSTALL ──
self.addEventListener('install', event => {
    console.log(`🔧 SW Install: ${CACHE_NAME}`);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Caching files...');
                return cache.addAll(urlsToCache).catch(err => {
                    console.warn('⚠️ Cache error:', err);
                });
            })
            .then(() => self.skipWaiting())
    );
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
    console.log(`🚀 SW Activate: ${CACHE_NAME}`);
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log(`🗑️ Deleting old cache: ${key}`);
                        return caches.delete(key);
                    })
            );
        })
        .then(() => self.clients.claim())
    );
});

// ── FETCH (Network-first for JS/HTML) ──
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Pour les fichiers JS et HTML : réseau d'abord, cache en fallback
    if (url.pathname.startsWith('/js/') || 
        url.pathname === '/index.html' ||
        url.pathname === '/') {
        
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clone);
                    });
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // Pour tout le reste : cache d'abord, puis réseau
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) return response;
                return fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clone);
                    });
                    return response;
                });
            })
    );
});

// ── MESSAGE HANDLER ──
self.addEventListener('message', event => {
    if (event.data === 'clearCache') {
        console.log('🧹 Clearing cache...');
        caches.keys().then(keys => {
            keys.forEach(key => caches.delete(key));
        });
    }
});
