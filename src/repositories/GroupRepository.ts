import { getFirestore } from '../config/firebase.js';
import { getNow } from '../utils/time.js';
import { normalizeGroupId } from '../utils/phone.js';
import logger from '../lib/logger.js';
import { GroupData, GroupConfig } from '../types/firestore.types.js';

// const db = getFirestore();
const COLLECTION = 'groups';

export class GroupRepository {
  /**
   * Obtiene un grupo por ID
   * SPEC: Sin caché, consulta directa a Firestore (Regla #1)
   */
  static async getById(groupId): Promise<GroupData | null> {
    const startTime = Date.now();
    const db = getFirestore();
    // Normalizar groupId para búsqueda consistente
    const normalized = normalizeGroupId(groupId);
    
    try {
      const doc = await db.collection(COLLECTION).doc(normalized).get();
      const duration = Date.now() - startTime;
      
      if (doc.exists) {
        logger.debug(`[${new Date().toISOString()}] [READ] groups/${normalized} → SUCCESS (${duration}ms)`);
        return doc.data() as GroupData;
      } else {
        logger.debug(`[${new Date().toISOString()}] [READ] groups/${normalized} → NOT FOUND (${duration}ms)`);
        return null;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${new Date().toISOString()}] [ERROR] groups/${normalized} → FAILED (${duration}ms)`, error);
      throw error;
    }
  }

  /**
   * Guarda o actualiza un grupo
   */
  static async save(groupData): Promise<GroupData> {
    const db = getFirestore();
    // CRÍTICO: Normalizar ID antes de guardar
    const normalized = normalizeGroupId(groupData.id);
    const groupRef = db.collection(COLLECTION).doc(normalized);
    const dataToSave = {
      ...groupData,
      id: normalized, // Asegurar que el ID guardado sea normalizado
      updatedAt: getNow()
    };
    await groupRef.set(dataToSave, { merge: true });
    return dataToSave as GroupData;
  }

  /**
   * Actualiza un grupo parcialmente
   */
  static async update(groupId, data): Promise<void> {
    const db = getFirestore();
    // Normalizar groupId
    const normalized = normalizeGroupId(groupId);
    const groupRef = db.collection(COLLECTION).doc(normalized);
    await groupRef.set({
      ...data,
      updatedAt: getNow()
    }, { merge: true }); // Usar set+merge en vez de update para evitar errores si no existe
  }

  /**
   * Obtiene todos los grupos
   */
  static async getAll(): Promise<GroupData[]> {
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTION).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GroupData));
  }

  /**
   * Obtiene grupos activos
   */
  static async getActive(): Promise<GroupData[]> {
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTION)
      .where('isActive', '==', true)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GroupData));
  }

  /**
   * Actualiza configuración del grupo (inline en el documento)
   * SPEC: Sin caché (Regla #1)
   */
  static async updateConfig(groupId, config): Promise<void> {
    const startTime = Date.now();
    const db = getFirestore();
    const normalized = normalizeGroupId(groupId);
    const groupRef = db.collection(COLLECTION).doc(normalized);

    try {
      await groupRef.set({
        config,
        updatedAt: getNow()
      }, { merge: true });
      
      const duration = Date.now() - startTime;
      logger.debug(`[${new Date().toISOString()}] [UPDATE] groups/${normalized}/config → SUCCESS (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${new Date().toISOString()}] [ERROR] groups/${normalized}/config → FAILED (${duration}ms)`, error);
      throw error;
    }
  }

  /**
   * Obtiene configuración del grupo (inline en el documento)
   * SPEC: Sin caché, consulta directa (Regla #1)
   */
  static async getConfig(groupId): Promise<GroupConfig | null> {
    const startTime = Date.now();
    const normalized = normalizeGroupId(groupId);
    const db = getFirestore();
    
    try {
      const groupRef = db.collection(COLLECTION).doc(normalized);
      const doc = await groupRef.get();
      
      const duration = Date.now() - startTime;
      
      if (!doc.exists) {
        logger.debug(`[${new Date().toISOString()}] [READ] groups/${normalized}/config → NOT FOUND (${duration}ms)`);
        return null;
      }
      
      const config = doc.data()?.config || null;
      logger.debug(`[${new Date().toISOString()}] [READ] groups/${normalized}/config → SUCCESS (${duration}ms)`);
      return config as GroupConfig;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${new Date().toISOString()}] [ERROR] groups/${normalized}/config → FAILED (${duration}ms)`, error);
      throw error;
    }
  }
}

export default GroupRepository;
