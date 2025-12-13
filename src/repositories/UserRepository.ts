import { getFirestore } from '../config/firebase.js';
import { getNow } from '../utils/time.js';
import { normalizePhone } from '../utils/phone.js';
import { UserData } from '../types/firestore.types.js';

// const db = getFirestore();
const COLLECTION = 'users';

export class UserRepository {
  /**
   * Obtiene un usuario por teléfono
   */
  static async getByPhone(phone: string): Promise<UserData | null> {
    const db = getFirestore();
    const normalized = normalizePhone(phone);
    const doc = await db.collection(COLLECTION).doc(normalized).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as unknown as UserData : null;
  }

  /**
   * Crea o actualiza un usuario
   */
  static async save(userData: Partial<UserData>): Promise<UserData> {
    const db = getFirestore();
    const normalized = normalizePhone(userData.phone || '');
    const userRef = db.collection(COLLECTION).doc(normalized);

    const existing = await this.getByPhone(normalized);
    const updateData: any = {
      ...userData,
      phone: normalized,
      updatedAt: getNow()
    };

    if (!existing) {
      updateData.firstSeenAt = getNow();
      updateData.totalGroups = 0;
      updateData.groups = [];
    }

    updateData.lastSeenAt = getNow();

    await userRef.set(updateData, { merge: true });
    return { id: userRef.id, ...updateData } as unknown as UserData;
  }

  /**
   * Actualiza campos específicos
   */
  static async update(phone: string, updates: Partial<UserData>): Promise<void> {
    const db = getFirestore();
    const normalized = normalizePhone(phone);
    await db.collection(COLLECTION)
      .doc(normalized)
      .update({
        ...updates,
        updatedAt: getNow(),
        lastSeenAt: getNow()
      });
  }

  /**
   * Agrega un grupo a la lista de grupos del usuario
   */
  static async addGroup(phone, groupId) {
    const normalized = normalizePhone(phone);
    const user = await this.getByPhone(normalized);

    if (!user) {
      await this.save({ phone: normalized, groups: [groupId] });
      return;
    }

    const groups = user.groups || [];
    if (!groups.includes(groupId)) {
      groups.push(groupId);
      await this.update(normalized, {
        groups,
        totalGroups: groups.length
      });
    }
  }

  /**
   * Obtiene todos los usuarios
   */
  static async getAll(limit = 100) {
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTION)
      .limit(limit)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
}

export default UserRepository;
