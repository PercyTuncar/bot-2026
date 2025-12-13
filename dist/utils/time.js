import { Timestamp } from 'firebase-admin/firestore';
export function getNow() {
    return Timestamp.now();
}
export function toTimestamp(date) {
    if (date instanceof Timestamp) {
        return date;
    }
    if (date instanceof Date) {
        return Timestamp.fromDate(date);
    }
    if (typeof date === 'number') {
        return Timestamp.fromMillis(date);
    }
    if (typeof date === 'string') {
        return Timestamp.fromDate(new Date(date));
    }
    return Timestamp.now();
}
export function hasPassedSeconds(date, seconds) {
    if (!date)
        return true;
    const d = date instanceof Timestamp ? date.toDate() : (date instanceof Date ? date : new Date());
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    return diff >= seconds;
}
export function hasPassedMinutes(date, minutes) {
    return hasPassedSeconds(date, minutes * 60);
}
export default {
    getNow,
    toTimestamp,
    hasPassedSeconds,
    hasPassedMinutes
};
