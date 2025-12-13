import MemberRepository from '../../repositories/MemberRepository.js';
import GroupRepository from '../../repositories/GroupRepository.js';
import { getFirstMention } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
export default {
    name: 'setlevel',
    description: 'Cambiar nivel de un usuario manualmente',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, groupId, replyJid }) {
        const mentionedPhone = getFirstMention(msg);
        if (!mentionedPhone) {
            await sock.sendMessage(replyJid, formatError('Debes mencionar a un usuario'));
            return;
        }
        const level = parseInt(args[1]);
        if (isNaN(level) || level < 1) {
            await sock.sendMessage(replyJid, formatError('Debes especificar un nivel válido\nEjemplo: .setlevel @usuario 3'));
            return;
        }
        try {
            const normalized = normalizePhone(mentionedPhone);
            const found = await MemberRepository.findByPhoneOrLid(groupId, normalized, normalized);
            const member = found ? found.data : null;
            const docId = found?.docId || normalized;
            if (!member) {
                await sock.sendMessage(replyJid, formatError('Usuario no encontrado'));
                return;
            }
            const group = await GroupRepository.getById(groupId);
            const groupConfig = await GroupRepository.getConfig(groupId);
            const levels = groupConfig?.levels || group?.config?.levels;
            const targetLevel = levels?.find(l => l.level === level);
            if (!targetLevel) {
                await sock.sendMessage(replyJid, formatError(`Nivel ${level} no existe en la configuración`));
                return;
            }
            await MemberRepository.update(groupId, docId, {
                currentLevel: level,
                points: targetLevel.minPoints
            });
            await sock.sendMessage(replyJid, formatSuccess(`${EMOJIS.STAR} Nivel de @${normalized} cambiado a ${level} - ${targetLevel.name}\n\nPuntos ajustados: ${targetLevel.minPoints}`), { mentions: [normalized + '@s.whatsapp.net'] });
            logger.info(`Nivel de ${normalized} cambiado a ${level} en grupo ${groupId}`);
        }
        catch (error) {
            logger.error('Error in setlevel command:', error);
            await sock.sendMessage(replyJid, formatError('Error al cambiar nivel'));
        }
    }
};
