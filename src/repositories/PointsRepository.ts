import { getFirestore } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getNow } from '../utils/time.js';

import { normalizeGroupId } from '../utils/phone.js';

// const db = getFirestore();
const COLLECTION = 'groups';

export class PointsRepository {
  /**
   * Incrementa puntos de un miembro
   */
  static async addPoints(groupId, phone, amount = 1) {
    const db = getFirestore();
    const normalizedGroupId = normalizeGroupId(groupId);
    const memberRef = db.collection(COLLECTION)
      .doc(normalizedGroupId)
      .collection('members')
      .doc(phone);

    // Si amount es positivo, actualizar totalPointsEarned
    const updates = {
      points: FieldValue.increment(amount),
      updatedAt: getNow()
    };

    if (amount > 0) {
      updates['stats.totalPointsEarned'] = FieldValue.increment(amount);
    } else if (amount < 0) {
      updates['stats.totalPointsSpent'] = FieldValue.increment(Math.abs(amount));
    }

    await memberRef.update(updates);
  }

  /**
   * Establece puntos de un miembro
   */
  static async setPoints(groupId, phone, points) {
    const db = getFirestore();
    const normalizedGroupId = normalizeGroupId(groupId);
    const memberRef = db.collection(COLLECTION)
      .doc(normalizedGroupId)
      .collection('members')
      .doc(phone);

    await memberRef.update({
      points: points,
      'stats.totalPointsEarned': points,
      updatedAt: getNow()
    });
  }

  /**
   * Resetea puntos de un miembro
   */
  static async resetPoints(groupId, phone) {
    await this.setPoints(groupId, phone, 0);
  }

  /**
   * Incrementa contador de mensajes para puntos
   */
  static async incrementMessageCounter(groupId, phone) {
    const db = getFirestore();
    const memberRef = db.collection(COLLECTION)
      .doc(groupId)
      .collection('members')
      .doc(phone);

    await memberRef.update({
      messagesForNextPoint: FieldValue.increment(1),
      updatedAt: getNow()
    });
  }

  /**
   * Resetea contador de mensajes para puntos
   */
  static async resetMessageCounter(groupId, phone) {
    const db = getFirestore();
    const memberRef = db.collection(COLLECTION)
      .doc(groupId)
      .collection('members')
      .doc(phone);

    await memberRef.update({
      messagesForNextPoint: 0,
      updatedAt: getNow()
    });
  }

  /**
   * Incrementa el contador total de mensajes enviados
   */
  static async incrementMessageCount(groupId, phone) {
    const db = getFirestore();
    const memberRef = db.collection(COLLECTION)
      .doc(groupId)
      .collection('members')
      .doc(phone);

    await memberRef.update({
      messageCount: FieldValue.increment(1),
      updatedAt: getNow()
    });
  }
}

export default PointsRepository;
