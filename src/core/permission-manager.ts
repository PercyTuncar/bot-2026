import { config } from '../config/environment.js';
import { normalizePhone } from '../utils/phone.js';
import ConfigRepository from '../repositories/ConfigRepository.js';
import { PERMISSION_LEVELS, PERMISSION_NAMES } from '../config/constants.js';
import logger from '../lib/logger.js';

/**
 * Extrae el número de teléfono limpio (sin sufijos)
 */
function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  return phone
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace('@lid', '')
    .split(':')[0]
    .replace(/\D/g, ''); // Remove non-digits
}

export class PermissionManager {
  /**
   * Verifica permisos de un usuario
   * Compatible con Baileys
   */
  static async checkPermissions(userPhone: string, groupId: string | null, sock: any) {
    const cleanUserPhone = cleanPhoneNumber(userPhone);

    logger.debug(`[Permissions] Checking for userPhone=${userPhone}, clean=${cleanUserPhone}, groupId=${groupId}`);

    // 0. Verificar si es el bot mismo (siempre tiene permisos de owner)
    // Baileys: sock.user?.id contiene el JID del bot
    if (sock?.user?.id) {
      const botJid = sock.user.id;
      const botPhone = cleanPhoneNumber(botJid);

      logger.debug(`[Permissions] Bot phone: ${botPhone}`);

      if (cleanUserPhone === botPhone) {
        logger.info(`[Permissions] ✅ User is bot itself → OWNER`);
        return { level: PERMISSION_LEVELS.OWNER, name: PERMISSION_NAMES[PERMISSION_LEVELS.OWNER] };
      }
    }

    // 1. Verificar Owner desde config
    const globalConfig = await ConfigRepository.getGlobal();
    const ownerPhone = cleanPhoneNumber(globalConfig?.ownerPhone || '');

    logger.debug(`[Permissions] Owner phone from config: ${ownerPhone}`);

    if (ownerPhone && cleanUserPhone === ownerPhone) {
      logger.info(`[Permissions] ✅ User matches owner → OWNER`);
      return { level: PERMISSION_LEVELS.OWNER, name: PERMISSION_NAMES[PERMISSION_LEVELS.OWNER] };
    }

    // 2. Verificar Global Admin
    const adminPhones = (globalConfig?.adminPhones || config.permissions.adminPhones || [])
      .map(p => cleanPhoneNumber(p));

    if (adminPhones.includes(cleanUserPhone)) {
      logger.info(`[Permissions] ✅ User is global admin → GLOBAL_ADMIN`);
      return { level: PERMISSION_LEVELS.GLOBAL_ADMIN, name: PERMISSION_NAMES[PERMISSION_LEVELS.GLOBAL_ADMIN] };
    }

    // 3. Verificar Group Admin (si es en un grupo)
    if (groupId && sock) {
      try {
        const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
        const metadata = await sock.groupMetadata(groupJid);

        if (metadata?.participants) {
          // Buscar participante que coincida con el userPhone
          const participant = metadata.participants.find((p: any) => {
            const participantPhone = cleanPhoneNumber(p.id);
            return participantPhone === cleanUserPhone;
          });

          if (participant && (participant.admin === 'admin' || participant.admin === 'superadmin')) {
            logger.info(`[Permissions] ✅ User is group admin → GROUP_ADMIN`);
            return { level: PERMISSION_LEVELS.GROUP_ADMIN, name: PERMISSION_NAMES[PERMISSION_LEVELS.GROUP_ADMIN] };
          }
        }
      } catch (error: any) {
        logger.debug(`[Permissions] Error getting group metadata: ${error.message}`);
        // Si falla, continuar con usuario regular
      }
    }

    // 4. Usuario regular
    logger.debug(`[Permissions] User is regular → USER`);
    return { level: PERMISSION_LEVELS.USER, name: PERMISSION_NAMES[PERMISSION_LEVELS.USER] };
  }

  /**
   * Verifica si un usuario tiene el nivel de permisos requerido
   */
  static async hasPermission(userPhone: string, requiredLevel: number, groupId: string | null, sock: any) {
    const permissions = await this.checkPermissions(userPhone, groupId, sock);
    return permissions.level >= requiredLevel;
  }
}

export default PermissionManager;
