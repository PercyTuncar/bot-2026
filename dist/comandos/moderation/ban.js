import MemberRepository from '../../repositories/MemberRepository.js';
import GroupRepository from '../../repositories/GroupRepository.js';
import { getFirstMention } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
export default {
    name: 'ban',
    description: 'Banear a un usuario (expulsar y agregar a lista negra)',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, groupId, groupJid, userPhone, replyJid }) {
        const mentionedPhone = getFirstMention(msg);
        if (!mentionedPhone) {
            await sock.sendMessage(replyJid, formatError('Debes mencionar a un usuario'));
            return;
        }
        const normalized = normalizePhone(mentionedPhone);
        const normalizedAdmin = normalizePhone(userPhone);
        if (normalized === normalizedAdmin) {
            await sock.sendMessage(replyJid, formatError('No puedes banearte a ti mismo'));
            return;
        }
        const reason = args.slice(1).join(' ') || 'Sin motivo especificado';
        try {
            await MemberRepository.update(groupId, normalized, {
                isMember: false,
                leftAt: new Date(),
                isBanned: true,
                bannedAt: new Date(),
                bannedBy: normalizedAdmin,
                bannedReason: reason
            });
            const groupConfig = await GroupRepository.getConfig(groupId);
            const bannedList = groupConfig?.bannedUsers || [];
            if (!bannedList.includes(normalized)) {
                bannedList.push(normalized);
                await GroupRepository.updateConfig(groupId, {
                    ...groupConfig,
                    bannedUsers: bannedList
                });
            }
            const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);
            try {
                const chat = await sock.getChatById(targetJid);
                await chat.removeParticipants([normalized + '@s.whatsapp.net']);
            }
            catch (kickError) {
                logger.warn(`No se pudo expulsar a ${normalized}, pero se marcó como baneado`);
            }
            await sock.sendMessage(targetJid, `${EMOJIS.WARNING} @${normalized} ha sido BANEADO\n\nMotivo: ${reason}\n\nNo podrá volver a unirse al grupo.`, { mentions: [normalized + '@s.whatsapp.net'] });
            logger.info(`Usuario ${normalized} baneado del grupo ${groupId} por ${normalizedAdmin}`);
        }
        catch (error) {
            logger.error('Error in ban command:', error);
            await sock.sendMessage(replyJid, formatError('Error al banear usuario'));
        }
    }
};
