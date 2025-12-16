import { EMOJIS } from '../config/constants.js';
export function formatNumber(num) {
    return new Intl.NumberFormat('es-AR').format(num);
}
export function formatDate(date) {
    if (!date)
        return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(d);
}
export function formatRelativeTime(date) {
    if (!date)
        return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0)
        return `Hace ${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0)
        return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
    if (minutes > 0)
        return `Hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    return 'Hace unos segundos';
}
export function replacePlaceholders(text, data) {
    let result = text;
    for (const [key, value] of Object.entries(data)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
    return result;
}
export function formatError(message) {
    return { text: `${EMOJIS.ERROR} ${message}` };
}
export function formatSuccess(message) {
    return { text: `${EMOJIS.SUCCESS} ${message}` };
}
export default {
    formatNumber,
    formatDate,
    formatRelativeTime,
    replacePlaceholders,
    formatError,
    formatSuccess
};
