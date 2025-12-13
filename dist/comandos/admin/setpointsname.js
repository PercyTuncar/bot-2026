import GroupRepository from '../../repositories/GroupRepository.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
export default {
    name: 'setpointsname',
    description: 'Cambiar nombre de los puntos',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, args, groupId, replyJid }) {
        const name = args[0];
        if (!name) {
            await sock.sendMessage(replyJid, formatError('Debes especificar un nombre\nEjemplo: .setpointsname coins'));
            return;
        }
        try {
            const group = await GroupRepository.getById(groupId);
            const groupConfig = await GroupRepository.getConfig(groupId) || group?.config || {};
            const newConfig = {
                ...groupConfig,
                pointsName: name
            };
            await GroupRepository.updateConfig(groupId, newConfig);
            await sock.sendMessage(replyJid, formatSuccess(`${EMOJIS.POINTS} Nombre de puntos cambiado a: ${name}`));
            logger.info(`Nombre de puntos cambiado a "${name}" en grupo ${groupId}`);
        }
        catch (error) {
            logger.error('Error in setpointsname command:', error);
            await sock.sendMessage(replyJid, formatError('Error al cambiar nombre de puntos'));
        }
    }
};
