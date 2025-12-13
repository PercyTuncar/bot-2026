import { getFirestore } from '../config/firebase.js';
import { getNow } from '../utils/time.js';
import { normalizeGroupId } from '../utils/phone.js';
import logger from '../lib/logger.js';
import MemberRepository from '../repositories/MemberRepository.js';
export class RedemptionHandler {
    static async requestRedemption(groupId, userPhone, userName, rewardId, userNotes = '') {
        const startTime = Date.now();
        const db = getFirestore();
        const normalized = normalizeGroupId(groupId);
        logger.info(`[TRANSACTION START] Request redemption for reward "${rewardId}"`);
        try {
            let canonicalPhone = userPhone;
            try {
                const found = await MemberRepository.findByPhoneOrLid(groupId, userPhone, userPhone);
                if (found && found.docId) {
                    canonicalPhone = found.docId;
                    logger.debug(`[RESOLVE] Resolved ${userPhone} to canonical ${canonicalPhone}`);
                }
            }
            catch (err) {
                logger.warn(`[RESOLVE] Failed to resolve canonical phone for ${userPhone}: ${err.message}`);
            }
            const result = await db.runTransaction(async (transaction) => {
                const memberRef = db.collection('groups').doc(normalized).collection('members').doc(canonicalPhone);
                const memberDoc = await transaction.get(memberRef);
                if (!memberDoc.exists) {
                    throw new Error('Usuario no encontrado');
                }
                const memberData = memberDoc.data();
                logger.debug(`[READ] groups/${normalized}/members/${canonicalPhone} → SUCCESS`);
                logger.debug(`[INFO] User current points: ${memberData.points || 0}`);
                const rewardRef = db.collection('groups').doc(normalized).collection('rewards').doc(rewardId);
                const rewardDoc = await transaction.get(rewardRef);
                if (!rewardDoc.exists) {
                    throw new Error('Recompensa no encontrada');
                }
                const rewardData = rewardDoc.data();
                logger.debug(`[READ] groups/${normalized}/rewards/${rewardId} → SUCCESS`);
                logger.debug(`[INFO] Reward cost: ${rewardData.cost}, stock: ${rewardData.stock}, active: ${rewardData.isActive}`);
                if (!rewardData.isActive) {
                    throw new Error('Esta recompensa no está disponible actualmente');
                }
                if (rewardData.stock !== -1 && rewardData.stock <= 0) {
                    throw new Error('Esta recompensa está agotada');
                }
                const userPoints = memberData.points || 0;
                const rewardCost = rewardData.cost || 0;
                if (userPoints < rewardCost) {
                    throw new Error(`Puntos insuficientes. Necesitas: ${rewardCost}, Tienes: ${userPoints}`);
                }
                const pendingQuery = await db.collection('groups')
                    .doc(normalized)
                    .collection('redemptions')
                    .where('userPhone', '==', canonicalPhone)
                    .where('status', '==', 'pending')
                    .get();
                const groupRef = db.collection('groups').doc(normalized);
                const groupDoc = await transaction.get(groupRef);
                const groupData = groupDoc.data();
                const maxPending = groupData?.config?.maxPendingRedemptions || 5;
                if (pendingQuery.size >= maxPending) {
                    throw new Error(`Ya tienes ${pendingQuery.size} canjes pendientes (máximo: ${maxPending})`);
                }
                logger.debug(`[VALIDATE] ${userPoints} >= ${rewardCost} → VALID`);
                logger.debug(`[VALIDATE] Pending redemptions: ${pendingQuery.size} < ${maxPending} → CAN REQUEST`);
                const redemptionId = `redemption_${Date.now()}_${canonicalPhone}`;
                const redemptionRef = db.collection('groups').doc(normalized).collection('redemptions').doc(redemptionId);
                const redemptionData = {
                    id: redemptionId,
                    redemptionId,
                    redemptionType: 'physical_reward',
                    userPhone: canonicalPhone,
                    userName,
                    rewardId,
                    rewardName: rewardData.name,
                    pointsCost: rewardCost,
                    status: 'pending',
                    requestedAt: getNow(),
                    processedAt: null,
                    deliveredAt: null,
                    processedBy: null,
                    processedByName: null,
                    rejectionReason: null,
                    deliveryNotes: '',
                    deliveredBy: null,
                    userNotes,
                    adminNotes: ''
                };
                transaction.set(redemptionRef, redemptionData);
                logger.debug(`[CREATE] groups/${normalized}/redemptions/${redemptionId} → PENDING`);
                transaction.update(rewardRef, {
                    totalPending: (rewardData.totalPending || 0) + 1,
                    updatedAt: getNow()
                });
                logger.debug(`[UPDATE] groups/${normalized}/rewards/${rewardId} totalPending → PENDING`);
                logger.info(`[INFO] Redemption requested but NOT processed yet (points NOT deducted)`);
                return redemptionData;
            });
            const duration = Date.now() - startTime;
            logger.info(`[TRANSACTION COMMIT] → SUCCESS (${duration}ms total)`);
            logger.info(`[INFO] Redemption created: ${result.redemptionId} for user ${userPhone}`);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[TRANSACTION ROLLBACK] → FAILED (${duration}ms)`, error);
            throw error;
        }
    }
    static async approveRedemption(groupId, redemptionId, adminPhone, adminName) {
        const startTime = Date.now();
        const db = getFirestore();
        const normalized = normalizeGroupId(groupId);
        logger.info(`[TRANSACTION START] Approve redemption ${redemptionId}`);
        try {
            const result = await db.runTransaction(async (transaction) => {
                const redemptionRef = db.collection('groups').doc(normalized).collection('redemptions').doc(redemptionId);
                const redemptionDoc = await transaction.get(redemptionRef);
                if (!redemptionDoc.exists) {
                    throw new Error('Canje no encontrado');
                }
                const redemptionData = redemptionDoc.data();
                logger.debug(`[READ] groups/${normalized}/redemptions/${redemptionId} → SUCCESS`);
                if (redemptionData.status !== 'pending') {
                    throw new Error(`Este canje ya fue procesado (estado: ${redemptionData.status})`);
                }
                const memberRef = db.collection('groups').doc(normalized).collection('members').doc(redemptionData.userPhone);
                const memberDoc = await transaction.get(memberRef);
                if (!memberDoc.exists) {
                    throw new Error('Usuario no encontrado');
                }
                const memberData = memberDoc.data();
                logger.debug(`[READ] groups/${normalized}/members/${redemptionData.userPhone} → SUCCESS`);
                logger.debug(`[INFO] User current points: ${memberData.points || 0}`);
                const userPoints = memberData.points || 0;
                const pointsCost = redemptionData.pointsCost;
                if (userPoints < pointsCost) {
                    throw new Error(`El usuario ya no tiene suficientes puntos (tiene: ${userPoints}, necesita: ${pointsCost})`);
                }
                logger.debug(`[VALIDATE] ${userPoints} >= ${pointsCost} → User still has enough points`);
                const newPoints = userPoints - pointsCost;
                transaction.update(memberRef, {
                    points: newPoints,
                    'stats.totalPointsSpent': (memberData.stats?.totalPointsSpent || 0) + pointsCost,
                    'stats.totalPointsSpentOnRewards': (memberData.stats?.totalPointsSpentOnRewards || 0) + pointsCost,
                    updatedAt: getNow()
                });
                logger.debug(`[UPDATE] User points: ${userPoints} - ${pointsCost} = ${newPoints} → PENDING`);
                transaction.update(redemptionRef, {
                    status: 'approved',
                    processedAt: getNow(),
                    processedBy: adminPhone,
                    processedByName: adminName
                });
                logger.debug(`[UPDATE] Redemption status: "approved" → PENDING`);
                const rewardRef = db.collection('groups').doc(normalized).collection('rewards').doc(redemptionData.rewardId);
                const rewardDoc = await transaction.get(rewardRef);
                if (rewardDoc.exists) {
                    const rewardData = rewardDoc.data();
                    if (rewardData.stock !== -1 && rewardData.stock <= 0) {
                        throw new Error(`Stock agotado durante la aprobación. Stock actual: ${rewardData.stock}`);
                    }
                    const updates = {
                        totalPending: Math.max((rewardData.totalPending || 0) - 1, 0),
                        totalApproved: (rewardData.totalApproved || 0) + 1,
                        updatedAt: getNow()
                    };
                    if (rewardData.stock !== -1) {
                        updates.stock = Math.max((rewardData.stock || 0) - 1, 0);
                    }
                    transaction.update(rewardRef, updates);
                    logger.debug(`[UPDATE] Reward stock and stats → PENDING`);
                }
                return {
                    success: true,
                    redemptionId,
                    userPhone: redemptionData.userPhone,
                    rewardName: redemptionData.rewardName,
                    pointsDeducted: pointsCost,
                    newPoints
                };
            });
            const duration = Date.now() - startTime;
            logger.info(`[TRANSACTION COMMIT] → SUCCESS (${duration}ms total)`);
            logger.info(`[INFO] Redemption approved, points deducted from user`);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[TRANSACTION ROLLBACK] → FAILED (${duration}ms)`, error);
            throw error;
        }
    }
    static async rejectRedemption(groupId, redemptionId, adminPhone, adminName, reason) {
        const startTime = Date.now();
        const db = getFirestore();
        const normalized = normalizeGroupId(groupId);
        logger.info(`[TRANSACTION START] Reject redemption ${redemptionId}`);
        try {
            const result = await db.runTransaction(async (transaction) => {
                const redemptionRef = db.collection('groups').doc(normalized).collection('redemptions').doc(redemptionId);
                const redemptionDoc = await transaction.get(redemptionRef);
                if (!redemptionDoc.exists) {
                    throw new Error('Canje no encontrado');
                }
                const redemptionData = redemptionDoc.data();
                logger.debug(`[READ] groups/${normalized}/redemptions/${redemptionId} → SUCCESS`);
                if (redemptionData.status !== 'pending') {
                    throw new Error(`Este canje ya fue procesado (estado: ${redemptionData.status})`);
                }
                transaction.update(redemptionRef, {
                    status: 'rejected',
                    processedAt: getNow(),
                    processedBy: adminPhone,
                    processedByName: adminName,
                    rejectionReason: reason
                });
                logger.debug(`[UPDATE] Redemption status: "rejected" → PENDING`);
                const rewardRef = db.collection('groups').doc(normalized).collection('rewards').doc(redemptionData.rewardId);
                const rewardDoc = await transaction.get(rewardRef);
                if (rewardDoc.exists) {
                    const rewardData = rewardDoc.data();
                    transaction.update(rewardRef, {
                        totalPending: Math.max((rewardData.totalPending || 0) - 1, 0),
                        updatedAt: getNow()
                    });
                }
                return {
                    success: true,
                    redemptionId,
                    userPhone: redemptionData.userPhone,
                    rewardName: redemptionData.rewardName,
                    reason
                };
            });
            const duration = Date.now() - startTime;
            logger.info(`[TRANSACTION COMMIT] → SUCCESS (${duration}ms total)`);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[TRANSACTION ROLLBACK] → FAILED (${duration}ms)`, error);
            throw error;
        }
    }
    static async markAsDelivered(groupId, redemptionId, adminPhone, deliveryNotes = '') {
        const startTime = Date.now();
        const db = getFirestore();
        const normalized = normalizeGroupId(groupId);
        logger.info(`[TRANSACTION START] Mark redemption ${redemptionId} as delivered`);
        try {
            const result = await db.runTransaction(async (transaction) => {
                const redemptionRef = db.collection('groups').doc(normalized).collection('redemptions').doc(redemptionId);
                const redemptionDoc = await transaction.get(redemptionRef);
                if (!redemptionDoc.exists) {
                    throw new Error('Canje no encontrado');
                }
                const redemptionData = redemptionDoc.data();
                logger.debug(`[READ] groups/${normalized}/redemptions/${redemptionId} → SUCCESS`);
                if (redemptionData.status !== 'approved') {
                    throw new Error(`Este canje debe estar aprobado primero (estado actual: ${redemptionData.status})`);
                }
                transaction.update(redemptionRef, {
                    status: 'delivered',
                    deliveredAt: getNow(),
                    deliveredBy: adminPhone,
                    deliveryNotes
                });
                logger.debug(`[UPDATE] Redemption status: "delivered" → PENDING`);
                const memberRef = db.collection('groups').doc(normalized).collection('members').doc(redemptionData.userPhone);
                const memberDoc = await transaction.get(memberRef);
                if (memberDoc.exists) {
                    const memberData = memberDoc.data();
                    transaction.update(memberRef, {
                        'stats.totalRewardsRedeemed': (memberData.stats?.totalRewardsRedeemed || 0) + 1,
                        updatedAt: getNow()
                    });
                }
                const rewardRef = db.collection('groups').doc(normalized).collection('rewards').doc(redemptionData.rewardId);
                const rewardDoc = await transaction.get(rewardRef);
                if (rewardDoc.exists) {
                    const rewardData = rewardDoc.data();
                    transaction.update(rewardRef, {
                        totalDelivered: (rewardData.totalDelivered || 0) + 1,
                        updatedAt: getNow()
                    });
                }
                return {
                    success: true,
                    redemptionId,
                    userPhone: redemptionData.userPhone,
                    rewardName: redemptionData.rewardName
                };
            });
            const duration = Date.now() - startTime;
            logger.info(`[TRANSACTION COMMIT] → SUCCESS (${duration}ms total)`);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[TRANSACTION ROLLBACK] → FAILED (${duration}ms)`, error);
            throw error;
        }
    }
    static async getPendingRedemptions(groupId) {
        const startTime = Date.now();
        const db = getFirestore();
        const normalized = normalizeGroupId(groupId);
        try {
            const snapshot = await db.collection('groups')
                .doc(normalized)
                .collection('redemptions')
                .where('status', '==', 'pending')
                .orderBy('requestedAt', 'desc')
                .get();
            const duration = Date.now() - startTime;
            logger.debug(`[READ] groups/${normalized}/redemptions (status==pending) → SUCCESS (${duration}ms)`);
            logger.debug(`[INFO] Found ${snapshot.size} pending redemptions`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[ERROR] Failed to get pending redemptions (${duration}ms):`, error);
            return [];
        }
    }
    static async getUserRedemptions(groupId, userPhone) {
        const startTime = Date.now();
        const db = getFirestore();
        const normalized = normalizeGroupId(groupId);
        try {
            let canonicalPhone = userPhone;
            try {
                const found = await MemberRepository.findByPhoneOrLid(groupId, userPhone, userPhone);
                if (found && found.docId) {
                    canonicalPhone = found.docId;
                }
            }
            catch (err) {
            }
            const snapshot = await db.collection('groups')
                .doc(normalized)
                .collection('redemptions')
                .where('userPhone', '==', canonicalPhone)
                .orderBy('requestedAt', 'desc')
                .get();
            const duration = Date.now() - startTime;
            logger.debug(`[READ] groups/${normalized}/redemptions (userPhone==${canonicalPhone}) → SUCCESS (${duration}ms)`);
            logger.debug(`[INFO] Found ${snapshot.size} redemptions for user`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[ERROR] Failed to get user redemptions (${duration}ms):`, error);
            return [];
        }
    }
}
export default RedemptionHandler;
