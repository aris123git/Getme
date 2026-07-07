const CACHE_VERSION = 'v3.0.0';
const CACHE_NAME = `getme-${CACHE_VERSION}`;

const urlsToCache = [
    '/',
    '/index.html',
    '/CSS/style.css?v=3.0.0',
    '/js/main.js?v=3.0.0',
    '/js/config.js?v=3.0.0',
    '/js/state.js?v=3.0.0',
    '/js/utils.js?v=3.0.0',
    '/js/api.js?v=3.0.0',
    '/js/auth.js?v=3.0.0',
    '/js/map.js?v=3.0.0',
    '/js/chat.js?v=3.0.0',
    '/js/profile.js?v=3.0.0',
    '/js/ui.js?v=3.0.0',
    '/js/supabaseClient.js?v=3.0.0',
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

    // ✅ Jamais intercepter les POST (Supabase, auth, chat...)
    if (event.request.method !== 'GET') return;

    // ✅ Jamais intercepter Supabase
    if (url.hostname.includes('supabase.co') ||
        url.hostname.includes('supabase.in')) return;

    // ✅ Jamais intercepter les requêtes externes
    if (url.origin !== self.location.origin) return;

    // HTML → Network First + fallback offline
    if (url.pathname === '/' || url.pathname === '/index.html') {
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match('/index.html'))
        );
        return;
    }

    // JS + CSS → Stale While Revalidate
    if (url.pathname.startsWith('/js/') || url.pathname.startsWith('/CSS/')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                const networkFetch = fetch(event.request, { cache: 'no-cache' })
                    .then(response => {
                        if (response && response.status === 200) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                        }
                        return response;
                    })
                    .catch(() => cached);
                return cached || networkFetch;
            })
        );
        return;
    }

    // Images + icônes + manifest → Cache First
    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) return response;
            return fetch(event.request).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => caches.match('/index.html'));
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
