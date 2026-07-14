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

export async function retry(fn, retries = 3, delay = 1000) {
    try {
        const result = await fn();
        // Supabase-style { error } responses: retry on error when retries remain
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

export function compressImage(file) {
    return new Promise((resolve, reject) => {
        if (file.size <= 1024 * 1024) {
            resolve(file);
            return;
        }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = e => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                const max = 800;
                if (w > h && w > max) { h = (h * max) / w; w = max; }
                if (h > max) { w = (w * max) / h; h = max; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(
                    b => {
                        if (!b) {
                            reject(new Error('Compression échouée'));
                            return;
                        }
                        resolve(new File([b], file.name, { type: 'image/jpeg' }));
                    },
                    'image/jpeg',
                    0.7
                );
            };
            img.onerror = () => reject(new Error('Image illisible'));
        };
        reader.onerror = reject;
    });
}
