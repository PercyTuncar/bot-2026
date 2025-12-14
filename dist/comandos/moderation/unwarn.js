import WarningService from '../../services/WarningService.js';
import ConfigService from '../../services/ConfigService.js';
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
export default {
    name: 'unwarn',
    description: 'Quitar última advertencia a un usuario (menciona o responde a su mensaje)',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, groupId, userPhone, replyJid }) {
        let chat = null;
        try {
            chat = await msg.getChat();
        }
        catch (e) {
            logger.warn(`[UNWARN] Could not get chat: ${e.message}`);
        }
        const target = await getTargetUser(msg, chat);
        if (!target) {
            await sock.sendMessage(replyJid, formatError('Debes mencionar a un usuario (@usuario) o responder a su mensaje con .unwarn'));
            return;
        }
        const targetPhone = target.isLid ? target.phone : (normalizePhone(target.phone) || target.phone);
        const normalizedAdmin = normalizePhone(userPhone) || userPhone;
        const targetName = target.name || targetPhone;
        const mentionJid = target.jid;
        logger.info(`[UNWARN] Target: phone=${targetPhone}, name=${targetName}, method=${target.method}, isLid=${target.isLid}`);
        try {
            const result = await WarningService.resetWarnings(groupId, targetPhone, normalizedAdmin, msg.pushName || normalizedAdmin);
            const config = await ConfigService.getGroupConfig(groupId);
            const maxWarnings = config?.limits?.maxWarnings || 3;
            let unwarnMessage = `\n\n✅ *ADVERTENCIAS RESETEADAS* ✅\n\n`;
            unwarnMessage += `👤 *Usuario:* @${target.phone}\n`;
            unwarnMessage += `📛 *Nombre:* ${targetName}\n\n`;
            unwarnMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
            unwarnMessage += `📊 *Estado actual:*\n`;
            unwarnMessage += `> _Advertencias: 0/${maxWarnings}_\n`;
            unwarnMessage += `> _Historial limpio_\n`;
            unwarnMessage += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            unwarnMessage += `🎉 _El usuario tiene un nuevo comienzo_`;
            await sock.sendMessage(replyJid, unwarnMessage, { mentions: [mentionJid] });
        }
        catch (error) {
            logger.error('[UNWARN] Error in unwarn command:', error);
            await sock.sendMessage(replyJid, formatError(error.message || 'Error al quitar advertencia'));
        }
    }
};
