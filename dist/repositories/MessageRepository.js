import { getFirestore } from '../config/firebase.js';
import { getNow } from '../utils/time.js';
const COLLECTION = 'groups';
export class MessageRepository {
    static async save(groupId, messageData) {
        const db = getFirestore();
        const messageRef = db.collection(COLLECTION)
            .doc(groupId)
            .collection('messages')
            .doc();
        await messageRef.set({
            ...messageData,
            createdAt: getNow(),
            timestamp: getNow()
        });
        return { id: messageRef.id, ...messageData };
    }
    static async getById(groupId, messageId) {
        const db = getFirestore();
        const doc = await db.collection(COLLECTION)
            .doc(groupId)
            .collection('messages')
            .doc(messageId)
            .get();
        if (!doc.exists) {
            return null;
        }
        return { id: doc.id, ...doc.data() };
    }
    static async getByGroup(groupId, limit = 50) {
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION)
            .doc(groupId)
            .collection('messages')
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    static async getByUser(groupId, phone, limit = 50) {
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION)
            .doc(groupId)
            .collection('messages')
            .where('phone', '==', phone)
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    static async countByGroup(groupId) {
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION)
            .doc(groupId)
            .collection('messages')
            .get();
        return snapshot.size;
    }
    static async countByUser(groupId, phone) {
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION)
            .doc(groupId)
            .collection('messages')
            .where('phone', '==', phone)
            .get();
        return snapshot.size;
    }
}
export default MessageRepository;
