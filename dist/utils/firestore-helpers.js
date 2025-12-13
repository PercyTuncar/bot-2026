import { getFirestore } from '../config/firebase.js';
import { Timestamp } from 'firebase-admin/firestore';
export function toFirestore(data) {
    if (!data || typeof data !== 'object') {
        return data;
    }
    const result = {};
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined) {
            continue;
        }
        if (value instanceof Date) {
            result[key] = Timestamp.fromDate(value);
        }
        else if (value === null) {
            result[key] = null;
        }
        else if (typeof value === 'object' && !Array.isArray(value)) {
            result[key] = toFirestore(value);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
export function fromFirestore(data) {
    if (!data || typeof data !== 'object') {
        return data;
    }
    const result = {};
    for (const [key, value] of Object.entries(data)) {
        if (value && typeof value.toDate === 'function') {
            result[key] = value.toDate();
        }
        else if (value && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = fromFirestore(value);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
export function createTimestamp() {
    return Timestamp.now();
}
export function timestampFromDate(date) {
    return Timestamp.fromDate(date);
}
export function getCollection(collectionPath) {
    const db = getFirestore();
    return db.collection(collectionPath);
}
export function getDocument(collectionPath, docId) {
    const db = getFirestore();
    return db.collection(collectionPath).doc(docId);
}
export function createBatch() {
    const db = getFirestore();
    return db.batch();
}
export default {
    toFirestore,
    fromFirestore,
    createTimestamp,
    timestampFromDate,
    getCollection,
    getDocument,
    createBatch
};
