const CACHE_VERSION = 'v4.6.0';
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
    '/js/photos.js',
    '/js/ui.js',
    '/js/supabaseClient.js',
    '/js/push.js',
    '/js/call.js',
    '/manifest.json',
    '/images/hero-desire.jpg',
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
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    if (event.request.method !== 'GET') return;

    if (event.request.cache === 'only-if-cached' &&
        event.request.mode !== 'same-origin') return;

    if (url.hostname.includes('supabase.co') ||
        url.hostname.includes('supabase.in') ||
        url.hostname.includes('daily.co')) return;

    if (event.request.headers.get('Authorization')) return;

    if (url.origin !== self.location.origin) return;

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
                return cached || networkFetch;
            })
        );
        return;
    }

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

self.addEventListener('message', event => {
    if (event.data === 'clearCache') {
        event.waitUntil(
            caches.keys().then(keys =>
                Promise.all(keys.map(key => caches.delete(key)))
            )
        );
    }
});

// ── WEB PUSH (calls + messages) ──
self.addEventListener('push', event => {
    let payload = {
        title: 'Getme',
        body: 'Nouvelle notification',
        url: '/',
        tag: 'getme'
    };
    try {
        if (event.data) {
            payload = { ...payload, ...event.data.json() };
        }
    } catch (_) {
        try {
            payload.body = event.data.text();
        } catch (__) {}
    }

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Getme', {
            body: payload.body || payload.message || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: payload.tag || 'getme',
            data: { url: payload.url || '/', ...(payload.data || {}) },
            renotify: true,
            vibrate: payload.tag === 'getme-call' ? [200, 100, 200, 100, 200] : [100, 50, 100]
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            for (const client of list) {
                if ('focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});
