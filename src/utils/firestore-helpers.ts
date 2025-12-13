import { getFirestore } from '../config/firebase.js';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Convierte un objeto a formato Firestore
 * @param {object} data - Datos a convertir
 * @returns {object} - Datos convertidos
 */
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
    } else if (value === null) {
      result[key] = null;
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      result[key] = toFirestore(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Convierte datos de Firestore a formato JavaScript
 * @param {object} data - Datos de Firestore
 * @returns {object} - Datos convertidos
 */
export function fromFirestore(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const result = {};

  for (const [key, value] of Object.entries(data)) {
    if (value && typeof (value as any).toDate === 'function') {
      result[key] = (value as any).toDate();
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = fromFirestore(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Crea un timestamp de Firestore
 * @returns {Timestamp}
 */
export function createTimestamp() {
  return Timestamp.now();
}

/**
 * Crea un timestamp desde una fecha
 * @param {Date} date - Fecha
 * @returns {Timestamp}
 */
export function timestampFromDate(date) {
  return Timestamp.fromDate(date);
}

/**
 * Obtiene una referencia a una colección
 * @param {string} collectionPath - Ruta de la colección
 * @returns {CollectionReference}
 */
export function getCollection(collectionPath) {
  const db = getFirestore();
  return db.collection(collectionPath);
}

/**
 * Obtiene una referencia a un documento
 * @param {string} collectionPath - Ruta de la colección
 * @param {string} docId - ID del documento
 * @returns {DocumentReference}
 */
export function getDocument(collectionPath, docId) {
  const db = getFirestore();
  return db.collection(collectionPath).doc(docId);
}

/**
 * Batch helper para operaciones múltiples
 * @returns {WriteBatch}
 */
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

