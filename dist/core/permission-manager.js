import { config } from '../config/environment.js';
import { normalizePhone } from '../utils/phone.js';
import ConfigRepository from '../repositories/ConfigRepository.js';
import { PERMISSION_LEVELS, PERMISSION_NAMES } from '../config/constants.js';
import { extractParticipants } from '../utils/group.js';
function extractPhoneFromLid(lid) {
    if (!lid || !lid.includes('@lid'))
        return lid;
    return lid.split('@')[0];
}
export class PermissionManager {
    static async checkPermissions(userPhone, groupId, sock) {
        const userId = userPhone;
        if (sock?.info?.wid?.user) {
            const botPhone = normalizePhone(sock.info.wid.user);
            if (userId.includes('@lid')) {
                const lidNumber = userId.split('@')[0];
                if (lidNumber === botPhone) {
                    return { level: PERMISSION_LEVELS.OWNER, name: PERMISSION_NAMES[PERMISSION_LEVELS.OWNER] };
                }
            }
            else if (userId === botPhone) {
                return { level: PERMISSION_LEVELS.OWNER, name: PERMISSION_NAMES[PERMISSION_LEVELS.OWNER] };
            }
        }
        const globalConfig = await ConfigRepository.getGlobal();
        const matchesOwner = userId.includes('@lid')
            ? extractPhoneFromLid(userId) === globalConfig?.ownerPhone
            : userId === globalConfig?.ownerPhone;
        if (matchesOwner) {
            return { level: PERMISSION_LEVELS.OWNER, name: PERMISSION_NAMES[PERMISSION_LEVELS.OWNER] };
        }
        const adminPhones = globalConfig?.adminPhones || config.permissions.adminPhones || [];
        const matchesAdmin = userId.includes('@lid')
            ? adminPhones.includes(extractPhoneFromLid(userId))
            : adminPhones.includes(userId);
        if (matchesAdmin) {
            return { level: PERMISSION_LEVELS.GLOBAL_ADMIN, name: PERMISSION_NAMES[PERMISSION_LEVELS.GLOBAL_ADMIN] };
        }
        if (groupId && sock) {
            try {
                const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
                const chat = await sock.getChatById(targetJid);
                if (!chat || !chat.isGroup) {
                    return { level: PERMISSION_LEVELS.USER, name: PERMISSION_NAMES[PERMISSION_LEVELS.USER] };
                }
                const participant = extractParticipants(chat).find(p => {
                    const participantPhone = normalizePhone(p?.id?._serialized || p?.id);
                    if (userId.includes('@lid')) {
                        return participantPhone === extractPhoneFromLid(userId);
                    }
                    return participantPhone === userId;
                });
                if (participant && (participant.isAdmin || participant.isSuperAdmin)) {
                    return { level: PERMISSION_LEVELS.GROUP_ADMIN, name: PERMISSION_NAMES[PERMISSION_LEVELS.GROUP_ADMIN] };
                }
            }
            catch (error) {
            }
        }
        return { level: PERMISSION_LEVELS.USER, name: PERMISSION_NAMES[PERMISSION_LEVELS.USER] };
    }
    static async hasPermission(userPhone, requiredLevel, groupId, sock) {
        const permissions = await this.checkPermissions(userPhone, groupId, sock);
        return permissions.level >= requiredLevel;
    }
}
export default PermissionManager;
