const CACHE_NAME = 'nearby-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/css/style.css',
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
    '/manifest.json',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Installation
self.addEventListener('install', event => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching files...');
                return cache.addAll(urlsToCache);
            })
            .catch(err => console.log('Cache error:', err))
    );
    self.skipWaiting();
});

// Fetch
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(response => {
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    return response;
                });
            })
    );
});

// Activation
self.addEventListener('activate', event => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log('Deleting old cache:', key);
                        return caches.delete(key);
                    })
            );
        })
    );
    self.clients.claim();
});