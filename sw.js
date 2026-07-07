const CACHE_VERSION = 'v2.1.0';
const CACHE_NAME = `getme-${CACHE_VERSION}`;

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
    '/icons/icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache).catch(err => console.warn('Cache error:', err)))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // ✅ Ne jamais intercepter les requêtes externes (Supabase, CDN, APIs)
    if (url.origin !== self.location.origin) return;

    // Fichiers JS et HTML : réseau d'abord, cache en fallback
    if (url.pathname.startsWith('/js/') ||
        url.pathname === '/index.html' ||
        url.pathname === '/') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Autres fichiers locaux : cache d'abord
    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) return response;
            return fetch(event.request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            });
        })
    );
});

self.addEventListener('message', event => {
    if (event.data === 'clearCache') {
        caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
    }
});
