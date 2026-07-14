const CACHE_VERSION = 'v3.2.0';
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

// ── INSTALL ──
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache).catch(err => console.warn('Cache error:', err)))
            .then(() => self.skipWaiting())
    );
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// ── FETCH ──
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // ✅ Jamais intercepter les POST
    if (event.request.method !== 'GET') return;

    // ✅ Ignorer les requêtes "only-if-cached" cross-origin
    if (event.request.cache === 'only-if-cached' &&
        event.request.mode !== 'same-origin') return;

    // ✅ Jamais intercepter Supabase
    if (url.hostname.includes('supabase.co') ||
        url.hostname.includes('supabase.in')) return;

    // ✅ Jamais intercepter les requêtes avec Authorization (données authentifiées)
    if (event.request.headers.get('Authorization')) return;

    // ✅ Jamais intercepter les requêtes externes
    if (url.origin !== self.location.origin) return;

    // HTML → Network First + fallback offline
    if (url.pathname === '/' || url.pathname === '/index.html') {
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .then(response => {
                    if (response && response.ok && response.status === 200 && response.type === 'basic') {
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                    }
                    return response;
                })
                .catch(() => caches.match('/index.html'))
        );
        return;
    }

    // JS + CSS → Stale While Revalidate (cache immédiat + mise à jour en arrière-plan)
    if (url.pathname.startsWith('/js/') || url.pathname.startsWith('/CSS/')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                const networkFetch = fetch(event.request, { cache: 'no-cache' })
                    .then(response => {
                        if (response && response.ok && response.status === 200 && response.type === 'basic') {
                            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                        }
                        return response;
                    })
                    .catch(() => cached);
                // Retourne le cache immédiatement ET met à jour en arrière-plan
                return cached || networkFetch;
            })
        );
        return;
    }

    // Images + icônes + manifest → Cache First
    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) return response;
            return fetch(event.request)
                .then(response => {
                    if (response && response.ok && response.status === 200 && response.type === 'basic') {
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                    }
                    return response;
                })
                .catch(() => caches.match('/index.html'));
        })
    );
});

// ── MESSAGE HANDLER ──
self.addEventListener('message', event => {
    if (event.data === 'clearCache') {
        event.waitUntil(
            caches.keys().then(keys =>
                Promise.all(keys.map(key => caches.delete(key)))
            )
        );
    }
});
