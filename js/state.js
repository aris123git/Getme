export const appState = {
    user: null,
    balance: 0,
    position: null,
    nearbyUsers: [],
    currentChat: null,
    currentChatChannel: null,
    watchId: null,
    map: null,
    userMarkers: [],
    isGpsActive: false
};

const listeners = new Map();

export function subscribe(key, callback) {
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(callback);
    return () => {
        const callbacks = listeners.get(key);
        const index = callbacks.indexOf(callback);
        if (index !== -1) callbacks.splice(index, 1);
    };
}

function notify(key, value) {
    const callbacks = listeners.get(key);
    if (callbacks) callbacks.forEach(cb => cb(value));
}

export function setState(key, value) {
    appState[key] = value;
    notify(key, value);
}

export function updateBalance(balance) {
    appState.balance = balance;
    notify('balance', balance);
}

export function updatePosition(position) {
    appState.position = position;
    notify('position', position);
}
