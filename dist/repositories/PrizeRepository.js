import { getFirestore } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getNow } from '../utils/time.js';
const COLLECTION = 'groups';
export class PrizeRepository {
    static async getByCode(groupId, code) {
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION)
            .doc(groupId)
            .collection('prizes')
            .where('code', '==', code)
            .get();
        if (snapshot.empty)
            return null;
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    }
    static async getById(groupId, prizeId) {
        const db = getFirestore();
        const doc = await db.collection(COLLECTION)
            .doc(groupId)
            .collection('prizes')
            .doc(prizeId)
            .get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    }
    static async save(groupId, prizeData) {
        const db = getFirestore();
        const prizeRef = db.collection(COLLECTION)
            .doc(groupId)
            .collection('prizes')
            .doc();
        const newPrize = {
            ...prizeData,
            id: prizeRef.id,
            createdAt: getNow(),
            updatedAt: getNow()
        };
        await prizeRef.set(newPrize);
        return newPrize;
    }
    static async getActive(groupId) {
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION)
            .doc(groupId)
            .collection('prizes')
            .where('isActive', '==', true)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    static async getAll(groupId) {
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION)
            .doc(groupId)
            .collection('prizes')
            .orderBy('createdAt', 'desc')
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    static async update(groupId, prizeId, data) {
        const db = getFirestore();
        const prizeRef = db.collection(COLLECTION)
            .doc(groupId)
            .collection('prizes')
            .doc(prizeId);
        await prizeRef.update({
            ...data,
            updatedAt: getNow()
        });
    }
    static async delete(groupId, prizeId) {
        const db = getFirestore();
        await db.collection(COLLECTION)
            .doc(groupId)
            .collection('prizes')
            .doc(prizeId)
            .delete();
    }
    static async incrementClaimedCount(groupId, prizeId) {
        const db = getFirestore();
        const prizeRef = db.collection(COLLECTION)
            .doc(groupId)
            .collection('prizes')
            .doc(prizeId);
        await prizeRef.update({
            claimedCount: FieldValue.increment(1),
            updatedAt: getNow()
        });
    }
}
export default PrizeRepository;
