import { getFirestore } from '../config/firebase.js';
import { getNow } from '../utils/time.js';
import logger from '../lib/logger.js';

// const db = getFirestore();
const COLLECTION = 'bot_config'; // SPEC: Cambiar a bot_config (Section 3.8)

export class ConfigRepository {
  /**
   * Obtiene configuración global
   * SPEC: Sin caché, consulta directa (Regla #1)
   * SPEC: Documento en bot_config/settings (Section 3.8)
   */
  static async getGlobal() {
    const startTime = Date.now();
    const db = getFirestore();
    
    try {
      const doc = await db.collection(COLLECTION).doc('settings').get();
      const duration = Date.now() - startTime;
      
      let result = doc.exists ? doc.data() : null;

      // DEFAULTS: Asegurar que siempre tenga valores válidos
      if (!result) {
        result = {};
      }

      if (!result.points) {
        result.points = {};
      }

      // Valores por defecto para puntos
      if (!result.points.name) result.points.name = 'puntos';
      if (!result.points.perMessages) result.points.perMessages = 10;
      if (result.points.enabled === undefined) result.points.enabled = true;

      logger.debug(`[${new Date().toISOString()}] [READ] bot_config/settings → ${doc.exists ? 'SUCCESS' : 'NOT FOUND'} (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${new Date().toISOString()}] [ERROR] bot_config/settings → FAILED (${duration}ms)`, error);
      throw error;
    }
  }

  /**
   * Guarda configuración global
   * SPEC: Sin caché (Regla #1)
   */
  static async saveGlobal(config) {
    const startTime = Date.now();
    const db = getFirestore();
    
    try {
      await db.collection(COLLECTION)
        .doc('settings')
        .set({
          ...config,
          updatedAt: getNow()
        }, { merge: true });

      const duration = Date.now() - startTime;
      logger.debug(`[${new Date().toISOString()}] [UPDATE] bot_config/settings → SUCCESS (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${new Date().toISOString()}] [ERROR] bot_config/settings → FAILED (${duration}ms)`, error);
      throw error;
    }
  }

  /**
   * Actualiza configuración global
   * SPEC: Sin caché (Regla #1)
   */
  static async updateGlobal(updates) {
    const startTime = Date.now();
    const db = getFirestore();
    
    try {
      await db.collection(COLLECTION)
        .doc('settings')
        .update({
          ...updates,
          updatedAt: getNow()
        });

      const duration = Date.now() - startTime;
      logger.debug(`[${new Date().toISOString()}] [UPDATE] bot_config/settings → SUCCESS (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${new Date().toISOString()}] [ERROR] bot_config/settings → FAILED (${duration}ms)`, error);
      throw error;
    }
  }
}

export default ConfigRepository;
