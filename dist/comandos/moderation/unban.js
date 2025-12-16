import GroupRepository from '../../repositories/GroupRepository.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';
export default {
    name: 'unban',
    description: 'Remover a un usuario de la lista de baneados',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, groupId, replyJid }) {
        try {
            await reactLoading(sock, msg);
            const phone = args[0];
            if (!phone) {
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} Debes especificar el número de teléfono`);
                return;
            }
            const groupConfig = await GroupRepository.getConfig(groupId);
            const bannedList = groupConfig?.bannedUsers || [];
            if (!bannedList.includes(phone)) {
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} Este usuario no está en la lista de baneados`);
                return;
            }
            const newBannedList = bannedList.filter(p => p !== phone);
            await GroupRepository.updateConfig(groupId, {
                ...groupConfig,
                bannedUsers: newBannedList
            });
            await reply(sock, msg, `${EMOJIS.SUCCESS} Usuario ${phone} removido de la lista de baneados`);
            await reactSuccess(sock, msg);
            logger.info(`Usuario ${phone} desbaneado del grupo ${groupId}`);
        }
        catch (error) {
            await reactError(sock, msg);
            await reply(sock, msg, `${EMOJIS.ERROR} Error al desbanear usuario: ${error.message}`);
            logger.error('Error in unban command:', error);
        }
    }
};
