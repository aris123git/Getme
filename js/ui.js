import { escapeHtml } from './utils.js';

let toastTimer = null;

/**
 * In-app toast — always visible above map/modals (top center).
 * Use for login, GPS, errors, new messages, etc.
 */
export function showNotification(message, isError = false) {
    const text = String(message || '').trim();
    if (!text) return;

    let host = document.getElementById('toastHost');
    if (!host) {
        host = document.createElement('div');
        host.id = 'toastHost';
        host.setAttribute('aria-live', 'polite');
        host.setAttribute('aria-atomic', 'true');
        document.body.appendChild(host);
    }

    // Replace any current toast
    host.innerHTML = '';
    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }

    const notif = document.createElement('div');
    notif.className = `notification${isError ? ' error' : ''}`;
    notif.setAttribute('role', 'status');
    notif.textContent = text;
    host.appendChild(notif);

    // Trigger enter animation after paint
    requestAnimationFrame(() => {
        notif.classList.add('is-visible');
    });

    const ms = isError ? 4500 : 3500;
    toastTimer = setTimeout(() => {
        notif.classList.remove('is-visible');
        notif.classList.add('is-leaving');
        setTimeout(() => {
            if (notif.parentNode) notif.remove();
        }, 280);
        toastTimer = null;
    }, ms);
}

export function setTabActive(tabName) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) tab.classList.add('active');
    });
    const tabIds = { map: 'mapTab', messages: 'messagesTab', profile: 'profileTab', admin: 'adminTab' };
    Object.values(tabIds).forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById(tabIds[tabName])?.classList.remove('hidden');
    // Keep main screen in sync (desire line lives only in #mapTab)
    document.getElementById('mainScreen')?.setAttribute('data-tab', tabName);
}

// --- Loader sur bouton pendant une action async ---
export function setButtonLoading(btn, isLoading, loadingText = 'Patientez…') {
    if (!btn) return;
    if (isLoading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = loadingText;
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
        btn.disabled = false;
    }
}

// Enrobe un handler async : désactive le bouton pendant l'exécution, le réactive après (même en cas d'erreur)
export function withLoading(btn, asyncFn, loadingText) {
    return async (...args) => {
        setButtonLoading(btn, true, loadingText);
        try {
            await asyncFn(...args);
        } finally {
            setButtonLoading(btn, false);
        }
    };
}

// --- Modale de confirmation (remplace confirm() natif) ---
export function showConfirmModal(message) {
    return new Promise((resolve) => {
        const existing = document.querySelector('.confirm-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-box">
                <p>${escapeHtml(message)}</p>
                <div class="confirm-actions">
                    <button class="secondary confirm-cancel">Annuler</button>
                    <button class="confirm-ok">Confirmer</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('.confirm-cancel').onclick = () => {
            overlay.remove();
            resolve(false);
        };
        overlay.querySelector('.confirm-ok').onclick = () => {
            overlay.remove();
            resolve(true);
        };
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        };
    });
}
