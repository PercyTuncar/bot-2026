/**
 * Utilidades para resolver LIDs (Linked IDs) a números reales
 * BAILEYS VERSION - Simplified without Puppeteer/window.Store dependencies
 * 
 * In Baileys, LID resolution is simpler because we use onWhatsApp() and
 * direct group metadata access instead of browser-based Store manipulation.
 */

import logger from '../lib/logger.js';
import { normalizePhone, normalizeGroupId } from './phone.js';

// Cache de resolución LID → número real (expira cada 5 minutos)
const lidCache = new Map<string, { phone: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Cache de nombres extraídos por LID
const lidNameCache = new Map<string, { name: string; timestamp: number }>();

/**
 * Resuelve un LID a su número real consultando metadatos del grupo
 * BAILEYS VERSION - usa groupMetadata y onWhatsApp
 * @param {object} sock - Socket de Baileys
 * @param {string} groupId - ID del grupo
 * @param {string} lid - LID a resolver (ej: "91401836589109@lid")
 * @returns {Promise<string>} - Número real o vacío si no se puede resolver
 */
export async function resolveLidToPhone(sock: any, groupId: string, lid: string): Promise<string> {
  if (!sock || !groupId || !lid) return '';

  // Verificar cache
  const cacheKey = `${groupId}:${lid}`;
  const cached = lidCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.info(`✅ LID resuelto desde cache: ${lid} → ${cached.phone}`);
    return cached.phone;
  }

  try {
    const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

    // Strategy 1: Check group metadata for participant info
    try {
      const metadata = await sock.groupMetadata(groupJid);

      if (metadata && metadata.participants) {
        // Extract numeric part from LID
        const lidPrefix = lid.split('@')[0].replace(/[^\d]/g, '');

        // Look for matching participant
        for (const participant of metadata.participants) {
          const participantId = participant.id || '';
          const userPart = participantId.split('@')[0].split(':')[0];

          if (participantId === lid || userPart.includes(lidPrefix)) {
            const realPhone = normalizePhone(userPart);
            if (realPhone && realPhone.length >= 8 && realPhone.length <= 15) {
              lidCache.set(cacheKey, { phone: realPhone, timestamp: Date.now() });
              logger.info(`✅ LID resuelto vía groupMetadata: ${lid} → ${realPhone}`);
              return realPhone;
            }
          }
        }
      }
    } catch (e: any) {
      logger.debug(`groupMetadata failed for LID resolution: ${e.message}`);
    }

    // Strategy 2: Try onWhatsApp with extracted number
    if (sock.onWhatsApp) {
      try {
        const numericPart = lid.split('@')[0].replace(/[^\d]/g, '');
        if (numericPart.length >= 8) {
          const result = await sock.onWhatsApp(numericPart);
          if (result && result[0] && result[0].exists) {
            const resolvedPhone = result[0].jid.split('@')[0];
            lidCache.set(cacheKey, { phone: resolvedPhone, timestamp: Date.now() });
            logger.info(`✅ LID resuelto vía onWhatsApp: ${lid} → ${resolvedPhone}`);
            return resolvedPhone;
          }
        }
      } catch (e: any) {
        logger.debug(`onWhatsApp failed for LID resolution: ${e.message}`);
      }
    }

    logger.warn(`⚠️ No se pudo resolver LID ${lid} en grupo ${groupId}`);
    return '';

  } catch (error) {
    logger.error(`❌ Error al resolver LID ${lid}:`, error);
    return '';
  }
}

/**
 * Obtiene el nombre cacheado para un LID (si existe)
 */
export function getCachedLidName(lid: string): string | null {
  const cached = lidNameCache.get(lid);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.name;
  }
  return null;
}

/**
 * Cachea un nombre para un LID
 */
export function cacheLidName(lid: string, name: string): void {
  if (lid && name) {
    lidNameCache.set(lid, { name, timestamp: Date.now() });
  }
}

/**
 * Limpia el cache de LIDs (ejecutar periódicamente)
 */
export function clearLidCache(): void {
  const now = Date.now();
  let cleared = 0;

  for (const [key, value] of lidCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      lidCache.delete(key);
      cleared++;
    }
  }

  for (const [key, value] of lidNameCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      lidNameCache.delete(key);
      cleared++;
    }
  }

  if (cleared > 0) {
    logger.info(`🧹 Cache de LIDs limpiado: ${cleared} entradas eliminadas`);
  }
}

// Limpiar cache cada 5 minutos
setInterval(clearLidCache, CACHE_TTL);

// DEPRECATED: Functions that relied on Puppeteer are removed
// forceLoadContactData - Not available in Baileys (no pupPage)
// forceGroupMetadataSync - Use sock.groupMetadata() directly instead
// extractParticipantNameAfterSync - Not needed, use groupMetadata directly

export default {
  resolveLidToPhone,
  clearLidCache,
  getCachedLidName,
  cacheLidName
};
