import { normalizePhone } from './phone.js';
export function isValidCommand(text, prefix = '.') {
    if (!text || typeof text !== 'string')
        return false;
    return text.trim().startsWith(prefix);
}
export function isValidMessageForPoints(msg, prefix = '.') {
    if (!msg.body || typeof msg.body !== 'string')
        return false;
    const text = msg.body || '';
    const isMypoints = text.trim() === `${prefix}mypoints`;
    if (text.trim().startsWith(prefix) && !isMypoints) {
        return false;
    }
    if (text.trim().length < 3) {
        return false;
    }
    return true;
}
export function isValidPhone(phone) {
    if (!phone)
        return false;
    const normalized = normalizePhone(phone);
    return normalized.length >= 10 && /^\d+$/.test(normalized);
}
export function isValidPrizeCode(code) {
    if (!code || typeof code !== 'string')
        return false;
    return /^[A-Z0-9_]+$/.test(code.trim().toUpperCase()) && code.trim().length >= 3;
}
export function isValidPoints(points) {
    return typeof points === 'number' && points >= 0 && Number.isInteger(points);
}
export default {
    isValidCommand,
    isValidMessageForPoints,
    isValidPhone,
    isValidPrizeCode,
    isValidPoints
};
