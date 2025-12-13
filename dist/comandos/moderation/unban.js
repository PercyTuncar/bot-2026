import GroupRepository from '../../repositories/GroupRepository.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
export default {
    name: 'unban',
    description: 'Remover a un usuario de la lista de baneados',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, args, groupId, replyJid }) {
        const phone = args[0];
        if (!phone) {
            await sock.sendMessage(replyJid, formatError('Debes especificar el número de teléfono'));
            return;
        }
        try {
            const groupConfig = await GroupRepository.getConfig(groupId);
            const bannedList = groupConfig?.bannedUsers || [];
            if (!bannedList.includes(phone)) {
                await sock.sendMessage(replyJid, formatError('Este usuario no está en la lista de baneados'));
                return;
            }
            const newBannedList = bannedList.filter(p => p !== phone);
            await GroupRepository.updateConfig(groupId, {
                ...groupConfig,
                bannedUsers: newBannedList
            });
            await sock.sendMessage(replyJid, formatSuccess(`${EMOJIS.CHECK} Usuario ${phone} removido de la lista de baneados`));
            logger.info(`Usuario ${phone} desbaneado del grupo ${groupId}`);
        }
        catch (error) {
            logger.error('Error in unban command:', error);
            await sock.sendMessage(replyJid, formatError('Error al desbanear usuario'));
        }
    }
};
