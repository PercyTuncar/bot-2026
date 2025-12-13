import { getFirestore } from '../config/firebase.js';
import { getNow } from '../utils/time.js';
import { normalizeGroupId } from '../utils/phone.js';
import logger from '../lib/logger.js';

/**
 * Handler para comandos premium
 * Gestiona la compra y uso de comandos premium
 */
export class PremiumHandler {
  /**
   * Verifica si un usuario tiene un comando premium comprado
   * @param {string} groupId - ID del grupo
   * @param {string} userPhone - Teléfono del usuario
   * @param {string} commandName - Nombre del comando
   * @returns {Promise<boolean>} - true si lo tiene comprado
   */
  static async userHasCommand(groupId, userPhone, commandName) {
    const startTime = Date.now();
    const db = getFirestore();
    const normalized = normalizeGroupId(groupId);
    
    try {
      logger.debug(`[CHECK PREMIUM] Verificando si ${userPhone} tiene "${commandName}" en ${normalized}`);
      
      const memberRef = db.collection('groups')
        .doc(normalized)
        .collection('members')
        .doc(userPhone);
      
      const memberDoc = await memberRef.get();
      const duration = Date.now() - startTime;
      
      if (!memberDoc.exists) {
        logger.debug(`[READ] groups/${normalized}/members/${userPhone} → NOT FOUND (${duration}ms)`);
        return false;
      }
      
      logger.debug(`[READ] groups/${normalized}/members/${userPhone} → SUCCESS (${duration}ms)`);
      
      const memberData = memberDoc.data();
      const premiumCommands = memberData.premiumCommands || [];
      
      const hasCommand = premiumCommands.some(cmd => cmd.commandName === commandName);
      logger.debug(`[CHECK PREMIUM] Usuario ${hasCommand ? 'TIENE' : 'NO TIENE'} el comando "${commandName}"`);
      
      return hasCommand;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[ERROR] Failed to check premium command (${duration}ms):`, error);
      return false;
    }
  }

  /**
   * Compra un comando premium para un usuario
   * @param {string} groupId - ID del grupo
   * @param {string} userPhone - Teléfono del usuario
   * @param {string} userName - Nombre del usuario
   * @param {string} commandName - Nombre del comando
   * @returns {Promise<Object>} - Resultado de la compra
   */
  static async purchaseCommand(groupId, userPhone, userName, commandName) {
    const startTime = Date.now();
    const db = getFirestore();
    const normalized = normalizeGroupId(groupId);
    
    logger.info(`[TRANSACTION START] Purchase premium command "${commandName}" for user ${userPhone}`);
    
    try {
      const result = await db.runTransaction(async (transaction) => {
        // 1. Leer datos del miembro
        const memberRef = db.collection('groups').doc(normalized).collection('members').doc(userPhone);
        const memberDoc = await transaction.get(memberRef);
        
        if (!memberDoc.exists) {
          throw new Error('Usuario no encontrado');
        }
        
        const memberData = memberDoc.data();
        logger.debug(`[READ] groups/${normalized}/members/${userPhone} → SUCCESS`);
        logger.debug(`[VALIDATE] User current points: ${memberData.points || 0}`);
        
        // 2. Leer datos del comando premium
        const commandRef = db.collection('groups').doc(normalized).collection('premium_commands').doc(commandName);
        const commandDoc = await transaction.get(commandRef);
        
        if (!commandDoc.exists) {
          throw new Error('Comando premium no encontrado');
        }
        
        const commandData = commandDoc.data();
        logger.debug(`[READ] groups/${normalized}/premium_commands/${commandName} → SUCCESS`);
        logger.debug(`[INFO] Command price: ${commandData.price}, available: ${commandData.isAvailable}`);
        
        // 3. Validaciones
        if (!commandData.isAvailable) {
          throw new Error('Este comando no está disponible actualmente');
        }
        
        const userPoints = memberData.points || 0;
        const commandPrice = commandData.price || 0;
        
        if (userPoints < commandPrice) {
          throw new Error(`Puntos insuficientes. Necesitas: ${commandPrice}, Tienes: ${userPoints}`);
        }
        
        // Verificar si ya lo tiene
        const premiumCommands = memberData.premiumCommands || [];
        if (premiumCommands.some(cmd => cmd.commandName === commandName)) {
          throw new Error('Ya has comprado este comando');
        }
        
        logger.debug(`[VALIDATE] ${userPoints} >= ${commandPrice} → VALID`);
        logger.debug(`[VALIDATE] User already owns command? → ${premiumCommands.length > 0 ? 'Checking...' : 'NO'}`);
        
        // 4. Actualizar puntos del usuario
        const newPoints = userPoints - commandPrice;
        const newPremiumCommand = {
          commandName,
          purchasedAt: getNow(),
          timesUsed: 0,
          lastUsedAt: null
        };
        
        const updatedPremiumCommands = [...premiumCommands, newPremiumCommand];
        
        transaction.update(memberRef, {
          points: newPoints,
          premiumCommands: updatedPremiumCommands,
          'stats.totalPointsSpent': (memberData.stats?.totalPointsSpent || 0) + commandPrice,
          'stats.totalPointsSpentOnCommands': (memberData.stats?.totalPointsSpentOnCommands || 0) + commandPrice,
          'stats.totalPremiumCommandsPurchased': (memberData.stats?.totalPremiumCommandsPurchased || 0) + 1,
          updatedAt: getNow()
        });
        
        logger.debug(`[UPDATE] Deduct points: ${userPoints} - ${commandPrice} = ${newPoints} → PENDING`);
        logger.debug(`[UPDATE] Add command to user profile → PENDING`);
        
        // 5. Actualizar estadísticas del comando
        transaction.update(commandRef, {
          totalPurchases: (commandData.totalPurchases || 0) + 1,
          uniqueBuyers: (commandData.uniqueBuyers || 0) + 1,
          updatedAt: getNow()
        });
        
        logger.debug(`[UPDATE] groups/${normalized}/premium_commands/${commandName} stats → PENDING`);
        
        // 6. Crear registro en colección global
        const purchaseId = `purchase_${Date.now()}_${userPhone}`;
        const purchaseRef = db.collection('premium_commands_purchases').doc(purchaseId);
        
        transaction.set(purchaseRef, {
          purchaseId,
          groupId: normalized,
          groupName: memberData.groupName || 'Unknown',
          userPhone,
          userName,
          commandName,
          commandDisplayName: commandData.displayName || commandName,
          pointsCost: commandPrice,
          purchasedAt: getNow(),
          isActive: true,
          timesUsed: 0,
          lastUsedAt: null
        });
        
        logger.debug(`[CREATE] premium_commands_purchases/${purchaseId} → PENDING`);
        
        // 7. Actualizar estadísticas del grupo
        const groupRef = db.collection('groups').doc(normalized);
        transaction.update(groupRef, {
          totalPremiumCommandsPurchased: (memberData.groupTotalPremium || 0) + 1,
          updatedAt: getNow()
        });
        
        logger.debug(`[UPDATE] groups/${normalized} totalPremiumCommandsPurchased → PENDING`);
        
        return {
          success: true,
          commandName,
          commandDisplayName: commandData.displayName || commandName,
          pointsSpent: commandPrice,
          pointsRemaining: newPoints,
          purchaseId
        };
      });
      
      const duration = Date.now() - startTime;
      logger.info(`[TRANSACTION COMMIT] → SUCCESS (${duration}ms total)`);
      logger.info(`[INFO] User ${userPhone} purchased "${commandName}" for ${result.pointsSpent} points`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[TRANSACTION ROLLBACK] → FAILED (${duration}ms)`, error);
      throw error;
    }
  }

  /**
   * Registra el uso de un comando premium
   * @param {string} groupId - ID del grupo
   * @param {string} userPhone - Teléfono del usuario
   * @param {string} commandName - Nombre del comando
   */
  static async recordCommandUsage(groupId, userPhone, commandName) {
    const startTime = Date.now();
    const db = getFirestore();
    const normalized = normalizeGroupId(groupId);
    
    try {
      logger.debug(`[UPDATE] Recording usage of "${commandName}" by ${userPhone}`);
      
      const memberRef = db.collection('groups')
        .doc(normalized)
        .collection('members')
        .doc(userPhone);
      
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) {
        logger.warn(`[WARN] User ${userPhone} not found, cannot record usage`);
        return;
      }
      
      const memberData = memberDoc.data();
      const premiumCommands = memberData.premiumCommands || [];
      
      // Encontrar el comando y actualizar
      const updatedCommands = premiumCommands.map(cmd => {
        if (cmd.commandName === commandName) {
          return {
            ...cmd,
            timesUsed: (cmd.timesUsed || 0) + 1,
            lastUsedAt: getNow()
          };
        }
        return cmd;
      });
      
      await memberRef.update({
        premiumCommands: updatedCommands,
        'stats.totalCommandsExecuted': (memberData.stats?.totalCommandsExecuted || 0) + 1,
        'stats.totalPremiumCommandsUsed': (memberData.stats?.totalPremiumCommandsUsed || 0) + 1,
        updatedAt: getNow()
      });
      
      const duration = Date.now() - startTime;
      logger.debug(`[UPDATE] groups/${normalized}/members/${userPhone} → SUCCESS (${duration}ms)`);
      logger.info(`[INFO] Recorded usage of "${commandName}" by ${userPhone}`);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[ERROR] Failed to record command usage (${duration}ms):`, error);
    }
  }

  /**
   * Obtiene los comandos premium de un usuario
   * @param {string} groupId - ID del grupo
   * @param {string} userPhone - Teléfono del usuario
   * @returns {Promise<Array>} - Lista de comandos premium
   */
  static async getUserPremiumCommands(groupId, userPhone) {
    const startTime = Date.now();
    const db = getFirestore();
    const normalized = normalizeGroupId(groupId);
    
    try {
      const memberRef = db.collection('groups')
        .doc(normalized)
        .collection('members')
        .doc(userPhone);
      
      const memberDoc = await memberRef.get();
      const duration = Date.now() - startTime;
      
      if (!memberDoc.exists) {
        logger.debug(`[READ] groups/${normalized}/members/${userPhone} → NOT FOUND (${duration}ms)`);
        return [];
      }
      
      logger.debug(`[READ] groups/${normalized}/members/${userPhone} → SUCCESS (${duration}ms)`);
      
      const memberData = memberDoc.data();
      return memberData.premiumCommands || [];
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[ERROR] Failed to get user premium commands (${duration}ms):`, error);
      return [];
    }
  }

  /**
   * Actualiza un campo de un comando premium
   * @param {string} groupId - ID del grupo
   * @param {string} commandId - ID del comando
   * @param {string} field - Campo a actualizar
   * @param {any} value - Nuevo valor
   * @returns {Promise<Object>} - Resultado de la actualización
   */
  static async updateCommand(groupId, commandId, field, value) {
    const startTime = Date.now();
    const db = getFirestore();
    const normalized = normalizeGroupId(groupId);

    try {
      const commandRef = db.collection('groups')
        .doc(normalized)
        .collection('premium_commands')
        .doc(commandId);

      const commandDoc = await commandRef.get();
      
      if (!commandDoc.exists) {
        return { success: false, message: 'Comando premium no encontrado' };
      }

      // Convertir valor si es numérico
      let parsedValue = value;
      if (field === 'price') {
        parsedValue = parseInt(value);
        if (isNaN(parsedValue) || parsedValue < 0) {
          return { success: false, message: 'El precio debe ser un número positivo' };
        }
      }

      await commandRef.update({
        [field]: parsedValue,
        updatedAt: getNow()
      });

      const duration = Date.now() - startTime;
      logger.info(`[${new Date().toISOString()}] [UPDATE] groups/${normalized}/premium_commands/${commandId}.${field} → SUCCESS (${duration}ms)`);

      return { success: true, command: commandDoc.data() };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[ERROR] Failed to update premium command (${duration}ms):`, error);
      return { success: false, message: 'Error al actualizar el comando premium' };
    }
  }

  /**
   * Elimina un comando premium
   * @param {string} groupId - ID del grupo
   * @param {string} commandId - ID del comando
   * @returns {Promise<Object>} - Resultado de la eliminación
   */
  static async deleteCommand(groupId, commandId) {
    const startTime = Date.now();
    const db = getFirestore();
    const normalized = normalizeGroupId(groupId);

    try {
      const commandRef = db.collection('groups')
        .doc(normalized)
        .collection('premium_commands')
        .doc(commandId);

      const commandDoc = await commandRef.get();
      
      if (!commandDoc.exists) {
        return { success: false, message: 'Comando premium no encontrado' };
      }

      const commandData = commandDoc.data();
      await commandRef.delete();

      const duration = Date.now() - startTime;
      logger.info(`[${new Date().toISOString()}] [DELETE] groups/${normalized}/premium_commands/${commandId} → SUCCESS (${duration}ms)`);

      return { success: true, command: commandData };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[ERROR] Failed to delete premium command (${duration}ms):`, error);
      return { success: false, message: 'Error al eliminar el comando premium' };
    }
  }
}

export default PremiumHandler;
