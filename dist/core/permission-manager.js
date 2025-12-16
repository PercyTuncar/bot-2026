import { config } from '../config/environment.js';
import ConfigRepository from '../repositories/ConfigRepository.js';
import { PERMISSION_LEVELS, PERMISSION_NAMES } from '../config/constants.js';
import logger from '../lib/logger.js';
function cleanPhoneNumber(phone) {
    if (!phone)
        return '';
    return phone
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .replace('@lid', '')
        .split(':')[0]
        .replace(/\D/g, '');
}
export class PermissionManager {
    static async checkPermissions(userPhone, groupId, sock) {
        const cleanUserPhone = cleanPhoneNumber(userPhone);
        logger.debug(`[Permissions] Checking for userPhone=${userPhone}, clean=${cleanUserPhone}, groupId=${groupId}`);
        if (sock?.user?.id) {
            const botJid = sock.user.id;
            const botPhone = cleanPhoneNumber(botJid);
            logger.debug(`[Permissions] Bot phone: ${botPhone}`);
            if (cleanUserPhone === botPhone) {
                logger.info(`[Permissions] ✅ User is bot itself → OWNER`);
                return { level: PERMISSION_LEVELS.OWNER, name: PERMISSION_NAMES[PERMISSION_LEVELS.OWNER] };
            }
        }
        const globalConfig = await ConfigRepository.getGlobal();
        const ownerPhone = cleanPhoneNumber(globalConfig?.ownerPhone || '');
        logger.debug(`[Permissions] Owner phone from config: ${ownerPhone}`);
        if (ownerPhone && cleanUserPhone === ownerPhone) {
            logger.info(`[Permissions] ✅ User matches owner → OWNER`);
            return { level: PERMISSION_LEVELS.OWNER, name: PERMISSION_NAMES[PERMISSION_LEVELS.OWNER] };
        }
        const adminPhones = (globalConfig?.adminPhones || config.permissions.adminPhones || [])
            .map(p => cleanPhoneNumber(p));
        if (adminPhones.includes(cleanUserPhone)) {
            logger.info(`[Permissions] ✅ User is global admin → GLOBAL_ADMIN`);
            return { level: PERMISSION_LEVELS.GLOBAL_ADMIN, name: PERMISSION_NAMES[PERMISSION_LEVELS.GLOBAL_ADMIN] };
        }
        if (groupId && sock) {
            try {
                const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
                const metadata = await sock.groupMetadata(groupJid);
                if (metadata?.participants) {
                    const participant = metadata.participants.find((p) => {
                        const participantPhone = cleanPhoneNumber(p.id);
                        return participantPhone === cleanUserPhone;
                    });
                    if (participant && (participant.admin === 'admin' || participant.admin === 'superadmin')) {
                        logger.info(`[Permissions] ✅ User is group admin → GROUP_ADMIN`);
                        return { level: PERMISSION_LEVELS.GROUP_ADMIN, name: PERMISSION_NAMES[PERMISSION_LEVELS.GROUP_ADMIN] };
                    }
                }
            }
            catch (error) {
                logger.debug(`[Permissions] Error getting group metadata: ${error.message}`);
            }
        }
        logger.debug(`[Permissions] User is regular → USER`);
        return { level: PERMISSION_LEVELS.USER, name: PERMISSION_NAMES[PERMISSION_LEVELS.USER] };
    }
    static async hasPermission(userPhone, requiredLevel, groupId, sock) {
        const permissions = await this.checkPermissions(userPhone, groupId, sock);
        return permissions.level >= requiredLevel;
    }
}
export default PermissionManager;
