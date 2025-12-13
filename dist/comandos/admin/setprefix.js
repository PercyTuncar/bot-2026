import GroupRepository from '../../repositories/GroupRepository.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
export default {
    name: 'setprefix',
    description: 'Cambiar prefijo de comandos del grupo',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, args, groupId, replyJid }) {
        const prefix = args[0];
        if (!prefix || prefix.length > 3) {
            await sock.sendMessage(replyJid, formatError('Debes especificar un prefijo válido (máx. 3 caracteres)\nEjemplo: .setprefix !'));
            return;
        }
        try {
            const group = await GroupRepository.getById(groupId);
            const groupConfig = await GroupRepository.getConfig(groupId) || group?.config || {};
            const newConfig = {
                ...groupConfig,
                prefix
            };
            await GroupRepository.updateConfig(groupId, newConfig);
            await sock.sendMessage(replyJid, formatSuccess(`${EMOJIS.CHECK} Prefijo cambiado a: ${prefix}\n\nAhora usa: ${prefix}help`));
            logger.info(`Prefijo cambiado a "${prefix}" en grupo ${groupId}`);
        }
        catch (error) {
            logger.error('Error in setprefix command:', error);
            await sock.sendMessage(replyJid, formatError('Error al cambiar prefijo'));
        }
    }
};
