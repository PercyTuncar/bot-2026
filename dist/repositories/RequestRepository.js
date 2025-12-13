import { getFirestore } from '../config/firebase.js';
import { getNow } from '../utils/time.js';
const COLLECTION = 'requests';
export class RequestRepository {
    static async create(requestData) {
        const db = getFirestore();
        const requestRef = db.collection(COLLECTION).doc();
        const newRequest = {
            ...requestData,
            status: 'pending',
            requestedAt: getNow(),
            createdAt: getNow()
        };
        await requestRef.set(newRequest);
        return { id: requestRef.id, ...newRequest };
    }
    static async getById(requestId) {
        const db = getFirestore();
        const doc = await db.collection(COLLECTION).doc(requestId).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    }
    static async getByStatus(status, limit = 50) {
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION)
            .where('status', '==', status)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    static async getByUser(phone, limit = 50) {
        const db = getFirestore();
        const normalized = phone.replace('@s.whatsapp.net', '');
        const snapshot = await db.collection(COLLECTION)
            .where('phone', '==', normalized)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    static async getByGroup(groupId, limit = 50) {
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION)
            .where('groupId', '==', groupId)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    static async update(requestId, data) {
        const db = getFirestore();
        const requestRef = db.collection(COLLECTION).doc(requestId);
        await requestRef.update({
            ...data,
            updatedAt: getNow()
        });
    }
    static async approve(requestId, approvedBy) {
        const db = getFirestore();
        const requestRef = db.collection(COLLECTION).doc(requestId);
        await requestRef.update({
            status: 'approved',
            approvedBy,
            approvedAt: getNow(),
            updatedAt: getNow()
        });
    }
    static async markDelivered(requestId, deliveredBy) {
        const db = getFirestore();
        const requestRef = db.collection(COLLECTION).doc(requestId);
        await requestRef.update({
            status: 'delivered',
            deliveredBy,
            deliveredAt: getNow(),
            updatedAt: getNow()
        });
    }
    static async reject(requestId, rejectedBy, reason) {
        const db = getFirestore();
        const requestRef = db.collection(COLLECTION).doc(requestId);
        await requestRef.update({
            status: 'rejected',
            rejectedBy,
            rejectionReason: reason,
            rejectedAt: getNow(),
            updatedAt: getNow()
        });
    }
}
export default RequestRepository;
