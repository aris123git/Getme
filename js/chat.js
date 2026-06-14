import { supabase } from './supabaseClient.js';
import { appState, setState } from './state.js';
import { api } from './api.js';
import { escapeHtml, formatTime } from './utils.js';
import { showNotification } from './ui.js';

let currentChatChannel = null;

export async function loadConversations() {
    if (!appState.user) return;
    
    const conversations = await api.getConversations(appState.user.id);
    const container = document.getElementById('conversationsList');
    
    if (!conversations || conversations.length === 0) {
        container.innerHTML = '<div class="info-card">🔒 Débloquez quelqu\'un pour chatter</div>';
        return;
    }
    
    container.innerHTML = conversations.map(c => `
        <div class="user-card">
            <div class="user-card-avatar">
                ${c.avatar_url ? `<img src="${escapeHtml(c.avatar_url)}">` : '👤'}
            </div>
            <div style="flex:1;">
                <div style="color:white; font-weight:600;">${escapeHtml(c.username)}</div>
                <div style="font-size:11px; color:#64748b;">${escapeHtml(c.last_message || 'Nouvelle conversation')}</div>
            </div>
            ${c.unread_count > 0 ? `<span class="badge" style="background:#ef4444;">${c.unread_count}</span>` : ''}
            <button class="chat-btn" data-id="${c.other_user_id}" data-name="${escapeHtml(c.username)}">💬</button>
        </div>
    `).join('');
    
    document.querySelectorAll('.chat-btn').forEach(btn => {
        btn.onclick = () => startChat(btn.dataset.id, btn.dataset.name);
    });
}

export async function startChat(userId, userName) {
    if (currentChatChannel) {
        await supabase.removeChannel(currentChatChannel);
        currentChatChannel = null;
    }
    
    setState('currentChat', userId);
    document.getElementById('chatWith').innerHTML = `💬 ${escapeHtml(userName)}`;
    document.getElementById('conversationsList').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    
    const messages = await api.getMessages(appState.user.id, userId);
    const container = document.getElementById('chatMessages');
    
    container.innerHTML = messages?.map(m => `
        <div class="message ${m.sender_id === appState.user.id ? 'sent' : 'received'}">
            ${escapeHtml(m.message)}
            <small>${formatTime(m.created_at)}</small>
        </div>
    `).join('') || '<div style="text-align:center;color:#94a3b8;">Aucun message</div>';
    
    container.scrollTop = container.scrollHeight;
    
    await api.markMessagesAsRead(appState.user.id, userId);
    
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
                showNotification(`📩 Nouveau message de ${userName}`);
            }
        })
        .subscribe();
}

export async function sendMessage() {
    const msg = document.getElementById('messageInput').value.trim();
    if (!msg || !appState.currentChat) return;
    
    await api.sendMessage(appState.user.id, appState.currentChat, msg);
    document.getElementById('messageInput').value = '';
    
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
