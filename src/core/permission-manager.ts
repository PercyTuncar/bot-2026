import { config } from '../config/environment.js';
import { normalizePhone } from '../utils/phone.js';
import ConfigRepository from '../repositories/ConfigRepository.js';
import { PERMISSION_LEVELS, PERMISSION_NAMES } from '../config/constants.js';
import { extractParticipants } from '../utils/group.js';

/**
 * Extrae el número de teléfono de un LID
 * @param {string} lid - LID en formato "91401836589109@lid"
 * @returns {string} Phone normalizado
 */
function extractPhoneFromLid(lid) {
  if (!lid || !lid.includes('@lid')) return lid;
  // Extraer número antes de @lid (ej: "91401836589109@lid" → "91401836589109")
  return lid.split('@')[0];
}

export class PermissionManager {
  /**
   * Verifica permisos de un usuario
   */
  static async checkPermissions(userPhone, groupId, sock) {
    // userPhone ya viene como userId válido (phone o LID) desde command-dispatcher
    const userId = userPhone;
    
    // 0. Verificar si es el bot mismo (siempre tiene permisos de owner)
    if (sock?.info?.wid?.user) {
      const botPhone = normalizePhone(sock.info.wid.user);
      // Comparar userId directamente (puede ser LID o phone)
      if (userId.includes('@lid')) {
        // Si es LID, comparar el número base
        const lidNumber = userId.split('@')[0];
        if (lidNumber === botPhone) {
          return { level: PERMISSION_LEVELS.OWNER, name: PERMISSION_NAMES[PERMISSION_LEVELS.OWNER] };
        }
      } else if (userId === botPhone) {
        // Si es phone normalizado, comparar directo
        return { level: PERMISSION_LEVELS.OWNER, name: PERMISSION_NAMES[PERMISSION_LEVELS.OWNER] };
      }
    }
    
    // 1. Verificar Owner
    const globalConfig = await ConfigRepository.getGlobal();
    // Comparar userId (puede ser LID o phone) con ownerPhone (siempre phone normalizado)
    const matchesOwner = userId.includes('@lid') 
      ? extractPhoneFromLid(userId) === globalConfig?.ownerPhone
      : userId === globalConfig?.ownerPhone;
    
    if (matchesOwner) {
      return { level: PERMISSION_LEVELS.OWNER, name: PERMISSION_NAMES[PERMISSION_LEVELS.OWNER] };
    }

    // 2. Verificar Global Admin
    const adminPhones = globalConfig?.adminPhones || config.permissions.adminPhones || [];
    const matchesAdmin = userId.includes('@lid')
      ? adminPhones.includes(extractPhoneFromLid(userId))
      : adminPhones.includes(userId);
    
    if (matchesAdmin) {
      return { level: PERMISSION_LEVELS.GLOBAL_ADMIN, name: PERMISSION_NAMES[PERMISSION_LEVELS.GLOBAL_ADMIN] };
    }

    // 3. Verificar Group Admin (si es en un grupo)
    if (groupId && sock) {
      try {
        const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
        const chat = await sock.getChatById(targetJid);
        if (!chat || !chat.isGroup) {
          return { level: PERMISSION_LEVELS.USER, name: PERMISSION_NAMES[PERMISSION_LEVELS.USER] };
        }
        
        // Buscar participante comparando userId (puede ser LID) con participant id
        const participant = extractParticipants(chat).find(p => {
          const participantPhone = normalizePhone(p?.id?._serialized || p?.id);
          // Si userId es LID, comparar extrayendo el phone
          if (userId.includes('@lid')) {
            return participantPhone === extractPhoneFromLid(userId);
          }
          // Si userId es phone, comparar directo
          return participantPhone === userId;
        });

        if (participant && (participant.isAdmin || participant.isSuperAdmin)) {
          return { level: PERMISSION_LEVELS.GROUP_ADMIN, name: PERMISSION_NAMES[PERMISSION_LEVELS.GROUP_ADMIN] };
        }
      } catch (error) {
        // Si falla, continuar con usuario regular
      }
    }

    // 4. Usuario regular
    return { level: PERMISSION_LEVELS.USER, name: PERMISSION_NAMES[PERMISSION_LEVELS.USER] };
  }

  /**
   * Verifica si un usuario tiene el nivel de permisos requerido
   */
  static async hasPermission(userPhone, requiredLevel, groupId, sock) {
    const permissions = await this.checkPermissions(userPhone, groupId, sock);
    return permissions.level >= requiredLevel;
  }
}

export default PermissionManager;

