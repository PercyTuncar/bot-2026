import { extractParticipants } from '../../utils/group.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
export default {
    name: 'tagadmins',
    description: 'Mencionar solo a los administradores del grupo',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 15,
    async execute({ sock, msg, args, groupId, groupJid, replyJid }) {
        try {
            const message = args.join(' ') || '¡Atención administradores!';
            const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);
            const chat = await sock.getChatById(targetJid);
            if (!chat || !chat.isGroup) {
                await sock.sendMessage(replyJid, formatError('Este comando solo funciona en grupos'));
                return;
            }
            const participants = extractParticipants(chat);
            const admins = participants.filter(p => p?.isAdmin || p?.isSuperAdmin);
            if (admins.length === 0) {
                await sock.sendMessage(replyJid, formatError('No se encontraron administradores'));
                return;
            }
            const mentions = admins.map(p => p?.id?._serialized || p?.id);
            let text = `${EMOJIS.CROWN} *MENCIÓN A ADMINISTRADORES*\n\n${message}\n\n`;
            mentions.forEach(mention => {
                const phone = normalizePhone(mention);
                text += `@${phone} `;
            });
            await sock.sendMessage(targetJid, text, { mentions });
            logger.info(`Tagadmins ejecutado en grupo ${targetJid} - ${mentions.length} menciones`);
        }
        catch (error) {
            logger.error('Error in tagadmins command:', error);
            await sock.sendMessage(replyJid, formatError('Error al mencionar administradores'));
        }
    }
};
