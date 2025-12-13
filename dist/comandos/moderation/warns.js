import WarningService from '../../services/WarningService.js';
import MemberRepository from '../../repositories/MemberRepository.js';
import ConfigService from '../../services/ConfigService.js';
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
export default {
    name: 'warns',
    description: 'Ver advertencias de un usuario (menciona o responde a su mensaje)',
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
            logger.warn(`[WARNS] Could not get chat: ${e.message}`);
        }
        const target = await getTargetUser(msg, chat);
        let targetPhone;
        let targetName;
        let mentionJid;
        if (target) {
            targetPhone = target.isLid ? target.phone : (normalizePhone(target.phone) || target.phone);
            targetName = target.name || targetPhone;
            mentionJid = target.jid;
            logger.info(`[WARNS] Target: phone=${targetPhone}, name=${targetName}, method=${target.method}, isLid=${target.isLid}`);
        }
        else {
            targetPhone = normalizePhone(userPhone) || userPhone;
            targetName = msg.pushName || targetPhone;
            mentionJid = `${targetPhone}@s.whatsapp.net`;
            logger.info(`[WARNS] No target specified, showing own warnings: ${targetPhone}`);
        }
        try {
            const warnings = await WarningService.getWarnings(groupId, targetPhone);
            const found = await MemberRepository.findByPhoneOrLid(groupId, targetPhone, targetPhone);
            const member = found ? found.data : null;
            const displayName = member?.displayName || targetName;
            if (!warnings || warnings.total === 0) {
                await sock.sendMessage(replyJid, `${EMOJIS.INFO} @${targetPhone} (${displayName}) no tiene advertencias`, { mentions: [mentionJid] });
                return;
            }
            const config = await ConfigService.getGroupConfig(groupId);
            const maxWarnings = config?.limits?.maxWarnings || 3;
            let response = `${EMOJIS.WARNING} *ADVERTENCIAS DE @${targetPhone}*\n`;
            response += `👤 *Nombre:* ${displayName}\n\n`;
            response += `📊 *Total:* ${warnings.total}/${maxWarnings} advertencia${warnings.total > 1 ? 's' : ''}\n`;
            if (warnings.totalExits > 0) {
                response += `🚪 *Salidas del grupo:* ${warnings.totalExits}\n`;
            }
            response += `\n`;
            response += `📋 *Historial completo:*\n`;
            const warnEvents = warnings.history.filter(w => w.type === 'WARN' || !w.type);
            warnEvents.forEach((w, i) => {
                const timestamp = w.timestamp;
                const date = timestamp?.toDate ? timestamp.toDate() : (timestamp ? new Date(timestamp) : new Date());
                response += `${i + 1}. ${w.reason || 'Sin razón'}\n`;
                response += `   Por: ${w.byName || 'Desconocido'}\n`;
                response += `   Fecha: ${date.toLocaleDateString('es-AR')} ${date.toLocaleTimeString('es-AR')}\n\n`;
            });
            const remaining = maxWarnings - warnings.total;
            if (remaining > 0) {
                response += `${EMOJIS.WARNING} Le quedan ${remaining} advertencia${remaining > 1 ? 's' : ''} antes de ser expulsado automáticamente.`;
            }
            else {
                response += `🚫 Ha alcanzado el límite de advertencias y será expulsado.`;
            }
            await sock.sendMessage(replyJid, response, { mentions: [mentionJid] });
        }
        catch (error) {
            logger.error('[WARNS] Error in warns command:', error);
            await sock.sendMessage(replyJid, formatError('Error al obtener advertencias'));
        }
    }
};
