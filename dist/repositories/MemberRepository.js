import { getFirestore } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getNow } from '../utils/time.js';
import { normalizeGroupId } from '../utils/phone.js';
import logger from '../lib/logger.js';
const COLLECTION = 'groups';
export class MemberRepository {
    static isValidPhone(phone, groupId) {
        if (!phone)
            return false;
        if (phone.includes('@lid'))
            return true;
        if (groupId && phone === groupId.replace('@g.us', ''))
            return false;
        if (phone.includes('@') && !phone.includes('@lid'))
            return false;
        if (phone.includes(':'))
            return false;
        if (!/^\d+$/.test(phone))
            return false;
        return true;
    }
    static async findByPhoneOrLid(groupId, phone, lid = null) {
        const startTime = Date.now();
        const normalized = normalizeGroupId(groupId);
        const db = getFirestore();
        if (phone) {
            const memberByPhone = await this.getByPhone(groupId, phone);
            if (memberByPhone) {
                logger.debug(`Member found by phone: ${phone}`);
                return { data: memberByPhone, foundBy: 'phone', docId: phone };
            }
        }
        if (lid) {
            const lidWithSuffix = lid.includes('@lid') ? lid : `${lid}@lid`;
            const lidWithoutSuffix = lid.replace('@lid', '');
            const membersRef = db.collection(COLLECTION)
                .doc(normalized)
                .collection('members');
            let snapshot = await membersRef.where('lid', '==', lidWithSuffix).limit(1).get();
            if (snapshot.empty) {
                snapshot = await membersRef.where('lid', '==', lidWithoutSuffix).limit(1).get();
            }
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                logger.debug(`Member found by lid: ${lid} (docId: ${doc.id})`);
                return { data: doc.data(), foundBy: 'lid', docId: doc.id };
            }
        }
        const duration = Date.now() - startTime;
        logger.debug(`[${new Date().toISOString()}] [SEARCH] Member not found by phone=${phone} or lid=${lid} (${duration}ms)`);
        return null;
    }
    static async getByPhone(groupId, phone) {
        const startTime = Date.now();
        const normalized = normalizeGroupId(groupId);
        const db = getFirestore();
        const memberRef = db.collection(COLLECTION)
            .doc(normalized)
            .collection('members')
            .doc(phone);
        const doc = await memberRef.get();
        const result = doc.exists ? 'SUCCESS' : 'NOT_FOUND';
        logger.info(`[${new Date().toISOString()}] [READ] groups/${normalized}/members/${phone} → ${result} (${Date.now() - startTime}ms)`);
        return doc.exists ? doc.data() : null;
    }
    static async save(groupId, memberData) {
        const startTime = Date.now();
        const normalized = normalizeGroupId(groupId);
        const db = getFirestore();
        const phone = memberData.phone;
        const lid = memberData.lid || null;
        let docId = phone;
        if (!docId && lid) {
            docId = lid.replace('@lid', '').replace(/[^\d]/g, '');
        }
        if (!docId) {
            throw new Error('Cannot save member without phone or lid');
        }
        const memberRef = db.collection(COLLECTION)
            .doc(normalized)
            .collection('members')
            .doc(docId);
        const dataToSave = {
            ...memberData,
            phone: docId,
            lid: lid || null,
            updatedAt: getNow()
        };
        await memberRef.set(dataToSave, { merge: true });
        logger.info(`[${new Date().toISOString()}] [WRITE] groups/${normalized}/members/${docId} (lid=${lid || 'null'}) → SUCCESS (${Date.now() - startTime}ms)`);
        return dataToSave;
    }
    static async update(groupId, phone, data) {
        const startTime = Date.now();
        const normalized = normalizeGroupId(groupId);
        const db = getFirestore();
        const memberRef = db.collection(COLLECTION)
            .doc(normalized)
            .collection('members')
            .doc(phone);
        await memberRef.set({
            ...data,
            updatedAt: getNow()
        }, { merge: true });
        logger.info(`[${new Date().toISOString()}] [UPDATE] groups/${normalized}/members/${phone} → SUCCESS (${Date.now() - startTime}ms)`);
    }
    static async mergeMemberDocs(groupId, phone, lid) {
        const db = getFirestore();
        const normalized = normalizeGroupId(groupId);
        const membersRef = db.collection(COLLECTION).doc(normalized).collection('members');
        const phoneId = phone.includes('@') ? phone.split('@')[0] : phone;
        const lidWithSuffix = lid ? (lid.includes('@lid') ? lid : `${lid}@lid`) : null;
        let phoneDoc = await membersRef.doc(phoneId).get();
        let lidDoc = null;
        if (lidWithSuffix) {
            const snap = await membersRef.where('lid', '==', lidWithSuffix).limit(1).get();
            lidDoc = snap.empty ? null : snap.docs[0];
        }
        const phoneData = phoneDoc.exists ? phoneDoc.data() : null;
        const lidData = lidDoc && lidDoc.exists ? lidDoc.data() : null;
        const merged = {
            ...(lidData || {}),
            ...(phoneData || {}),
            phone: phoneId,
            lid: lidWithSuffix || lidData?.lid || null,
            updatedAt: getNow()
        };
        await membersRef.doc(phoneId).set(merged, { merge: true });
        if (lidDoc && lidDoc.id !== phoneId) {
            try {
                await membersRef.doc(lidDoc.id).delete();
            }
            catch { }
        }
        return merged;
    }
    static async updateActivity(groupId, phone) {
        const db = getFirestore();
        const normalized = normalizeGroupId(groupId);
        const cleanPhone = phone.includes('@') ? phone.split('@')[0] : phone;
        logger.info(`[updateActivity] groupId=${groupId}, phone=${phone}, cleanPhone=${cleanPhone}`);
        const memberRef = db.collection(COLLECTION)
            .doc(normalized)
            .collection('members')
            .doc(cleanPhone);
        const now = getNow();
        try {
            await memberRef.update({
                lastActiveAt: now,
                lastMessageAt: now,
                messageCount: FieldValue.increment(1),
                totalMessagesCount: FieldValue.increment(1),
                updatedAt: now
            });
            logger.info(`[updateActivity] SUCCESS for ${cleanPhone}`);
        }
        catch (err) {
            logger.warn(`[updateActivity] update failed for ${cleanPhone}, trying set merge: ${err.message}`);
            try {
                await memberRef.set({
                    lastActiveAt: now,
                    lastMessageAt: now,
                    messageCount: FieldValue.increment(1),
                    totalMessagesCount: FieldValue.increment(1),
                    updatedAt: now
                }, { merge: true });
                logger.info(`[updateActivity] set merge SUCCESS for ${cleanPhone}`);
            }
            catch (setErr) {
                logger.error(`[updateActivity] set merge also failed for ${cleanPhone}: ${setErr.message}`);
            }
        }
    }
    static async getActiveMembers(groupId) {
        const startTime = Date.now();
        const normalized = normalizeGroupId(groupId);
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION)
            .doc(normalized)
            .collection('members')
            .where('isMember', '==', true)
            .get();
        logger.info(`[${new Date().toISOString()}] [READ] groups/${normalized}/members (where isMember==true) → ${snapshot.size} docs (${Date.now() - startTime}ms)`);
        return snapshot.docs.map(doc => doc.data());
    }
    static async getByPoints(groupId, limit = 10) {
        const startTime = Date.now();
        const normalized = normalizeGroupId(groupId);
        const db = getFirestore();
        const snapshot = await db.collection(COLLECTION)
            .doc(normalized)
            .collection('members')
            .orderBy('points', 'desc')
            .limit(limit)
            .get();
        logger.info(`[${new Date().toISOString()}] [READ] groups/${normalized}/members (orderBy points desc, limit ${limit}) → ${snapshot.size} docs (${Date.now() - startTime}ms)`);
        return snapshot.docs.map(doc => doc.data());
    }
    static async getRankPosition(groupId, phone) {
        const startTime = Date.now();
        const normalized = normalizeGroupId(groupId);
        const db = getFirestore();
        const member = await this.getByPhone(normalized, phone);
        if (!member)
            return 0;
        const points = member.points || 0;
        const snapshot = await db.collection(COLLECTION)
            .doc(normalized)
            .collection('members')
            .where('points', '>', points)
            .get();
        const rank = snapshot.size + 1;
        logger.info(`[${new Date().toISOString()}] [READ] groups/${normalized}/members (rank calculation for ${phone}) → RANK ${rank} (${Date.now() - startTime}ms)`);
        return rank;
    }
    static async searchByName(groupId, nameQuery) {
        if (!nameQuery || nameQuery.length < 3)
            return null;
        const normalized = normalizeGroupId(groupId);
        const db = getFirestore();
        const q = nameQuery.toLowerCase();
        const activeMembers = await this.getActiveMembers(normalized);
        const found = activeMembers.find(m => {
            const dName = (m.displayName || '').toLowerCase();
            if (dName === q)
                return true;
            const phone = m.phone || '';
            if (phone.includes(q))
                return true;
            return dName.includes(q);
        });
        return found || null;
    }
}
export default MemberRepository;
