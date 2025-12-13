import { getFirestore } from '../config/firebase.js';
import { getNow } from '../utils/time.js';
import { RequestData } from '../types/firestore.types.js';

// const db = getFirestore();
const COLLECTION = 'requests';

export class RequestRepository {
  /**
   * Crea una solicitud
   */
  static async create(requestData): Promise<RequestData> {
    const db = getFirestore();
    const requestRef = db.collection(COLLECTION).doc();
    const newRequest = {
      ...requestData,
      status: 'pending',
      requestedAt: getNow(),
      createdAt: getNow()
    };
    await requestRef.set(newRequest);
    return { id: requestRef.id, ...newRequest } as RequestData;
  }

  /**
   * Obtiene una solicitud por ID
   */
  static async getById(requestId): Promise<RequestData | null> {
    const db = getFirestore();
    const doc = await db.collection(COLLECTION).doc(requestId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as RequestData : null;
  }

  /**
   * Obtiene solicitudes por estado
   */
  static async getByStatus(status, limit = 50): Promise<RequestData[]> {
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTION)
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RequestData));
  }

  /**
   * Obtiene solicitudes de un usuario (por teléfono)
   */
  static async getByUser(phone, limit = 50): Promise<RequestData[]> {
    const db = getFirestore();
    // Normalizar si es necesario
    const normalized = phone.replace('@s.whatsapp.net', '');
    const snapshot = await db.collection(COLLECTION)
      .where('phone', '==', normalized)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RequestData));
  }

  /**
   * Obtiene solicitudes de un grupo
   */
  static async getByGroup(groupId, limit = 50): Promise<RequestData[]> {
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTION)
      .where('groupId', '==', groupId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RequestData));
  }

  /**
   * Actualiza una solicitud
   */
  static async update(requestId, data) {
    const db = getFirestore();
    const requestRef = db.collection(COLLECTION).doc(requestId);
    await requestRef.update({
      ...data,
      updatedAt: getNow()
    });
  }

  /**
   * Aprueba una solicitud
   */
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

  /**
   * Marca como entregada
   */
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

  /**
   * Rechaza una solicitud
   */
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
