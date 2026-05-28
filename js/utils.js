// Échappement HTML (XSS)
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Debounce pour éviter trop d'appels
export function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Throttle
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Formatage des distances
export function formatDistance(d) {
    if (d < 1) return `${(d * 1000).toFixed(0)} m`;
    return `${d.toFixed(1)} km`;
}

// Formatage des dates
export function formatTime(date) {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Retry automatique
export async function retry(fn, retries = 3, delay = 1000) {
    try {
        return await fn();
    } catch (error) {
        if (retries === 0) throw error;
        await new Promise(r => setTimeout(r, delay));
        return retry(fn, retries - 1, delay);
    }
}

// Validation téléphone (simple)
export function validatePhone(phone) {
    const phoneRegex = /^[0-9]{8,12}$/;
    return phoneRegex.test(phone);
}

// Validation username
export function validateUsername(username) {
    return username && username.length >= 3 && username.length <= 30 && /^[a-zA-Z0-9_]+$/.test(username);
}

// Compression d'image avant upload
export function compressImage(file, maxSizeMB = 1) {
    return new Promise((resolve, reject) => {
        if (file.size <= maxSizeMB * 1024 * 1024) {
            resolve(file);
            return;
        }
        
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxSize = 800;
                
                if (width > height && width > maxSize) {
                    height = (height * maxSize) / width;
                    width = maxSize;
                } else if (height > maxSize) {
                    width = (width * maxSize) / height;
                    height = maxSize;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(blob => {
                    const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });
                    resolve(compressedFile);
                }, 'image/jpeg', 0.7);
            };
        };
        reader.onerror = reject;
    });
}