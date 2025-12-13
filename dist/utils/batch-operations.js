import { getFirestore } from '../config/firebase.js';
import logger from '../lib/logger.js';
export async function executeBatch(operations) {
    if (!operations || operations.length === 0) {
        return;
    }
    const db = getFirestore();
    const batches = [];
    let currentBatch = db.batch();
    let operationCount = 0;
    for (const operation of operations) {
        const { type, ref, data } = operation;
        switch (type) {
            case 'set':
                currentBatch.set(ref, data, operation.options || {});
                break;
            case 'update':
                currentBatch.update(ref, data);
                break;
            case 'delete':
                currentBatch.delete(ref);
                break;
            default:
                logger.warn(`Tipo de operación no soportado: ${type}`);
                continue;
        }
        operationCount++;
        if (operationCount >= 500) {
            batches.push(currentBatch);
            currentBatch = db.batch();
            operationCount = 0;
        }
    }
    if (operationCount > 0) {
        batches.push(currentBatch);
    }
    try {
        await Promise.all(batches.map(batch => batch.commit()));
        logger.info(`✅ Ejecutados ${batches.length} batches con ${operations.length} operaciones`);
    }
    catch (error) {
        logger.error('Error al ejecutar batch:', error);
        throw error;
    }
}
export async function batchUpdateMembers(groupId, updates) {
    const db = getFirestore();
    const operations = updates.map(({ phone, data }) => ({
        type: 'update',
        ref: db.collection('groups').doc(groupId).collection('members').doc(phone),
        data
    }));
    await executeBatch(operations);
}
export async function batchCreateMembers(groupId, members) {
    const db = getFirestore();
    const operations = members.map(memberData => ({
        type: 'set',
        ref: db.collection('groups').doc(groupId).collection('members').doc(memberData.phone),
        data: memberData,
        options: { merge: true }
    }));
    await executeBatch(operations);
}
export async function batchIncrementPoints(groupId, increments) {
    const { FieldValue } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const operations = increments.map(({ phone, amount }) => ({
        type: 'update',
        ref: db.collection('groups').doc(groupId).collection('members').doc(phone),
        data: {
            points: FieldValue.increment(amount),
            updatedAt: FieldValue.serverTimestamp()
        }
    }));
    await executeBatch(operations);
}
export default {
    executeBatch,
    batchUpdateMembers,
    batchCreateMembers,
    batchIncrementPoints
};
