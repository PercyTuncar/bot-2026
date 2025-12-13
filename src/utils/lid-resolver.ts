/**
 * Utilidades para resolver LIDs (Linked IDs) a números reales
 * Los LIDs son identificadores temporales de dispositivos vinculados
 */

import logger from '../lib/logger.js';
import { normalizePhone, normalizeGroupId } from './phone.js';

// Cache de resolución LID → número real (expira cada 5 minutos)
const lidCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Resuelve un LID a su número real consultando metadatos del grupo
 * Adaptado para whatsapp-web.js
 * @param {object} client - Cliente de whatsapp-web.js
 * @param {string} groupId - ID del grupo
 * @param {string} lid - LID a resolver (ej: "91401836589109@lid")
 * @returns {Promise<string>} - Número real o vacío si no se puede resolver
 */
export async function resolveLidToPhone(client, groupId, lid) {
  if (!client || !groupId || !lid) return '';
  
  // Verificar cache
  const cacheKey = `${groupId}:${lid}`;
  const cached = lidCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.info(`✅ LID resuelto desde cache: ${lid} → ${cached.phone}`);
    return cached.phone;
  }

  try {
    // Obtener el chat/grupo con whatsapp-web.js
    const normalizedGroupId = normalizeGroupId(groupId);
    const groupJid = normalizedGroupId.includes('@') ? normalizedGroupId : `${normalizedGroupId}@g.us`;
    
    const chat = await client.getChatById(groupJid);
    
    if (!chat || !chat.isGroup) {
      logger.warn(`⚠️ Chat ${normalizedGroupId} no es un grupo o no existe`);
      return '';
    }

    // Obtener participantes
    const participants = chat.participants || [];
    
    // Extraer el prefijo del LID (la parte antes de @lid)
    const lidPrefix = lid.replace('@lid', '').replace(/[^\d]/g, '');
    
    logger.debug(`🔍 Buscando LID ${lid} (prefix: ${lidPrefix}) entre ${participants.length} participantes`);
    
    // ESTRATEGIA 1: Buscar coincidencia exacta de LID en participant.id
    for (const participant of participants) {
      const participantId = participant.id?._serialized || participant.id;
      
      if (participantId === lid) {
        // Si encontramos el LID en participantes, verificar si tiene nombre ahí mismo
        const rawName = participant.pushname || participant.notify || participant.name;
        if (rawName) {
             // Si tiene nombre, no devolvemos teléfono, pero podríamos cachear el nombre?
             // Por ahora, retornamos null porque esta función es para resolver a TELÉFONO
             // Pero logeamos que encontramos nombre
             logger.info(`ℹ️ LID encontrado en participantes con nombre: ${rawName}`);
        }
        // No retornamos el mismo LID como "teléfono real"
      }
    }
    
    // ESTRATEGIA 2: Buscar por prefijo numérico del LID
    for (const participant of participants) {
      const participantId = participant.id?._serialized || participant.id;
      const userPart = participant.id?.user || participantId.split('@')[0];
      
      // Si el participant contiene el prefijo del LID
      if (userPart && userPart.includes(lidPrefix)) {
        const realPhone = normalizePhone(userPart);
        if (realPhone && realPhone.length >= 8 && realPhone.length <= 15 && !realPhone.includes('@')) {
          lidCache.set(cacheKey, { phone: realPhone, timestamp: Date.now() });
          logger.info(`✅ LID resuelto (prefix match): ${lid} → ${realPhone}`);
          return realPhone;
        }
      }
    }
    
    // ESTRATEGIA 3: Si no se encuentra, listar los primeros 5 para debugging
    logger.warn(`⚠️ No se pudo resolver LID ${lid} en grupo ${normalizedGroupId}`);
    logger.debug(`Primeros 5 participantes: ${participants.slice(0, 5).map(p => p.id?._serialized || p.id).join(', ')}`);
    return '';
    
  } catch (error) {
    logger.error(`❌ Error al resolver LID ${lid}:`, error);
    return '';
  }
}

/**
 * Limpia el cache de LIDs (ejecutar periódicamente)
 */
export function clearLidCache() {
  const now = Date.now();
  let cleared = 0;
  
  for (const [key, value] of lidCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      lidCache.delete(key);
      cleared++;
    }
  }
  
  if (cleared > 0) {
    logger.info(`🧹 Cache de LIDs limpiado: ${cleared} entradas eliminadas`);
  }
}

// Limpiar cache cada 5 minutos
setInterval(clearLidCache, CACHE_TTL);

export default { resolveLidToPhone, clearLidCache };
