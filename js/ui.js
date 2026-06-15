import { escapeHtml } from './utils.js';

export function showNotification(message, isError = false) {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    const notif = document.createElement('div');
    notif.className = `notification ${isError ? 'error' : ''}`;
    notif.innerHTML = escapeHtml(message);
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

export function setTabActive(tabName) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) tab.classList.add('active');
    });
    document.getElementById('mapTab')?.classList.add('hidden');
    document.getElementById('messagesTab')?.classList.add('hidden');
    document.getElementById('profileTab')?.classList.add('hidden');
    const tabId = tabName === 'map' ? 'mapTab' : tabName === 'messages' ? 'messagesTab' : 'profileTab';
    document.getElementById(tabId)?.classList.remove('hidden');
}
