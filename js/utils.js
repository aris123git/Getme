export const MIN_AGE = 18;
export const MAX_AGE = 120;
export const MAX_GALLERY_PHOTOS = 9;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

export function formatDistance(d) {
    if (d < 1) return `${(d * 1000).toFixed(0)} m`;
    return `${d.toFixed(1)} km`;
}

export function formatTime(date) {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function validateUsername(username) {
    return username && username.length >= 3 && username.length <= 30 && /^[a-zA-Z0-9_]+$/.test(username);
}

export function validateAge(age) {
    const n = Number(age);
    return Number.isInteger(n) && n >= MIN_AGE && n <= MAX_AGE;
}

export function genderLabel(gender) {
    if (gender === 'femme') return 'Femme';
    if (gender === 'homme') return 'Homme';
    if (gender === 'autre') return 'Autre';
    return '';
}

export function visibilityLabel(v) {
    if (v === 'private') return 'Privé';
    if (v === 'on_request') return 'Sur demande';
    return 'Public';
}

export function isAcceptedImage(file) {
    if (!file) return false;
    if (ACCEPTED_IMAGE_TYPES.includes(file.type)) return true;
    const name = (file.name || '').toLowerCase();
    return name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
}

export async function retry(fn, retries = 3, delay = 1000) {
    try {
        const result = await fn();
        if (result && typeof result === 'object' && result.error && retries > 0) {
            await new Promise(r => setTimeout(r, delay));
            return retry(fn, retries - 1, delay);
        }
        return result;
    } catch (error) {
        if (retries === 0) throw error;
        await new Promise(r => setTimeout(r, delay));
        return retry(fn, retries - 1, delay);
    }
}

/** Compress to JPEG, max edge 1200px. Rejects invalid types / oversized files. */
export function compressImage(file, { maxEdge = 1200, quality = 0.75 } = {}) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('Aucun fichier'));
            return;
        }
        if (!isAcceptedImage(file)) {
            reject(new Error('Formats acceptés : JPG, PNG, WEBP'));
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            reject(new Error('Fichier trop gros (max 5 Mo)'));
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = e => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;
                if (w > h && w > maxEdge) {
                    h = (h * maxEdge) / w;
                    w = maxEdge;
                } else if (h > maxEdge) {
                    w = (w * maxEdge) / h;
                    h = maxEdge;
                }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(
                    b => {
                        if (!b) {
                            reject(new Error('Compression échouée'));
                            return;
                        }
                        const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
                        resolve(new File([b], `${base}.jpg`, { type: 'image/jpeg' }));
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => reject(new Error('Image illisible'));
        };
        reader.onerror = reject;
    });
}
