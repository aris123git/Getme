import { supabase } from './supabaseClient.js';
import { appState, setState } from './state.js';
import { api } from './api.js';
import { escapeHtml, formatTime } from './utils.js';
import { showNotification, setTabActive } from './ui.js';
import { bindCallButton } from './call.js';
import { notifyUserPush, showLocalNotification } from './push.js';

let currentChatChannel = null;
let globalMessageChannel = null;
let globalUserId = null;
let onNewMessageCb = null;
let chatPollTimer = null;
let inboxPollTimer = null;
let renderedMessageIds = new Set();
let lastKnownUnread = 0;
let lastNotifiedMessageId = null;
let lastToastAt = 0;

function toastNewMessage(preview) {
    const now = Date.now();
    if (now - lastToastAt < 2000) return;
    lastToastAt = now;
    const body = preview
        ? `Nouveau message : ${String(preview).slice(0, 60)}`
        : 'Nouveau message reçu';
    showNotification(body);
}

function sameId(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
}

function isChatOpen() {
    const chatView = document.getElementById('chatView');
    return !!(appState.currentChat && chatView && !chatView.classList.contains('hidden'));
}

function isMessagesTabVisible() {
    const tab = document.getElementById('messagesTab');
    return !!(tab && !tab.classList.contains('hidden'));
}

function updateMessagesTabBadge(count) {
    const tab = document.querySelector('.tab[data-tab="messages"]');
    if (!tab) return;
    let badge = tab.querySelector('.tab-unread-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'tab-unread-badge';
            tab.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
    } else if (badge) {
        badge.remove();
    }
}

function appendMessageBubble(message, forceClass) {
    const container = document.getElementById('chatMessages');
    if (!container || !message) return false;

    const id = message.id != null ? String(message.id) : null;
    if (id && renderedMessageIds.has(id)) return false;
    if (id) renderedMessageIds.add(id);

    // Clear empty-state placeholder
    if (container.querySelector(':scope > div[style*="text-align"]') && !container.querySelector('.message')) {
        container.innerHTML = '';
    }

    const isMine = forceClass === 'sent'
        || (forceClass !== 'received' && sameId(message.sender_id, appState.user?.id));
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isMine ? 'sent' : 'received'}`;
    if (id) msgDiv.dataset.msgId = id;
    msgDiv.innerHTML = `${escapeHtml(message.message)}<small>${formatTime(message.created_at || new Date())}</small>`;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
    return true;
}

function handleIncomingMessage(msg, { notify = true } = {}) {
    if (!msg || !appState.user) return;
    // Ignore own messages (already rendered optimistically)
    if (sameId(msg.sender_id, appState.user.id)) return;

    if (isChatOpen() && sameId(msg.sender_id, appState.currentChat)) {
        const added = appendMessageBubble(msg, 'received');
        if (added) {
            api.markMessagesAsRead(appState.user.id, appState.currentChat).catch(() => {});
        }
        return;
    }

    // Not in that chat — notify + badge
    if (notify && msg.id != null && String(msg.id) !== String(lastNotifiedMessageId)) {
        lastNotifiedMessageId = msg.id;
        const preview = msg.message || '';
        toastNewMessage(preview);
        // OS notification when tab is in background (SW path); toast covers foreground
        showLocalNotification('Nouveau message — Getme', {
            body: preview ? String(preview).slice(0, 80) : 'Vous avez reçu un message',
            tag: 'getme-message',
            data: { type: 'message', url: '/?tab=messages', from: msg.sender_id }
        });
    }
    if (typeof onNewMessageCb === 'function') onNewMessageCb();
    refreshUnreadBadge();
    if (isMessagesTabVisible() && !isChatOpen()) {
        loadConversations();
    }
}

async function refreshUnreadBadge({ notifyOnIncrease = false } = {}) {
    if (!appState.user) {
        updateMessagesTabBadge(0);
        return;
    }
    try {
        const conversations = await api.getConversations(appState.user.id);
        const total = (conversations || []).reduce((sum, c) => sum + (c.unread_count || 0), 0);
        if (notifyOnIncrease && total > lastKnownUnread && total > 0 && !isChatOpen()) {
            toastNewMessage();
        }
        lastKnownUnread = total;
        updateMessagesTabBadge(total);
    } catch (err) {
        console.warn('refreshUnreadBadge:', err);
    }
}

function stopChatPoll() {
    if (chatPollTimer) {
        clearInterval(chatPollTimer);
        chatPollTimer = null;
    }
}

function startChatPoll(otherUserId) {
    stopChatPoll();
    chatPollTimer = setInterval(() => pollOpenChat(otherUserId), 2500);
}

async function pollOpenChat(otherUserId) {
    if (!appState.user || !sameId(appState.currentChat, otherUserId) || !isChatOpen()) return;
    try {
        const messages = await api.getMessages(appState.user.id, otherUserId);
        let added = false;
        for (const m of messages || []) {
            if (m.id != null && renderedMessageIds.has(String(m.id))) continue;
            if (sameId(m.sender_id, appState.user.id)) {
                // Sync own message ids into the set without re-rendering
                if (m.id != null) renderedMessageIds.add(String(m.id));
                continue;
            }
            if (appendMessageBubble(m, 'received')) added = true;
        }
        if (added) {
            await api.markMessagesAsRead(appState.user.id, otherUserId);
            refreshUnreadBadge();
        }
    } catch (err) {
        console.warn('pollOpenChat:', err);
    }
}

function stopInboxPoll() {
    if (inboxPollTimer) {
        clearInterval(inboxPollTimer);
        inboxPollTimer = null;
    }
}

function startInboxPoll() {
    stopInboxPoll();
    inboxPollTimer = setInterval(() => {
        if (!appState.user) return;
        refreshUnreadBadge({ notifyOnIncrease: true });
        if (isChatOpen() && appState.currentChat) {
            pollOpenChat(appState.currentChat);
        }
    }, 5000);
}

async function removeChannelSafe(channel) {
    if (!channel) return;
    try {
        await supabase.removeChannel(channel);
    } catch (err) {
        console.warn('removeChannel:', err);
    }
}

export async function unsubscribeFromMessages() {
    stopChatPoll();
    stopInboxPoll();
    await removeChannelSafe(currentChatChannel);
    currentChatChannel = null;
    await removeChannelSafe(globalMessageChannel);
    globalMessageChannel = null;
    globalUserId = null;
    onNewMessageCb = null;
    renderedMessageIds.clear();
    lastKnownUnread = 0;
    lastNotifiedMessageId = null;
    updateMessagesTabBadge(0);
}

export function subscribeToGlobalMessages(userId, onNewMessage) {
    if (!userId) return;

    // Re-subscribe if user changed
    if (globalMessageChannel && sameId(globalUserId, userId)) {
        onNewMessageCb = onNewMessage || onNewMessageCb;
        startInboxPoll();
        refreshUnreadBadge();
        return;
    }

    // Tear down previous
    removeChannelSafe(globalMessageChannel);
    globalMessageChannel = null;

    globalUserId = userId;
    onNewMessageCb = onNewMessage || null;

    globalMessageChannel = supabase
        .channel(`global-messages-${userId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${userId}`
        }, (payload) => {
            handleIncomingMessage(payload.new, { notify: true });
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ Realtime messages connected');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('⚠️ Realtime messages unavailable — using polling fallback', status);
            }
        });

    startInboxPoll();
    refreshUnreadBadge();
}

export async function loadConversations() {
    if (!appState.user) return;
    const container = document.getElementById('conversationsList');
    if (container) container.innerHTML = '<div class="loading">Chargement</div>';

    let conversations;
    try {
        conversations = await api.getConversations(appState.user.id);
    } catch (err) {
        console.error('loadConversations:', err);
        showNotification('Impossible de charger les conversations', true);
        if (container) container.innerHTML = '<div class="info-card">Erreur réseau</div>';
        return;
    }

    const total = (conversations || []).reduce((sum, c) => sum + (c.unread_count || 0), 0);
    lastKnownUnread = total;
    updateMessagesTabBadge(total);

    if (!conversations || conversations.length === 0) {
        if (container) container.innerHTML = '<div class="info-card">Débloquez quelqu\'un pour commencer à discuter</div>';
        return;
    }
    container.innerHTML = conversations.map(c => {
        const initial = escapeHtml((c.username || '?').charAt(0).toUpperCase());
        const safeName = escapeHtml(c.username || '?');
        return `
        <div class="user-card" data-id="${c.other_user_id}" data-name="${safeName}">
            <button type="button" class="user-card-avatar conv-profile-btn" data-id="${c.other_user_id}" data-name="${safeName}" title="Voir le profil">
              ${c.avatar_url ? `<img src="${escapeHtml(c.avatar_url)}" alt="">` : initial}
            </button>
            <div class="user-card-body">
                <button type="button" class="user-name conv-profile-btn" data-id="${c.other_user_id}" data-name="${safeName}">${safeName}</button>
                <div class="user-distance">${escapeHtml(c.last_message || 'Nouvelle conversation')}</div>
            </div>
            ${c.unread_count > 0 ? `<span class="badge badge-unread">${c.unread_count}</span>` : ''}
            <button type="button" class="chat-btn" data-id="${c.other_user_id}" data-name="${safeName}" title="Ouvrir le chat">→</button>
        </div>`;
    }).join('');
    document.querySelectorAll('#conversationsList .chat-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            startChat(btn.dataset.id, btn.dataset.name);
        };
    });
    document.querySelectorAll('#conversationsList .conv-profile-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            openPeerProfile(btn.dataset.id, btn.dataset.name);
        };
    });
    // Rest of card opens the conversation
    document.querySelectorAll('#conversationsList .user-card').forEach(card => {
        card.onclick = () => startChat(card.dataset.id, card.dataset.name);
    });
}

async function openPeerProfile(userId, userName) {
    try {
        const { showUserProfile } = await import('./map.js');
        await showUserProfile(userId, userName);
    } catch (err) {
        console.error('openPeerProfile:', err);
        showNotification('Impossible d’ouvrir le profil', true);
    }
}

export async function startChat(userId, userName) {
    if (!appState.user) {
        showNotification('Connectez-vous pour discuter', true);
        return;
    }

    setTabActive('messages');

    stopChatPoll();
    await removeChannelSafe(currentChatChannel);
    currentChatChannel = null;
    renderedMessageIds.clear();

    setState('currentChat', userId);
    const chatWith = document.getElementById('chatWith');
    if (chatWith) {
        chatWith.innerHTML =
            `<button type="button" class="chat-with-link" id="chatWithProfileBtn" title="Voir le profil">
                ${escapeHtml(userName)}
                <span class="chat-with-hint">Voir profil · photos · bio</span>
            </button>`;
        const profileBtn = document.getElementById('chatWithProfileBtn');
        if (profileBtn) {
            profileBtn.onclick = () => openPeerProfile(userId, userName);
        }
    }
    document.getElementById('conversationsList').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    bindCallButton(userId, userName);

    const container = document.getElementById('chatMessages');
    container.innerHTML = '<div class="loading">Chargement</div>';

    let messages;
    try {
        messages = await api.getMessages(appState.user.id, userId);
        await api.markMessagesAsRead(appState.user.id, userId);
        refreshUnreadBadge();
    } catch (err) {
        console.error('startChat:', err);
        showNotification('Impossible de charger les messages', true);
        container.innerHTML = '<div class="info-card">Erreur réseau</div>';
        return;
    }

    container.innerHTML = '';
    if (messages?.length) {
        for (const m of messages) {
            appendMessageBubble(m);
        }
    } else {
        container.innerHTML = '<div style="text-align:center;color:var(--text3);">Aucun message</div>';
    }
    container.scrollTop = container.scrollHeight;

    // Realtime for this conversation (incoming only)
    currentChatChannel = supabase
        .channel(`chat-${appState.user.id}-${userId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${appState.user.id}`
        }, (payload) => {
            if (sameId(payload.new?.sender_id, userId)) {
                handleIncomingMessage(payload.new, { notify: false });
            }
        })
        .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('⚠️ Chat realtime down — polling active', status);
            }
        });

    // Always poll as reliable fallback (works even if Realtime publication is off)
    startChatPoll(userId);
}

export async function sendMessage() {
    const input = document.getElementById('messageInput');
    const msg = input?.value.trim();
    if (!msg || !appState.currentChat || !appState.user) return;

    let inserted;
    try {
        inserted = await api.sendMessage(appState.user.id, appState.currentChat, msg);
    } catch (err) {
        console.error('sendMessage:', err);
        showNotification('Échec de l\'envoi', true);
        return;
    }

    input.value = '';
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (row) {
        appendMessageBubble({
            id: row.id,
            sender_id: appState.user.id,
            message: row.message || msg,
            created_at: row.created_at || new Date().toISOString()
        }, 'sent');
    } else {
        appendMessageBubble({
            sender_id: appState.user.id,
            message: msg,
            created_at: new Date().toISOString()
        }, 'sent');
    }

    // Push notification to the other person (works when app is closed if configured)
    notifyUserPush(appState.currentChat, {
        title: 'Nouveau message',
        message: msg.slice(0, 80),
        url: '/?tab=messages',
        tag: 'getme-message',
        data: { type: 'message', from: appState.user.id }
    });
}

export function closeChat() {
    stopChatPoll();
    removeChannelSafe(currentChatChannel);
    currentChatChannel = null;
    renderedMessageIds.clear();
    setState('currentChat', null);
    document.getElementById('conversationsList').classList.remove('hidden');
    document.getElementById('chatView').classList.add('hidden');
    const callBtn = document.getElementById('startCallBtn');
    if (callBtn) callBtn.classList.add('hidden');
    loadConversations();
}
