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
        await fetch('/.netlify/functions/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                title: title || 'Getme',
                message: message || '',
                url: url || '/',
                tag: tag || 'getme',
                data: data || {}
            })
        });
    } catch (err) {
        console.warn('notifyUserPush:', err);
    }
}

/** Local browser notification when tab is open / permission granted (no server needed). */
export function showLocalNotification(title, options = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && !options.force) return;
    try {
        const n = new Notification(title, {
            body: options.body || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: options.tag || 'getme-local',
            data: options.data || {}
        });
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
    // Don't block login UX
    setTimeout(() => registerPushSubscription(userId), 800);
}
