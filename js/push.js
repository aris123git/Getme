import { supabase } from './supabaseClient.js';
import { appState } from './state.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { showNotification } from './ui.js';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
}

export async function ensureNotificationPermission() {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return Notification.requestPermission();
}

export async function registerPushSubscription(userId) {
    if (!userId || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        return false;
    }
    try {
        const permission = await ensureNotificationPermission();
        if (permission !== 'granted') {
            showNotification('Activez les notifications pour les appels et messages', true);
            return false;
        }

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }

        const json = sub.toJSON();
        const { error } = await supabase.from('push_subscriptions').upsert({
            user_id: userId,
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            user_agent: navigator.userAgent
        }, { onConflict: 'user_id,endpoint' });

        if (error) {
            console.warn('push subscribe save:', error);
            // Table may not exist yet
            return false;
        }
        return true;
    } catch (err) {
        console.warn('registerPushSubscription:', err);
        return false;
    }
}

/** Ask Netlify function to push a user (needs service role + VAPID on server). */
export async function notifyUserPush(userId, { title, message, url, tag, data } = {}) {
    if (!userId) return;
    try {
        // Prefer /api redirect (netlify.toml); fall back to functions path
        const res = await fetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                title: title || 'Getme',
                message: message || '',
                url: url || '/?tab=messages',
                tag: tag || 'getme',
                data: data || {}
            })
        });
        if (!res.ok) {
            const alt = await fetch('/.netlify/functions/send-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    title: title || 'Getme',
                    message: message || '',
                    url: url || '/?tab=messages',
                    tag: tag || 'getme',
                    data: data || {}
                })
            });
            if (!alt.ok) {
                console.warn('notifyUserPush status:', res.status, alt.status);
            }
        }
    } catch (err) {
        console.warn('notifyUserPush:', err);
    }
}

/**
 * System / OS notification.
 * Uses the service worker when possible (required on many mobile browsers / PWAs).
 * @param {string} title
 * @param {{ body?: string, tag?: string, data?: object, force?: boolean }} [options]
 */
export async function showLocalNotification(title, options = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const pageHidden = document.visibilityState !== 'visible' || !document.hasFocus();
    // While the app is focused, in-app toast is enough unless force is set
    if (!pageHidden && !options.force) return;

    const opts = {
        body: options.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: options.tag || 'getme-local',
        data: options.data || { url: '/?tab=messages' },
        renotify: true
    };

    try {
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(title, opts);
            return;
        }
    } catch (err) {
        console.warn('sw showNotification:', err);
    }

    try {
        const n = new Notification(title, opts);
        n.onclick = () => {
            window.focus();
            n.close();
        };
    } catch (err) {
        console.warn('local notification:', err);
    }
}

export async function initPushForUser(userId) {
    if (!userId) return;
    // Only auto-register if permission already granted (browsers block silent prompts)
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    setTimeout(() => registerPushSubscription(userId), 800);
}
