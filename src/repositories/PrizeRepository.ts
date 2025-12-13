import { getFirestore } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getNow } from '../utils/time.js';
import { PrizeData } from '../types/firestore.types.js';

// const db = getFirestore();
const COLLECTION = 'groups';

export class PrizeRepository {
  static async getByCode(groupId, code): Promise<PrizeData | null> {
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTION)
      .doc(groupId)
      .collection('prizes')
      .where('code', '==', code)
      .get();

    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as PrizeData;
  }

  static async getById(groupId, prizeId): Promise<PrizeData | null> {
    const db = getFirestore();
    const doc = await db.collection(COLLECTION)
      .doc(groupId)
      .collection('prizes')
      .doc(prizeId)
      .get();

    return doc.exists ? { id: doc.id, ...doc.data() } as PrizeData : null;
  }

  static async save(groupId, prizeData): Promise<PrizeData> {
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

    return newPrize as PrizeData;
  }

  static async getActive(groupId): Promise<PrizeData[]> {
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTION)
      .doc(groupId)
      .collection('prizes')
      .where('isActive', '==', true)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PrizeData));
  }

  static async getAll(groupId): Promise<PrizeData[]> {
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTION)
      .doc(groupId)
      .collection('prizes')
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PrizeData));
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
