import { getFirestore } from '../config/firebase.js';
import { getNow } from '../utils/time.js';
import { normalizeGroupId } from '../utils/phone.js';
import logger from '../lib/logger.js';
const COLLECTION = 'groups';
export class GroupRepository {
    static async getById(groupId) {
        const startTime = Date.now();
        const db = getFirestore();
        const normalized = normalizeGroupId(groupId);
        try {
            const doc = await db.collection(COLLECTION).doc(normalized).get();
            const duration = Date.now() - startTime;
            if (doc.exists) {
                logger.debug(`[${new Date().toISOString()}] [READ] groups/${normalized} → SUCCESS (${duration}ms)`);
                return doc.data();
            }
            else {
                logger.debug(`[${new Date().toISOString()}] [READ] groups/${normalized} → NOT FOUND (${duration}ms)`);
                return null;
            }
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[${new Date().toISOString()}] [ERROR] groups/${normalized} → FAILED (${duration}ms)`, error);
            throw error;
        }
    }
    static async save(groupData) {
        const db = getFirestore();
        const normalized = normalizeGroupId(groupData.id);
        const groupRef = db.collection(COLLECTION).doc(normalized);
        const dataToSave = {
            ...groupData,
            id: normalized,
            updatedAt: getNow()
        };
        await groupRef.set(dataToSave, { merge: true });
        return dataToSave;
    }
    static async update(groupId, data) {
        const db = getFirestore();
        const normalized = normalizeGroupId(groupId);
        const groupRef = db.collection(COLLECTION).doc(normalized);
        await groupRef.set({
            ...data,
            updatedAt: getNow()
        }, { merge: true });
    }
    static async getAll() {
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    static async getActive() {
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION)
            .where('isActive', '==', true)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    static async updateConfig(groupId, config) {
        const startTime = Date.now();
        const db = getFirestore();
        const normalized = normalizeGroupId(groupId);
        const groupRef = db.collection(COLLECTION).doc(normalized);
        try {
            await groupRef.set({
                config,
                updatedAt: getNow()
            }, { merge: true });
            const duration = Date.now() - startTime;
            logger.debug(`[${new Date().toISOString()}] [UPDATE] groups/${normalized}/config → SUCCESS (${duration}ms)`);
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[${new Date().toISOString()}] [ERROR] groups/${normalized}/config → FAILED (${duration}ms)`, error);
            throw error;
        }
    }
    static async getConfig(groupId) {
        const startTime = Date.now();
        const normalized = normalizeGroupId(groupId);
        const db = getFirestore();
        try {
            const groupRef = db.collection(COLLECTION).doc(normalized);
            const doc = await groupRef.get();
            const duration = Date.now() - startTime;
            if (!doc.exists) {
                logger.debug(`[${new Date().toISOString()}] [READ] groups/${normalized}/config → NOT FOUND (${duration}ms)`);
                return null;
            }
            const config = doc.data()?.config || null;
            logger.debug(`[${new Date().toISOString()}] [READ] groups/${normalized}/config → SUCCESS (${duration}ms)`);
            return config;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[${new Date().toISOString()}] [ERROR] groups/${normalized}/config → FAILED (${duration}ms)`, error);
            throw error;
        }
    }
}
export default GroupRepository;
