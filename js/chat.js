import { supabase } from './supabaseClient.js';
import { appState, setState } from './state.js';
import { api } from './api.js';
import { escapeHtml, formatTime } from './utils.js';
import { showNotification, setTabActive } from './ui.js';

let currentChatChannel = null;
let globalMessageChannel = null;

export function subscribeToGlobalMessages(userId, onNewMessage) {
    if (globalMessageChannel || !userId) return;
    globalMessageChannel = supabase
        .channel(`global-messages-${userId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${userId}`
        }, (payload) => {
            if (payload.new.sender_id !== appState.currentChat) {
                showNotification("📩 Nouveau message reçu");
                if (onNewMessage) onNewMessage();
            }
        })
        .subscribe();
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
        if (container) container.innerHTML = '<div class="info-card">⚠️ Erreur réseau</div>';
        return;
    }

    if (!conversations || conversations.length === 0) {
        if (container) container.innerHTML = '<div class="info-card">🔒 Débloquez quelqu\'un pour chatter</div>';
        return;
    }
    container.innerHTML = conversations.map(c => `
        <div class="user-card" data-id="${c.other_user_id}" data-name="${escapeHtml(c.username)}">
            <div class="user-card-avatar">${c.avatar_url ? `<img src="${escapeHtml(c.avatar_url)}" alt="">` : '👤'}</div>
            <div style="flex:1;">
                <div style="color:var(--text1); font-weight:600;">${escapeHtml(c.username)}</div>
                <div style="font-size:11px; color:var(--text3);">${escapeHtml(c.last_message || 'Nouvelle conversation')}</div>
            </div>
            ${c.unread_count > 0 ? `<span class="badge" style="background:#ef4444;color:#fff;">${c.unread_count}</span>` : ''}
            <button class="chat-btn" data-id="${c.other_user_id}" data-name="${escapeHtml(c.username)}">💬</button>
        </div>
    `).join('');
    document.querySelectorAll('#conversationsList .chat-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            startChat(btn.dataset.id, btn.dataset.name);
        };
    });
    document.querySelectorAll('#conversationsList .user-card').forEach(card => {
        card.onclick = () => startChat(card.dataset.id, card.dataset.name);
    });
}

export async function startChat(userId, userName) {
    if (!appState.user) {
        showNotification('Connectez-vous pour discuter', true);
        return;
    }

    // Switch to messages tab so chat is visible
    setTabActive('messages');

    if (currentChatChannel) {
        await supabase.removeChannel(currentChatChannel);
        currentChatChannel = null;
    }
    setState('currentChat', userId);
    document.getElementById('chatWith').innerHTML = `💬 ${escapeHtml(userName)}`;
    document.getElementById('conversationsList').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');

    const container = document.getElementById('chatMessages');
    container.innerHTML = '<div class="loading">Chargement</div>';

    let messages;
    try {
        messages = await api.getMessages(appState.user.id, userId);
        await api.markMessagesAsRead(appState.user.id, userId);
    } catch (err) {
        console.error('startChat:', err);
        showNotification('Impossible de charger les messages', true);
        container.innerHTML = '<div class="info-card">⚠️ Erreur réseau</div>';
        return;
    }

    container.innerHTML = messages?.length
        ? messages.map(m => `
            <div class="message ${m.sender_id === appState.user.id ? 'sent' : 'received'}">
                ${escapeHtml(m.message)}
                <small>${formatTime(m.created_at)}</small>
            </div>
        `).join('')
        : '<div style="text-align:center;color:var(--text3);">Aucun message</div>';
    container.scrollTop = container.scrollHeight;

    currentChatChannel = supabase
        .channel(`chat-${userId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${appState.user.id}`
        }, (payload) => {
            if (payload.new.sender_id === userId) {
                const msgDiv = document.createElement('div');
                msgDiv.className = 'message received';
                msgDiv.innerHTML = `${escapeHtml(payload.new.message)}<small>${formatTime(new Date())}</small>`;
                container.appendChild(msgDiv);
                container.scrollTop = container.scrollHeight;
            }
        })
        .subscribe();
}

export async function sendMessage() {
    const input = document.getElementById('messageInput');
    const msg = input?.value.trim();
    if (!msg || !appState.currentChat || !appState.user) return;

    try {
        await api.sendMessage(appState.user.id, appState.currentChat, msg);
    } catch (err) {
        console.error('sendMessage:', err);
        showNotification('Échec de l\'envoi', true);
        return;
    }

    input.value = '';
    const container = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message sent';
    msgDiv.innerHTML = `${escapeHtml(msg)}<small>Maintenant</small>`;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

export function closeChat() {
    if (currentChatChannel) {
        supabase.removeChannel(currentChatChannel);
        currentChatChannel = null;
    }
    setState('currentChat', null);
    document.getElementById('conversationsList').classList.remove('hidden');
    document.getElementById('chatView').classList.add('hidden');
    loadConversations();
}
