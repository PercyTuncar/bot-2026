import { formatSuccess, formatError } from '../../utils/formatter.js';
import GroupRepository from '../../repositories/GroupRepository.js';
import logger from '../../lib/logger.js';
export default {
    name: 'antilink',
    description: 'Activar/desactivar filtro de enlaces',
    category: 'moderation',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, args, groupId, replyJid }) {
        const action = args[0]?.toLowerCase();
        if (!['on', 'off'].includes(action)) {
            await sock.sendMessage(replyJid, formatError('Uso: .antilink on | off'));
            return;
        }
        try {
            const config = await GroupRepository.getConfig(groupId) || {};
            const newConfig = {
                ...config,
                moderation: {
                    ...(config.moderation || {}),
                    antiLink: action === 'on'
                }
            };
            await GroupRepository.updateConfig(groupId, newConfig);
            await sock.sendMessage(replyJid, formatSuccess(`AntiLink ha sido ${action === 'on' ? 'ACTIVADO ✅' : 'DESACTIVADO ❌'}`));
        }
        catch (error) {
            logger.error('[ANTILINK] Error:', error);
            await sock.sendMessage(replyJid, formatError('Error al actualizar configuración'));
        }
    }
};
