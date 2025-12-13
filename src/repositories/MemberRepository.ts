import { getFirestore } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getNow } from '../utils/time.js';
import { normalizePhone, normalizeGroupId } from '../utils/phone.js';
import logger from '../lib/logger.js';
import { MemberData, FindMemberResult } from '../types/firestore.types.js';

// const db = getFirestore();
const COLLECTION = 'groups';

export class MemberRepository {
  /**
   * Valida si un número es válido para ser miembro
   * @param {string} phone - Número de teléfono o LID
   * @param {string} groupId - ID del grupo (para evitar agregar al grupo como miembro)
   * @returns {boolean} - true si es válido
   */
  static isValidPhone(phone, groupId) {
    if (!phone) return false;
    
    // LIDs son válidos: 91401836589109@lid
    if (phone.includes('@lid')) return true;
    
    // SOLO validar phone === groupId si NO es LID (números puros)
    // LID NUNCA será igual a groupId, así que solo comparar números
    if (groupId && phone === groupId.replace('@g.us', '')) return false;

    // Rechazar emails y otros formatos inválidos
    if (phone.includes('@') && !phone.includes('@lid')) return false;
    if (phone.includes(':')) return false;

    // Debe ser solo números (después de normalizar)
    if (!/^\d+$/.test(phone)) return false;

    return true;
  }

  /**
   * Busca un miembro por phone O lid (unificación de identidad)
   * CRITICAL: Evita duplicación al buscar por ambos identificadores
   */
  static async findByPhoneOrLid(groupId, phone, lid = null): Promise<FindMemberResult | null> {
    const startTime = Date.now();
    const normalized = normalizeGroupId(groupId);
    const db = getFirestore();
    
    // Estrategia: Buscar primero por phone (más común), luego por lid
    // Si encontramos por cualquiera, retornamos ese member
    
    if (phone) {
      const memberByPhone = await this.getByPhone(groupId, phone);
      if (memberByPhone) {
        logger.debug(`Member found by phone: ${phone}`);
        return { data: memberByPhone, foundBy: 'phone', docId: phone };
      }
    }
    
    if (lid) {
      // Normalizar LID: agregar @lid si no lo tiene
      const lidWithSuffix = lid.includes('@lid') ? lid : `${lid}@lid`;
      const lidWithoutSuffix = lid.replace('@lid', '');
      
      // Buscar con ambas variantes del LID
      const membersRef = db.collection(COLLECTION)
        .doc(normalized)
        .collection('members');
      
      // Intentar con @lid primero
      let snapshot = await membersRef.where('lid', '==', lidWithSuffix).limit(1).get();
      
      // Si no encuentra, intentar sin @lid
      if (snapshot.empty) {
        snapshot = await membersRef.where('lid', '==', lidWithoutSuffix).limit(1).get();
      }
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        logger.debug(`Member found by lid: ${lid} (docId: ${doc.id})`);
        return { data: doc.data() as MemberData, foundBy: 'lid', docId: doc.id };
      }
    }
    
    const duration = Date.now() - startTime;
    logger.debug(`[${new Date().toISOString()}] [SEARCH] Member not found by phone=${phone} or lid=${lid} (${duration}ms)`);
    return null;
  }

  /**
   * Obtiene un miembro
   */
  static async getByPhone(groupId, phone): Promise<MemberData | null> {
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
    return doc.exists ? doc.data() as MemberData : null;
  }

  /**
   * Guarda o actualiza un miembro con unificación de identidad
   * @param {string} groupId - ID del grupo
   * @param {object} memberData - Datos del miembro (debe incluir phone, puede incluir lid)
   * @returns {object} - Member guardado con su docId
   */
  static async save(groupId, memberData): Promise<MemberData> {
    const startTime = Date.now();
    const normalized = normalizeGroupId(groupId);
    const db = getFirestore();
    
    // Extraer phone y lid
    const phone = memberData.phone;
    const lid = memberData.lid || null;
    
    // Usar phone como docId (nunca LID como docId para evitar problemas)
    // Si solo tenemos LID, extraer número como docId
    let docId = phone;
    if (!docId && lid) {
      // Extraer números del LID como docId temporal
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
      phone: docId, // Asegurar que phone sea el docId
      lid: lid || null, // Guardar LID si existe
      updatedAt: getNow()
    };

    await memberRef.set(dataToSave, { merge: true });

    logger.info(`[${new Date().toISOString()}] [WRITE] groups/${normalized}/members/${docId} (lid=${lid || 'null'}) → SUCCESS (${Date.now() - startTime}ms)`);
    return dataToSave as MemberData;
  }

  /**
   * Actualiza datos parciales
   */
  static async update(groupId, phone, data): Promise<void> {
    const startTime = Date.now();
    const normalized = normalizeGroupId(groupId);
    const db = getFirestore();
    const memberRef = db.collection(COLLECTION)
      .doc(normalized)
      .collection('members')
      .doc(phone);

    // Use set with merge: true to effectively "upsert" or prevent crash on missing doc
    // However, if we want strict update behavior, we catch the error.
    // Given the requirement to be robust, we will switch to set({ ... }, { merge: true })
    // BUT, we need to be careful not to overwrite existing data incorrectly.
    // Since 'data' is partial, merge: true is perfect.

    await memberRef.set({
      ...data,
      updatedAt: getNow()
    }, { merge: true });
    
    logger.info(`[${new Date().toISOString()}] [UPDATE] groups/${normalized}/members/${phone} → SUCCESS (${Date.now() - startTime}ms)`);
  }

  static async mergeMemberDocs(groupId: string, phone: string, lid?: string) {
    const db = getFirestore();
    const normalized = normalizeGroupId(groupId);
    const membersRef = db.collection(COLLECTION).doc(normalized).collection('members');
    const phoneId = phone.includes('@') ? phone.split('@')[0] : phone;
    const lidWithSuffix = lid ? (lid.includes('@lid') ? lid : `${lid}@lid`) : null;
    let phoneDoc = await membersRef.doc(phoneId).get();
    let lidDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    if (lidWithSuffix) {
      const snap = await membersRef.where('lid', '==', lidWithSuffix).limit(1).get();
      lidDoc = snap.empty ? null : snap.docs[0];
    }
    const phoneData = phoneDoc.exists ? (phoneDoc.data() as MemberData) : null;
    const lidData = lidDoc && lidDoc.exists ? (lidDoc.data() as MemberData) : null;
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
      } catch {}
    }
    return merged as MemberData;
  }

  /**
   * Actualiza la actividad del miembro (lastActiveAt, lastMessageAt y messageCount)
   */
  static async updateActivity(groupId, phone) {
    const db = getFirestore();
    const normalized = normalizeGroupId(groupId);
    
    // Si phone tiene @lid, extraer solo el número
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
    } catch (err) {
      // Si el documento no existe, update fallará. Intentar con set merge
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
      } catch (setErr) {
        logger.error(`[updateActivity] set merge also failed for ${cleanPhone}: ${setErr.message}`);
      }
    }
  }

  /**
   * Obtiene miembros activos
   */
  static async getActiveMembers(groupId): Promise<MemberData[]> {
    const startTime = Date.now();
    const normalized = normalizeGroupId(groupId);
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTION)
      .doc(normalized)
      .collection('members')
      .where('isMember', '==', true)
      .get();

    logger.info(`[${new Date().toISOString()}] [READ] groups/${normalized}/members (where isMember==true) → ${snapshot.size} docs (${Date.now() - startTime}ms)`);
    return snapshot.docs.map(doc => doc.data() as MemberData);
  }

  /**
   * Obtiene miembros ordenados por puntos (Top)
   */
  static async getByPoints(groupId, limit = 10): Promise<MemberData[]> {
    const startTime = Date.now();
    const normalized = normalizeGroupId(groupId);
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTION)
      .doc(normalized)
      .collection('members')
      .orderBy('points', 'desc')
      .limit(limit)
      .get();

    // Si orderBy falla por falta de índice compuesto, hacemos sort en memoria (fallback)
    // Pero Firestore en modo test o emulador suele permitirlo.
    // En código real se necesita índice 'members: points DESC'

    logger.info(`[${new Date().toISOString()}] [READ] groups/${normalized}/members (orderBy points desc, limit ${limit}) → ${snapshot.size} docs (${Date.now() - startTime}ms)`);
    return snapshot.docs.map(doc => doc.data() as MemberData);
  }

  /**
   * Obtiene la posición en el ranking de puntos
   */
  static async getRankPosition(groupId, phone): Promise<number> {
    const startTime = Date.now();
    // Note: Firestore doesn't support rank directly, we count users with more points
    // This is expensive for large collections!
    const normalized = normalizeGroupId(groupId);
    const db = getFirestore();
    const member = await this.getByPhone(normalized, phone);
    if (!member) return 0;

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
  /**
   * Busca miembro por nombre (case insensitive partial match)
   */
  static async searchByName(groupId, nameQuery): Promise<MemberData | null> {
    if (!nameQuery || nameQuery.length < 3) return null;
    const normalized = normalizeGroupId(groupId);
    const db = getFirestore();
    const q = nameQuery.toLowerCase();

    // Firestore lacks substring search, so we fetch all members and filter in memory.
    // For small groups (hundreds) this is fine. For thousands, it's slow but acceptable for admin command.
    const activeMembers = await this.getActiveMembers(normalized);

    const found = activeMembers.find(m => {
      const dName = (m.displayName || '').toLowerCase();
      // Check exact match first, then includes
      if (dName === q) return true;

      // Remove @s.whatsapp.net if present to check phone match too
      const phone = m.phone || '';
      if (phone.includes(q)) return true;

      return dName.includes(q);
    });

    return found || null;
  }
}

export default MemberRepository;
