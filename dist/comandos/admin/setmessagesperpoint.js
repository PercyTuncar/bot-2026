import GroupRepository from '../../repositories/GroupRepository.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
export default {
    name: 'setmessagesperpoint',
    description: 'Cambiar cantidad de mensajes necesarios para 1 punto',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, args, groupId, replyJid }) {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            await sock.sendMessage(replyJid, formatError('Debes especificar un número entre 1 y 100\nEjemplo: .setmessagesperpoint 15'));
            return;
        }
        try {
            const group = await GroupRepository.getById(groupId);
            const groupConfig = await GroupRepository.getConfig(groupId) || group?.config || {};
            const newConfig = {
                ...groupConfig,
                messagesPerPoint: amount
            };
            await GroupRepository.updateConfig(groupId, newConfig);
            await sock.sendMessage(replyJid, formatSuccess(`${EMOJIS.MESSAGE} Configuración actualizada\n\nAhora se necesitan ${amount} mensajes para 1 punto`));
            logger.info(`Mensajes por punto cambiado a ${amount} en grupo ${groupId}`);
        }
        catch (error) {
            logger.error('Error in setmessagesperpoint command:', error);
            await sock.sendMessage(replyJid, formatError('Error al cambiar configuración'));
        }
    }
};
