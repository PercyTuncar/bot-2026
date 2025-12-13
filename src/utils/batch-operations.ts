import { getFirestore } from '../config/firebase.js';
import logger from '../lib/logger.js';

/**
 * Utilidad para operaciones en lote (batch) en Firestore
 * Reduce el número de escrituras al agrupar múltiples operaciones
 */

// const db = getFirestore();

/**
 * Ejecuta operaciones en batch
 * Firestore permite máximo 500 operaciones por batch
 */
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

    // Si alcanzamos el límite de 500, crear nuevo batch
    if (operationCount >= 500) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      operationCount = 0;
    }
  }

  // Agregar el último batch si tiene operaciones
  if (operationCount > 0) {
    batches.push(currentBatch);
  }

  // Ejecutar todos los batches
  try {
    await Promise.all(batches.map(batch => batch.commit()));
    logger.info(`✅ Ejecutados ${batches.length} batches con ${operations.length} operaciones`);
  } catch (error) {
    logger.error('Error al ejecutar batch:', error);
    throw error;
  }
}

/**
 * Actualiza múltiples miembros en batch
 */
export async function batchUpdateMembers(groupId, updates) {
  const db = getFirestore();
  const operations = updates.map(({ phone, data }) => ({
    type: 'update',
    ref: db.collection('groups').doc(groupId).collection('members').doc(phone),
    data
  }));

  await executeBatch(operations);
}

/**
 * Crea múltiples miembros en batch
 */
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

/**
 * Incrementa puntos de múltiples usuarios en batch
 */
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
